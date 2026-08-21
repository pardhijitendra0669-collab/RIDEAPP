const Driver = require('../models/Driver');
const Ride = require('../models/Ride');
const { AppError } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

/**
 * Matching Engine — finds nearby available drivers for a ride request
 * 
 * Algorithm:
 * 1. Query drivers within X km radius using $nearSphere on currentLocation
 *    filtered by isOnline, isApproved, not blocked, not busy, matching vehicleType
 * 2. Sort by distance, send request to nearest driver first with 15-sec timeout
 * 3. If rejected/timeout, move to next nearest driver
 * 4. Once accepted, lock ride to that driver, notify customer
 */

const SEARCH_RADIUS_KM = 5; // default search radius
const DRIVER_RESPONSE_TIMEOUT_MS = 15000; // 15 seconds

const extractCoordinates = (point) => {
  if (!point || typeof point !== 'object') return null;

  if (Array.isArray(point.coordinates) && point.coordinates.length >= 2) {
    return point.coordinates;
  }

  if (point.location && Array.isArray(point.location.coordinates) && point.location.coordinates.length >= 2) {
    return point.location.coordinates;
  }

  return null;
};

/**
 * Find nearby available drivers
 * @param {Object} pickupLocation - { coordinates: [lng, lat] }
 * @param {string} vehicleType
 * @param {number} radiusKm
 */
const findNearbyDrivers = async (pickupLocation, vehicleType, radiusKm = SEARCH_RADIUS_KM) => {
  const coords = extractCoordinates(pickupLocation);
  if (!coords) {
    throw new AppError('Invalid pickup location coordinates', 400);
  }

  const [lng, lat] = coords;

  // Heal stale busy flags: a driver may remain busy if a prior flow ended unexpectedly.
  // Such drivers should be matchable when they no longer have an active ride.
  const busyCandidates = await Driver.find({
    isOnline: true,
    isApproved: true,
    isBlocked: false,
    isBusy: true,
    'vehicle.type': vehicleType,
  })
    .select('_id')
    .lean();

  if (busyCandidates.length > 0) {
    const busyIds = busyCandidates.map((d) => d._id);
    const activeBusyDriverIds = await Ride.distinct('driverId', {
      driverId: { $in: busyIds },
      status: { $in: ['accepted', 'arrived', 'started'] },
    });

    const activeSet = new Set(activeBusyDriverIds.map((id) => id.toString()));
    const staleBusyIds = busyIds.filter((id) => !activeSet.has(id.toString()));

    if (staleBusyIds.length > 0) {
      await Driver.updateMany(
        { _id: { $in: staleBusyIds } },
        { $set: { isBusy: false } }
      );
    }
  }

  const drivers = await Driver.find({
    isOnline: true,
    isApproved: true,
    isBlocked: false,
    isBusy: false,
    'vehicle.type': vehicleType,
    currentLocation: {
      $nearSphere: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        $maxDistance: radiusKm * 1000, // convert km to meters
      },
    },
  })
    .select('name mobile rating vehicle currentLocation fcmToken')
    .lean();

  // Calculate distance for each driver (in km)
  const driversWithDistance = drivers.map((driver) => {
    const [dLng, dLat] = driver.currentLocation.coordinates;
    const distanceKm = haversineDistance(lat, lng, dLat, dLng);
    return { ...driver, distanceKm };
  });

  // Sort by distance (nearest first)
  driversWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);

  return driversWithDistance;
};

/**
 * Haversine distance between two coordinates in km
 */
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Send ride request to a driver via socket
 * @param {Object} io - Socket.IO instance
 * @param {Object} ride - Ride document
 * @param {Object} driver - Driver document
 */
