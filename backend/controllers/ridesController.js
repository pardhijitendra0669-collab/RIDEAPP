const Ride = require('../models/Ride');
const User = require('../models/User');
const Driver = require('../models/Driver');
const Promo = require('../models/Promo');
const Payment = require('../models/Payment');
const Wallet = require('../models/Wallet');
const pricingEngine = require('../services/pricingEngine');
const matchingEngine = require('../services/matchingEngine');
const notificationService = require('../services/notificationService');
const { AppError, asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

const parsePositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const extractCoordinates = (point) => {
  if (!point || typeof point !== 'object') return null;

  // Backward compatible: { coordinates: [lng, lat] }
  if (Array.isArray(point.coordinates) && point.coordinates.length >= 2) {
    return point.coordinates;
  }

  // Current schema shape: { location: { coordinates: [lng, lat] } }
  if (point.location && Array.isArray(point.location.coordinates) && point.location.coordinates.length >= 2) {
    return point.location.coordinates;
  }

  return null;
};

/**
 * @desc    Estimate fare for a ride
 * @route   POST /api/rides/estimate-fare
 * @access  Private (customer)
 */
const estimateFare = asyncHandler(async (req, res, next) => {
  const { pickupLocation, dropLocation, vehicleType, city, distanceKm, durationMin } = req.body;

  if (!pickupLocation || !dropLocation || !vehicleType) {
    return next(new AppError('Pickup, drop location and vehicle type are required', 400));
  }

  if (!city) {
    return next(new AppError('City is required for fare estimation', 400));
  }

  // In production, distance & duration would come from Google Maps API
  // For now, accept from client or calculate straight-line distance
  let estDistance = parsePositiveNumber(distanceKm);
  let estDuration = parsePositiveNumber(durationMin);

  const pickupCoords = extractCoordinates(pickupLocation);
  const dropCoords = extractCoordinates(dropLocation);

  if (!estDistance && pickupCoords && dropCoords) {
    const [pLng, pLat] = pickupCoords;
    const [dLng, dLat] = dropCoords;
    estDistance = matchingEngine.haversineDistance(pLat, pLng, dLat, dLng);
    estDuration = Math.round((estDistance / 25) * 60); // assume avg 25 km/h
  }

  if (!estDistance || !estDuration) {
    return next(new AppError('Distance and duration are required', 400));
  }

  // Calculate fare
  const fare = await pricingEngine.calculateFare({
    city,
    vehicleType,
    distanceKm: estDistance,
    durationMin: estDuration,
  });

  res.json({
    success: true,
    data: {
      ...fare,
      pickupLocation,
      dropLocation,
      vehicleType,
      city,
    },
  });
});

/**
 * @desc    Book a ride
 * @route   POST /api/rides/book
 * @access  Private (customer)
 */
const bookRide = asyncHandler(async (req, res, next) => {
  const { pickupLocation, dropLocation, vehicleType, city, distanceKm, durationMin, paymentMode, promoCode } = req.body;

  if (!pickupLocation || !dropLocation || !vehicleType || !city) {
    return next(new AppError('Pickup, drop location, vehicle type and city are required', 400));
  }

  // Check if user has an active ride
  const activeRide = await Ride.findOne({
    customerId: req.user._id,
    status: { $in: ['requested', 'searching', 'accepted', 'arrived', 'started'] },
  });

  if (activeRide) {
    return next(new AppError('You already have an active ride. Please complete or cancel it first.', 400));
  }

  // Calculate distance & duration
  let estDistance = parsePositiveNumber(distanceKm);
  let estDuration = parsePositiveNumber(durationMin);

  const pickupCoords = extractCoordinates(pickupLocation);
  const dropCoords = extractCoordinates(dropLocation);

  if (!estDistance && pickupCoords && dropCoords) {
    const [pLng, pLat] = pickupCoords;
    const [dLng, dLat] = dropCoords;
    estDistance = matchingEngine.haversineDistance(pLat, pLng, dLat, dLng);
    estDuration = Math.round((estDistance / 25) * 60);
  }

  if (!estDistance || !estDuration) {
    return next(new AppError('Distance and duration are required', 400));
  }

  // Calculate fare
  const fare = await pricingEngine.calculateFare({
    city,
    vehicleType,
    distanceKm: estDistance,
    durationMin: estDuration,
  });

  // Apply promo code if provided
  let discountApplied = 0;
  let promo = null;
  if (promoCode) {
    promo = await Promo.findOne({ code: promoCode.toUpperCase() });
    if (!promo) {
      return next(new AppError('Invalid promo code', 400));
    }

    const promoCheck = promo.isValidForUser(req.user._id, fare.estimatedFare, vehicleType, city);
    if (!promoCheck.valid) {
      return next(new AppError(promoCheck.reason, 400));
    }

    discountApplied = promo.calculateDiscount(fare.estimatedFare);
  }

  // Generate OTP for ride
  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  // Create ride
  const ride = await Ride.create({
    customerId: req.user._id,
    pickupLocation,
    dropLocation,
    vehicleType,
    status: 'requested',
    otp,
    fareEstimate: {
      ...fare,
      estimatedFare: fare.estimatedFare - discountApplied,
    },
    distanceKm: estDistance,
    durationMin: estDuration,
    paymentMode: paymentMode || 'cash',
    promoCode: promoCode ? promoCode.toUpperCase() : null,
    discountApplied,
  });

  // Record promo usage
  if (promo) {
    promo.usedBy.push({ userId: req.user._id, rideId: ride._id });
    await promo.save();
  }

  // Start driver matching (async, don't block response)
  // The matching engine will emit socket events
  const io = req.app.get('io');
  if (io) {
    // Run matching in background
    matchingEngine.matchDrivers(io, ride).then((result) => {
      if (result.matched) {
        // Notify customer via socket
        const customerSocketId = matchingEngine.getCustomerSocketId(req.user._id.toString());
        if (customerSocketId) {
          io.to(customerSocketId).emit('ride:accepted', {
            rideId: result.ride._id,
            driver: {
              id: result.driver._id,
              name: result.driver.name,
              rating: result.driver.rating,
              vehicle: result.driver.vehicle,
              distanceKm: result.driver.distanceKm,
            },
            otp: result.ride.otp,
          });
        }
        notificationService.notifyCustomerRideStatus(req.user._id, result.ride, 'accepted');
      } else {
        // Notify customer no driver found
        const customerSocketId = matchingEngine.getCustomerSocketId(req.user._id.toString());
        if (customerSocketId) {
          io.to(customerSocketId).emit('ride:noDriverFound', {
            rideId: ride._id,
            reason: result.reason,
          });
        }
        notificationService.notifyCustomerRideStatus(req.user._id, ride, 'no_driver_found');
      }
    }).catch((err) => {
      logger.error(`Matching error for ride ${ride.rideNumber}: ${err.message}`);
    });
  }

  res.status(201).json({
    success: true,
    message: 'Ride booked successfully. Searching for nearby drivers...',
    data: {
      ride,
      fareEstimate: ride.fareEstimate,
      discountApplied,
      otp, // OTP shared with customer for ride start verification
    },
  });
});

/**
 * @desc    Get ride details
 * @route   GET /api/rides/:id
 * @access  Private (customer/driver)
 */
const getRide = asyncHandler(async (req, res, next) => {
  const ride = await Ride.findById(req.params.id)
    .populate('customerId', 'name mobile rating profilePic')
    .populate('driverId', 'name mobile rating vehicle profilePic');

  if (!ride) {
    return next(new AppError('Ride not found', 404));
  }

  // Check authorization
  const isCustomer = ride.customerId._id.toString() === (req.user?._id?.toString() || '');
  const isDriver = ride.driverId?._id?.toString() === (req.driver?._id?.toString() || '');

  if (!isCustomer && !isDriver && req.userType !== 'admin') {
    return next(new AppError('Not authorized to view this ride', 403));
  }

  res.json({
    success: true,
    data: ride,
  });
});

/**
 * @desc    Cancel a ride
 * @route   POST /api/rides/:id/cancel
 * @access  Private (customer/driver)
 */
const cancelRide = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;
  const ride = await Ride.findById(req.params.id);

  if (!ride) {
    return next(new AppError('Ride not found', 404));
  }

  // Idempotent cancel: if ride is already terminal, treat repeated cancel as success.
  if (['cancelled', 'no_driver_found', 'completed'].includes(ride.status)) {
    return res.json({
      success: true,
      message: `Ride already ${ride.status}`,
      data: {
        rideId: ride._id,
        status: ride.status,
        cancellationCharge: ride.cancellation?.cancellationCharge || 0,
      },
    });
  }

  // Check if ride can be cancelled
  const cancellableStatuses = ['requested', 'searching', 'accepted', 'arrived'];
  if (!cancellableStatuses.includes(ride.status)) {
    return next(new AppError(`Ride cannot be cancelled in ${ride.status} status`, 400));
  }

  // Determine who is cancelling
  let cancelledBy;
  if (req.userType === 'customer' && ride.customerId.toString() === req.user._id.toString()) {
    cancelledBy = 'customer';
  } else if (req.userType === 'driver' && ride.driverId?.toString() === req.driver._id.toString()) {
    cancelledBy = 'driver';
  } else if (req.userType === 'admin') {
    cancelledBy = 'admin';
  } else {
    return next(new AppError('Not authorized to cancel this ride', 403));
  }

  // Calculate cancellation charge (if driver was assigned and customer cancels)
  let cancellationCharge = 0;
  if (cancelledBy === 'customer' && ride.driverId && ['accepted', 'arrived'].includes(ride.status)) {
    const city = ride.pickupLocation.address.split(',').pop().trim().toLowerCase();
    cancellationCharge = await pricingEngine.calculateCancellationCharge(city, ride.vehicleType);
  }

  // Update ride
  ride.status = 'cancelled';
  ride.cancellation = {
    cancelledBy,
    reason: reason || '',
    cancelledAt: new Date(),
    cancellationCharge,
  };
  ride.timestamps.cancelledAt = new Date();
  await ride.save();

  // Free up driver if assigned
  if (ride.driverId) {
    await Driver.findByIdAndUpdate(ride.driverId, { isBusy: false });
  }

  // Clean up pending matching responses
  matchingEngine.cleanupRideResponses(ride._id);

  // Notify via socket
  const io = req.app.get('io');
  if (io) {
    // Notify customer
    const customerSocketId = matchingEngine.getCustomerSocketId(ride.customerId.toString());
    if (customerSocketId) {
      io.to(customerSocketId).emit('ride:cancelled', {
        rideId: ride._id,
        cancelledBy,
        reason,
        cancellationCharge,
      });
    }

    // Notify driver
    if (ride.driverId) {
      const driverSocketId = matchingEngine.getDriverSocketId(ride.driverId.toString());
      if (driverSocketId) {
        io.to(driverSocketId).emit('ride:cancelled', {
          rideId: ride._id,
          cancelledBy,
          reason,
        });
      }
    }
  }

  notificationService.notifyCustomerRideStatus(ride.customerId, ride, 'cancelled');

  res.json({
    success: true,
    message: 'Ride cancelled successfully',
    data: {
      rideId: ride._id,
      status: ride.status,
      cancellationCharge,
    },
  });
});

