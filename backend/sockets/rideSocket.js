const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Driver = require('../models/Driver');
const Ride = require('../models/Ride');
const matchingEngine = require('../services/matchingEngine');
const logger = require('../utils/logger');

/**
 * Ride Socket Handler — manages real-time ride events
 * 
 * Events:
 * - driver:locationUpdate — driver emits location every 3-5 sec while online/on-trip
 * - ride:newRequest — server pushes to nearby available drivers
 * - ride:accepted — notify customer
 * - ride:statusUpdate — arrived/started/completed pushed to customer
 * - ride:driverLocation — stream driver's live position to customer during approach & trip
 */

const initRideSocket = (io) => {
  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.role = decoded.role;

      // Verify entity exists
      if (decoded.role === 'customer') {
        const user = await User.findById(decoded.id);
        if (!user || user.isBlocked) {
          return next(new Error('User not found or blocked'));
        }
        socket.entity = user;
      } else if (decoded.role === 'driver') {
        const driver = await Driver.findById(decoded.id);
        if (!driver || driver.isBlocked) {
          return next(new Error('Driver not found or blocked'));
        }
        socket.entity = driver;
      } else if (decoded.role === 'admin') {
        // Admin can connect for live monitoring
        socket.entity = { _id: decoded.id, role: 'admin' };
      } else {
        return next(new Error('Invalid role'));
      }

      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} (${socket.role}:${socket.userId})`);

    // Register socket in matching engine
    if (socket.role === 'driver') {
      matchingEngine.registerDriverSocket(socket.userId, socket.id);
    } else if (socket.role === 'customer') {
      matchingEngine.registerCustomerSocket(socket.userId, socket.id);
    }

    // Join role-specific room
    socket.join(`role:${socket.role}`);
    socket.join(`user:${socket.userId}`);

    // --- Driver events ---

    // Driver location update (every 3-5 sec while online/on-trip)
    socket.on('driver:locationUpdate', async (data) => {
      try {
        if (socket.role !== 'driver') return;

        const { lat, lng } = data;
        if (lat == null || lng == null) return;

        // Update driver location in DB
        await Driver.findByIdAndUpdate(socket.userId, {
          currentLocation: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          lastLocationUpdateAt: new Date(),
        });

        // If driver is on an active ride, stream location to customer
        const activeRide = await Ride.findOne({
          driverId: socket.userId,
          status: { $in: ['accepted', 'arrived', 'started'] },
        });

        if (activeRide) {
          // Update ride's driver location
          activeRide.driverLocation = {
            type: 'Point',
            coordinates: [lng, lat],
            updatedAt: new Date(),
          };

          // Add to route history if trip started
          if (activeRide.status === 'started') {
            activeRide.route.push({
              lat,
              lng,
              timestamp: new Date(),
            });
          }

          await activeRide.save();

          // Stream to customer
          const customerSocketId = matchingEngine.getCustomerSocketId(activeRide.customerId.toString());
          if (customerSocketId) {
            io.to(customerSocketId).emit('ride:driverLocation', {
              rideId: activeRide._id,
              lat,
              lng,
              timestamp: new Date(),
            });
          }
        }

        // Broadcast to admin for live map
        io.to('role:admin').emit('admin:driverLocation', {
          driverId: socket.userId,
          lat,
          lng,
          timestamp: new Date(),
        });
      } catch (err) {
        logger.error(`Location update error: ${err.message}`);
      }
    });

    // Driver accepts ride request (via socket)
    socket.on('ride:accept', async (data) => {
      try {
        if (socket.role !== 'driver') return;
        const { rideId } = data;

        const ride = await Ride.findById(rideId);
        if (!ride) return;

        // Check if this driver was offered the ride
        const wasOffered = ride.matchedDrivers.some(
          (m) => m.driverId.toString() === socket.userId && m.status === 'pending'
        );

        if (!wasOffered) {
          socket.emit('ride:error', { message: 'This ride was not offered to you' });
          return;
        }

        // Handle accept in matching engine
        matchingEngine.handleDriverAccept(rideId, socket.userId);

        // Update ride
        const freshRide = await Ride.findById(rideId);
        if (freshRide && ['searching', 'requested'].includes(freshRide.status)) {
          freshRide.driverId = socket.userId;
          freshRide.status = 'accepted';
          freshRide.timestamps.acceptedAt = new Date();
          await freshRide.save();

          await Driver.findByIdAndUpdate(socket.userId, { isBusy: true });

          // Notify customer
          const customerSocketId = matchingEngine.getCustomerSocketId(freshRide.customerId.toString());
          if (customerSocketId) {
            io.to(customerSocketId).emit('ride:accepted', {
              rideId: freshRide._id,
              driver: {
                id: socket.userId,
                name: socket.entity.name,
                rating: socket.entity.rating,
                vehicle: socket.entity.vehicle,
              },
              otp: freshRide.otp,
            });
          }

          socket.emit('ride:accepted', { rideId: freshRide._id, status: 'accepted' });
        }
      } catch (err) {
        logger.error(`Ride accept error: ${err.message}`);
        socket.emit('ride:error', { message: err.message });
      }
    });

    // Driver rejects ride request (via socket)
    socket.on('ride:reject', async (data) => {
      try {
        if (socket.role !== 'driver') return;
        const { rideId } = data;

        matchingEngine.handleDriverReject(rideId, socket.userId);

        const ride = await Ride.findById(rideId);
        if (ride) {
          const match = ride.matchedDrivers.find(
            (m) => m.driverId.toString() === socket.userId && m.status === 'pending'
          );
          if (match) {
            match.status = 'rejected';
            match.respondedAt = new Date();
            await ride.save();
          }
        }

        socket.emit('ride:rejected', { rideId });
      } catch (err) {
        logger.error(`Ride reject error: ${err.message}`);
      }
    });

    // --- Customer events ---

    // Customer cancels ride (via socket)
    socket.on('ride:cancel', async (data) => {
      try {
        if (socket.role !== 'customer') return;
        const { rideId, reason } = data;

        const ride = await Ride.findById(rideId);
        if (!ride || ride.customerId.toString() !== socket.userId) return;

        if (!['requested', 'searching', 'accepted', 'arrived'].includes(ride.status)) return;

        ride.status = 'cancelled';
        ride.cancellation = {
          cancelledBy: 'customer',
          reason: reason || '',
          cancelledAt: new Date(),
        };
        ride.timestamps.cancelledAt = new Date();
        await ride.save();

        // Free up driver
        if (ride.driverId) {
          await Driver.findByIdAndUpdate(ride.driverId, { isBusy: false });
          const driverSocketId = matchingEngine.getDriverSocketId(ride.driverId.toString());
          if (driverSocketId) {
            io.to(driverSocketId).emit('ride:cancelled', {
              rideId: ride._id,
              cancelledBy: 'customer',
              reason,
            });
          }
        }

        // Clean up matching
        matchingEngine.cleanupRideResponses(ride._id);

        socket.emit('ride:cancelled', { rideId: ride._id, status: 'cancelled' });
      } catch (err) {
        logger.error(`Ride cancel error: ${err.message}`);
      }
    });

    // --- Admin events ---

    // Admin requests live rides
    socket.on('admin:getLiveRides', async () => {
      try {
        if (socket.role !== 'admin') return;

        const rides = await Ride.find({
          status: { $in: ['accepted', 'arrived', 'started'] },
        })
          .populate('customerId', 'name mobile')
          .populate('driverId', 'name mobile vehicle currentLocation');

        socket.emit('admin:liveRides', { rides });
      } catch (err) {
        logger.error(`Admin live rides error: ${err.message}`);
      }
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id} (${socket.role}:${socket.userId})`);
      matchingEngine.unregisterSocket(socket.id);

      // If driver disconnects while online, mark them offline
      if (socket.role === 'driver') {
        Driver.findByIdAndUpdate(socket.userId, { isOnline: false }).catch((err) => {
          logger.error(`Driver offline update error: ${err.message}`);
        });
      }
    });
  });
};

module.exports = { initRideSocket };