const sendRideRequestToDriver = (io, ride, driver) => {
  const driverSocketId = getDriverSocketId(driver._id.toString());
  if (!driverSocketId) {
    logger.warn(`Ride ${ride.rideNumber}: driver ${driver._id} not connected to socket`);
    return false;
  }

  logger.info(
    `Ride ${ride.rideNumber}: emitting request to driver ${driver._id} at distance ${Number(driver.distanceKm || 0).toFixed(2)}km (socket ${driverSocketId})`
  );

  // Emit ride request to driver
  io.to(driverSocketId).emit('ride:newRequest', {
    rideId: ride._id,
    rideNumber: ride.rideNumber,
    pickupLocation: ride.pickupLocation,
    dropLocation: ride.dropLocation,
    vehicleType: ride.vehicleType,
    fareEstimate: ride.fareEstimate,
    distanceKm: ride.fareEstimate?.distanceKm,
    durationMin: ride.fareEstimate?.durationMin,
    customerName: 'Customer', // masked for privacy
    customerRating: 5,
    timeoutMs: DRIVER_RESPONSE_TIMEOUT_MS,
  });

  return true;
};

/**
 * In-memory map of driverId -> socketId
 * In production with multiple instances, use Redis
 */
const driverSocketMap = new Map();
const customerSocketMap = new Map();

const registerDriverSocket = (driverId, socketId) => {
  driverSocketMap.set(driverId.toString(), socketId);
};

const registerCustomerSocket = (customerId, socketId) => {
  customerSocketMap.set(customerId.toString(), socketId);
};

const unregisterSocket = (socketId) => {
  for (const [key, value] of driverSocketMap.entries()) {
    if (value === socketId) {
      driverSocketMap.delete(key);
    }
  }
  for (const [key, value] of customerSocketMap.entries()) {
    if (value === socketId) {
      customerSocketMap.delete(key);
    }
  }
};

const getDriverSocketId = (driverId) => {
  return driverSocketMap.get(driverId.toString());
};

const getCustomerSocketId = (customerId) => {
  return customerSocketMap.get(customerId.toString());
};

/**
 * Match drivers to a ride — the core matching loop
 * @param {Object} io - Socket.IO instance
 * @param {Object} ride - Ride document
 * @param {Object} options - { radiusKm, timeoutMs }
 */
const matchDrivers = async (io, ride, options = {}) => {
  const radiusKm = options.radiusKm || SEARCH_RADIUS_KM;
  const timeoutMs = options.timeoutMs || DRIVER_RESPONSE_TIMEOUT_MS;

  const pickupCoords = extractCoordinates(ride.pickupLocation);
  logger.info(
    `Ride ${ride.rideNumber}: matching started (vehicle=${ride.vehicleType}, pickup=${pickupCoords ? pickupCoords.join(',') : 'invalid'})`
  );

  // Find nearby drivers with progressive radius fallback
  const searchRadii = [...new Set([radiusKm, 10, 20])];
  let nearbyDrivers = [];
  for (const radius of searchRadii) {
    nearbyDrivers = await findNearbyDrivers(ride.pickupLocation, ride.vehicleType, radius);
    logger.info(`Ride ${ride.rideNumber}: eligible drivers within ${radius}km = ${nearbyDrivers.length}`);
    if (nearbyDrivers.length > 0) {
      logger.info(`Found ${nearbyDrivers.length} nearby drivers for ride ${ride.rideNumber} within ${radius}km`);
      break;
    }
  }

  if (nearbyDrivers.length === 0) {
    logger.info(`No drivers found for ride ${ride.rideNumber} within ${searchRadii[searchRadii.length - 1]}km`);
    ride.status = 'no_driver_found';
    await ride.save();
    return { matched: false, reason: 'no_drivers_found' };
  }

  // Update ride status to searching
  ride.status = 'searching';
  await ride.save();

  // Try each driver in order of proximity
  for (let i = 0; i < nearbyDrivers.length; i++) {
    const driver = nearbyDrivers[i];
    logger.info(
      `Ride ${ride.rideNumber}: trying driver ${driver._id} (${i + 1}/${nearbyDrivers.length})`
    );

    // Check if ride was cancelled while searching
    const freshRide = await Ride.findById(ride._id);
    if (!freshRide || freshRide.status === 'cancelled') {
      return { matched: false, reason: 'ride_cancelled' };
    }

    // Add driver to matchedDrivers list
    ride.matchedDrivers.push({
      driverId: driver._id,
      status: 'pending',
      sentAt: new Date(),
    });
    ride.currentMatchedDriverIndex = i;
    await ride.save();

    // Send request to driver
    const sent = sendRideRequestToDriver(io, ride, driver);
    if (!sent) {
      // Driver not connected, mark as timeout and try next
      ride.matchedDrivers[i].status = 'timeout';
      ride.matchedDrivers[i].respondedAt = new Date();
      await ride.save();
      logger.info(`Ride ${ride.rideNumber}: skipped driver ${driver._id} because socket not connected`);
      continue;
    }

    // Wait for driver response (accept/reject/timeout)
    const response = await waitForDriverResponse(ride._id, driver._id, timeoutMs);

    if (response === 'accepted') {
      // Driver accepted!
      const freshRide = await Ride.findById(ride._id);
      if (!freshRide || freshRide.status === 'cancelled') {
        return { matched: false, reason: 'ride_cancelled' };
      }

      // Lock ride to driver
      freshRide.driverId = driver._id;
      freshRide.status = 'accepted';
      freshRide.timestamps.acceptedAt = new Date();
      freshRide.matchedDrivers[i].status = 'accepted';
      freshRide.matchedDrivers[i].respondedAt = new Date();
      await freshRide.save();

      // Mark driver as busy
      await Driver.findByIdAndUpdate(driver._id, { isBusy: true });

      logger.info(`Ride ${freshRide.rideNumber} accepted by driver ${driver._id}`);

      return { matched: true, driver, ride: freshRide };
    }

    // Driver rejected or timed out — mark and try next
    ride.matchedDrivers[i].status = response === 'rejected' ? 'rejected' : 'timeout';
    ride.matchedDrivers[i].respondedAt = new Date();
    await ride.save();

    logger.info(`Driver ${driver._id} ${response} ride ${ride.rideNumber}`);
  }

  // No driver accepted
  ride.status = 'no_driver_found';
  await ride.save();
  logger.info(`Ride ${ride.rideNumber}: no driver accepted request after trying ${nearbyDrivers.length} driver(s)`);
  return { matched: false, reason: 'all_drivers_rejected' };
};