/**
 * @desc    Rate a ride
 * @route   POST /api/rides/:id/rate
 * @access  Private (customer/driver)
 */
const rateRide = asyncHandler(async (req, res, next) => {
  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return next(new AppError('Rating must be between 1 and 5', 400));
  }

  const ride = await Ride.findById(req.params.id);
  if (!ride) {
    return next(new AppError('Ride not found', 404));
  }

  if (ride.status !== 'completed') {
    return next(new AppError('Ride must be completed to rate', 400));
  }

  if (req.userType === 'customer') {
    if (ride.customerId.toString() !== req.user._id.toString()) {
      return next(new AppError('Not authorized to rate this ride', 403));
    }
    if (ride.ratings.customerRating.rating) {
      return next(new AppError('You have already rated this ride', 400));
    }
    ride.ratings.customerRating = { rating, comment, ratedAt: new Date() };

    // Update driver's average rating
    if (ride.driverId) {
      const driver = await Driver.findById(ride.driverId);
      if (driver) {
        const newRating = (driver.rating * driver.totalTrips + rating) / (driver.totalTrips + 1);
        driver.rating = Math.round(newRating * 10) / 10;
        await driver.save();
      }
    }
  } else if (req.userType === 'driver') {
    if (ride.driverId?.toString() !== req.driver._id.toString()) {
      return next(new AppError('Not authorized to rate this ride', 403));
    }
    if (ride.ratings.driverRating.rating) {
      return next(new AppError('You have already rated this ride', 400));
    }
    ride.ratings.driverRating = { rating, comment, ratedAt: new Date() };

    // Update customer's average rating
    const user = await User.findById(ride.customerId);
    if (user) {
      const newRating = (user.rating * user.totalRides + rating) / (user.totalRides + 1);
      user.rating = Math.round(newRating * 10) / 10;
      await user.save();
    }
  } else {
    return next(new AppError('Invalid user type', 403));
  }

  await ride.save();

  res.json({
    success: true,
    message: 'Rating submitted successfully',
    data: ride.ratings,
  });
});