/**
 * Wait for driver response via socket event
 * Resolves with 'accepted', 'rejected', or 'timeout'
 */
const waitForDriverResponse = (rideId, driverId, timeoutMs) => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve('timeout');
    }, timeoutMs);

    const onAccept = (data) => {
      if (data.rideId === rideId.toString()) {
        cleanup();
        resolve('accepted');
      }
    };

    const onReject = (data) => {
      if (data.rideId === rideId.toString()) {
        cleanup();
        resolve('rejected');
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      // Remove listeners — these are registered in the socket layer
      // and cleaned up there
    };

    // Store callbacks for the socket layer to invoke
    pendingDriverResponses.set(`${rideId}:${driverId}`, { onAccept, onReject, cleanup });
  });
};

/**
 * Map of pending driver responses: `${rideId}:${driverId}` -> { onAccept, onReject, cleanup }
 */
const pendingDriverResponses = new Map();

/**
 * Handle driver accept from socket layer
 */
const handleDriverAccept = (rideId, driverId) => {
  const key = `${rideId}:${driverId}`;
  const pending = pendingDriverResponses.get(key);
  if (pending) {
    pending.onAccept({ rideId });
    pendingDriverResponses.delete(key);
  }
};

/**
 * Handle driver reject from socket layer
 */
const handleDriverReject = (rideId, driverId) => {
  const key = `${rideId}:${driverId}`;
  const pending = pendingDriverResponses.get(key);
  if (pending) {
    pending.onReject({ rideId });
    pendingDriverResponses.delete(key);
  }
};

/**
 * Clean up pending responses for a ride (e.g. on cancellation)
 */
const cleanupRideResponses = (rideId) => {
  for (const [key, value] of pendingDriverResponses.entries()) {
    if (key.startsWith(`${rideId}:`)) {
      value.cleanup();
      pendingDriverResponses.delete(key);
    }
  }
};

module.exports = {
  findNearbyDrivers,
  matchDrivers,
  registerDriverSocket,
  registerCustomerSocket,
  unregisterSocket,
  getDriverSocketId,
  getCustomerSocketId,
  handleDriverAccept,
  handleDriverReject,
  cleanupRideResponses,
  haversineDistance,
  SEARCH_RADIUS_KM,
  DRIVER_RESPONSE_TIMEOUT_MS,
};