/**
 * @desc    Get ride history for customer
 * @route   GET /api/rides/history
 * @access  Private (customer)
 */
const getRideHistory = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const rides = await Ride.find({ customerId: req.user._id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('driverId', 'name rating vehicle');

  const total = await Ride.countDocuments({ customerId: req.user._id });

  res.json({
    success: true,
    data: {
      rides,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * @desc    Trigger SOS for active ride
 * @route   POST /api/rides/:id/sos
 * @access  Private (customer)
 */
const triggerSOS = asyncHandler(async (req, res, next) => {
  const ride = await Ride.findById(req.params.id);
  if (!ride) {
    return next(new AppError('Ride not found', 404));
  }

  if (ride.customerId.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized', 403));
  }

  if (!['accepted', 'arrived', 'started'].includes(ride.status)) {
    return next(new AppError('SOS can only be triggered during an active ride', 400));
  }

  // Get user's SOS contacts
  const user = await User.findById(req.user._id);
  const contacts = user.sosContacts || [];

  // Get current location (driver location or last known)
  const location = ride.driverLocation.coordinates[0] !== 0
    ? { lat: ride.driverLocation.coordinates[1], lng: ride.driverLocation.coordinates[0] }
    : { lat: ride.pickupLocation.location.coordinates[1], lng: ride.pickupLocation.location.coordinates[0] };

  // Send SOS alerts to contacts
  for (const contact of contacts) {
    await notificationService.sendSOSAlert(contact.mobile, location, ride.rideNumber);
  }

  // Update ride
  ride.emergencySos = {
    triggered: true,
    triggeredAt: new Date(),
    sharedWith: contacts.map((c) => c.mobile),
  };
  await ride.save();

  // Notify admin via socket
  const io = req.app.get('io');
  if (io) {
    io.emit('admin:sosAlert', {
      rideId: ride._id,
      rideNumber: ride.rideNumber,
      customerId: ride.customerId,
      location,
      triggeredAt: ride.emergencySos.triggeredAt,
    });
  }

  res.json({
    success: true,
    message: 'SOS alert sent to emergency contacts',
    data: {
      sharedWith: ride.emergencySos.sharedWith,
      location,
    },
  });
});

module.exports = {
  estimateFare,
  bookRide,
  getRide,
  cancelRide,
  rateRide,
  getRideHistory,
  triggerSOS,
};