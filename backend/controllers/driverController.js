const Driver = require('../models/Driver');
const Ride = require('../models/Ride');
const Payment = require('../models/Payment');
const Wallet = require('../models/Wallet');
const pricingEngine = require('../services/pricingEngine');
const matchingEngine = require('../services/matchingEngine');
const notificationService = require('../services/notificationService');
const { AppError, asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

/**
 * @desc    Get driver profile
 * @route   GET /api/driver/profile
 * @access  Private (driver)
 */
const getProfile = asyncHandler(async (req, res, next) => {
  res.json({
    success: true,
    data: req.driver,
  });
});

/**
 * @desc    Update driver profile
 * @route   PUT /api/driver/profile
 * @access  Private (driver)
 */
const updateProfile = asyncHandler(async (req, res, next) => {
  const { name, email, gender, vehicleModel, vehicleColor, vehicleYear } = req.body;

  const driver = req.driver;

  if (name) driver.name = name;
  if (email) driver.email = email;
  if (gender) driver.gender = gender;
  if (vehicleModel) driver.vehicle.model = vehicleModel;
  if (vehicleColor) driver.vehicle.color = vehicleColor;
  if (vehicleYear) driver.vehicle.year = vehicleYear;

  await driver.save();

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: driver,
  });
});

/**
 * @desc    Upload driver documents
 * @route   POST /api/driver/documents/upload
 * @access  Private (driver)
 */
const uploadDocuments = asyncHandler(async (req, res, next) => {
  const driver = req.driver;
  const { docType, docNumber, expiryDate } = req.body;

  if (!docType) {
    return next(new AppError('Document type is required (license, rc, insurance, aadhaar)', 400));
  }

  const validTypes = ['license', 'rc', 'insurance', 'aadhaar'];
  if (!validTypes.includes(docType)) {
    return next(new AppError('Invalid document type', 400));
  }

  // Check if file was uploaded
  if (!req.file) {
    return next(new AppError('Please upload a document file', 400));
  }

  // Update document
  const doc = driver.documents[docType];
  doc.url = req.file.path;
  if (docNumber) doc.number = docNumber;
  if (expiryDate && ['license', 'insurance'].includes(docType)) {
    doc.expiryDate = new Date(expiryDate);
  }

  // Update verification status
  driver.documents.verificationStatus = 'submitted';

  await driver.save();

  res.json({
    success: true,
    message: 'Document uploaded successfully. Pending admin approval.',
    data: {
      docType,
      url: doc.url,
      verificationStatus: driver.documents.verificationStatus,
    },
  });
});

/**
 * @desc    Toggle driver online/offline status
 * @route   POST /api/driver/toggle-status
 * @access  Private (driver)
 */
const toggleStatus = asyncHandler(async (req, res, next) => {
  const driver = req.driver;
  const nextOnlineState = !driver.isOnline;

  // Check if driver is approved
  if (!driver.isApproved) {
    return next(new AppError('Your account is not approved yet. Please wait for admin approval.', 403));
  }

  // Only block when trying to go offline while an active ride really exists.
  if (driver.isBusy && nextOnlineState === false) {
    const activeRide = await Ride.findOne({
      driverId: driver._id,
      status: { $in: ['accepted', 'arrived', 'started'] },
    }).select('_id status');

    if (activeRide) {
      return next(new AppError('Cannot go offline while on an active ride', 400));
    }

    // Auto-heal stale busy flag from older flows where ride state already ended.
    driver.isBusy = false;
  }

  driver.isOnline = nextOnlineState;
  await driver.save();

  // Notify via socket
  const io = req.app.get('io');
  if (io) {
    io.emit('driver:statusChange', {
      driverId: driver._id,
      isOnline: driver.isOnline,
      location: driver.currentLocation,
    });
  }

  res.json({
    success: true,
    message: driver.isOnline ? 'You are now online' : 'You are now offline',
    data: { isOnline: driver.isOnline },
  });
});

/**
 * @desc    Update driver location
 * @route   POST /api/driver/location
 * @access  Private (driver)
 */
const updateLocation = asyncHandler(async (req, res, next) => {
  const { lat, lng } = req.body;

  if (lat == null || lng == null) {
    return next(new AppError('Latitude and longitude are required', 400));
  }

  const driver = req.driver;
  driver.currentLocation = {
    type: 'Point',
    coordinates: [lng, lat],
  };
  driver.lastLocationUpdateAt = new Date();
  await driver.save();

  res.json({
    success: true,
    message: 'Location updated',
  });
});

/**
 * @desc    Accept a ride request
 * @route   POST /api/rides/:id/accept
 * @access  Private (driver)
 */
const acceptRide = asyncHandler(async (req, res, next) => {
  const ride = await Ride.findById(req.params.id);

  if (!ride) {
    return next(new AppError('Ride not found', 404));
  }

  if (ride.status !== 'searching' && ride.status !== 'requested') {
    return next(new AppError('Ride is no longer available', 400));
  }

  // Check if this driver was offered the ride
  const wasOffered = ride.matchedDrivers.some(
    (m) => m.driverId.toString() === req.driver._id.toString() && m.status === 'pending'
  );

  if (!wasOffered) {
    return next(new AppError('Ride request expired or already handled', 400));
  }

  // Handle accept via matching engine
  matchingEngine.handleDriverAccept(ride._id, req.driver._id);

  // Matching engine should mark the ride accepted. Keep a fallback for safety,
  // but only return success after validating final ride ownership + status.
  let acceptedRide = await Ride.findById(ride._id);
  if (acceptedRide && (acceptedRide.status === 'searching' || acceptedRide.status === 'requested')) {
    acceptedRide.driverId = req.driver._id;
    acceptedRide.status = 'accepted';
    acceptedRide.timestamps.acceptedAt = new Date();
    await acceptedRide.save();

    await Driver.findByIdAndUpdate(req.driver._id, { isBusy: true });

    // Notify customer
    const io = req.app.get('io');
    if (io) {
      const customerSocketId = matchingEngine.getCustomerSocketId(acceptedRide.customerId.toString());
      if (customerSocketId) {
        io.to(customerSocketId).emit('ride:accepted', {
          rideId: acceptedRide._id,
          driver: {
            id: req.driver._id,
            name: req.driver.name,
            rating: req.driver.rating,
            vehicle: req.driver.vehicle,
          },
          otp: acceptedRide.otp,
        });
      }
    }
    notificationService.notifyCustomerRideStatus(acceptedRide.customerId, acceptedRide, 'accepted');
  }

  acceptedRide = await Ride.findById(ride._id);
  const acceptedByThisDriver =
    acceptedRide &&
    acceptedRide.status === 'accepted' &&
    acceptedRide.driverId?.toString() === req.driver._id.toString();

  if (!acceptedByThisDriver) {
    return next(new AppError('Ride is no longer available', 400));
  }

  res.json({
    success: true,
    message: 'Ride accepted',
    data: {
      rideId: acceptedRide._id,
      status: 'accepted',
      customer: {
        pickup: acceptedRide.pickupLocation,
        drop: acceptedRide.dropLocation,
      },
    },
  });
});

/**
 * @desc    Reject a ride request
 * @route   POST /api/rides/:id/reject
 * @access  Private (driver)
 */
const rejectRide = asyncHandler(async (req, res, next) => {
  const ride = await Ride.findById(req.params.id);

  if (!ride) {
    return next(new AppError('Ride not found', 404));
  }

  // Handle reject via matching engine
  matchingEngine.handleDriverReject(ride._id, req.driver._id);

  res.json({
    success: true,
    message: 'Ride rejected',
  });
});

/**
 * @desc    Driver arrived at pickup
 * @route   POST /api/rides/:id/arrived
 * @access  Private (driver)
 */
const arrivedAtPickup = asyncHandler(async (req, res, next) => {
  const ride = await Ride.findById(req.params.id);

  if (!ride) {
    return next(new AppError('Ride not found', 404));
  }

  if (ride.driverId?.toString() !== req.driver._id.toString()) {
    return next(new AppError('Not authorized for this ride', 403));
  }

  if (ride.status !== 'accepted') {
    return next(new AppError('Ride must be accepted before arriving', 400));
  }

  ride.status = 'arrived';
  ride.timestamps.arrivedAt = new Date();
  await ride.save();

  // Notify customer
  const io = req.app.get('io');
  if (io) {
    const customerSocketId = matchingEngine.getCustomerSocketId(ride.customerId.toString());
    if (customerSocketId) {
      io.to(customerSocketId).emit('ride:statusUpdate', {
        rideId: ride._id,
        status: 'arrived',
        message: 'Driver has arrived at pickup location',
      });
    }
  }
  notificationService.notifyCustomerRideStatus(ride.customerId, ride, 'arrived');

  res.json({
    success: true,
    message: 'Arrived at pickup',
    data: { status: ride.status },
  });
});

/**
 * @desc    Start trip (verify OTP)
 * @route   POST /api/rides/:id/start
 * @access  Private (driver)
 */
const startRide = asyncHandler(async (req, res, next) => {
  const { otp } = req.body;
  const ride = await Ride.findById(req.params.id);

  if (!ride) {
    return next(new AppError('Ride not found', 404));
  }

  if (ride.driverId?.toString() !== req.driver._id.toString()) {
    return next(new AppError('Not authorized for this ride', 403));
  }

  if (ride.status !== 'arrived') {
    return next(new AppError('Driver must arrive at pickup before starting trip', 400));
  }

  // Verify OTP
  if (!otp || otp !== ride.otp) {
    return next(new AppError('Invalid OTP. Please ask customer for the correct OTP.', 400));
  }

  ride.status = 'started';
  ride.timestamps.startedAt = new Date();
  await ride.save();

  // Notify customer
  const io = req.app.get('io');
  if (io) {
    const customerSocketId = matchingEngine.getCustomerSocketId(ride.customerId.toString());
    if (customerSocketId) {
      io.to(customerSocketId).emit('ride:statusUpdate', {
        rideId: ride._id,
        status: 'started',
        message: 'Trip started. Enjoy your ride!',
      });
    }
  }
  notificationService.notifyCustomerRideStatus(ride.customerId, ride, 'started');

  res.json({
    success: true,
    message: 'Trip started',
    data: { status: ride.status },
  });
});

/**
 * @desc    Complete trip
 * @route   POST /api/rides/:id/complete
 * @access  Private (driver)
 */
const completeRide = asyncHandler(async (req, res, next) => {
  const { actualDistanceKm, actualDurationMin, paymentMode } = req.body;
  const ride = await Ride.findById(req.params.id);

  if (!ride) {
    return next(new AppError('Ride not found', 404));
  }

  if (ride.driverId?.toString() !== req.driver._id.toString()) {
    return next(new AppError('Not authorized for this ride', 403));
  }

  if (ride.status !== 'started') {
    return next(new AppError('Trip must be started before completing', 400));
  }

  // Calculate final fare
  const city = ride.pickupLocation.address.split(',').pop().trim().toLowerCase();
  const finalFareCalc = await pricingEngine.calculateFinalFare({
    city,
    vehicleType: ride.vehicleType,
    actualDistanceKm: actualDistanceKm || ride.distanceKm,
    actualDurationMin: actualDurationMin || ride.durationMin,
  });

  // Apply discount
  const finalFare = finalFareCalc.finalFare - ride.discountApplied;

  // Update ride
  ride.status = 'completed';
  ride.finalFare = finalFare;
  ride.actualDistanceKm = actualDistanceKm || ride.distanceKm;
  ride.actualDurationMin = actualDurationMin || ride.durationMin;
  ride.paymentMode = paymentMode || ride.paymentMode;
  ride.paymentStatus = paymentMode === 'cash' ? 'completed' : 'pending';
  ride.timestamps.completedAt = new Date();
  await ride.save();

  // Update driver stats
  const driver = req.driver;
  driver.isBusy = false;
  driver.totalTrips += 1;
  driver.totalEarnings += finalFare;
  driver.todayEarnings += finalFare;
  driver.walletBalance += finalFare;
  await driver.save();

  // Update customer stats
  const User = require('../models/User');
  await User.findByIdAndUpdate(ride.customerId, { $inc: { totalRides: 1 } });

  // Create payment record
  await Payment.create({
    rideId: ride._id,
    userId: ride.customerId,
    driverId: ride.driverId,
    amount: finalFare,
    method: ride.paymentMode,
    status: ride.paymentStatus,
    description: `Ride ${ride.rideNumber} fare`,
  });

  // Create wallet transaction for driver
  await Wallet.create({
    driverId: ride.driverId,
    type: 'credit',
    amount: finalFare,
    balanceAfter: driver.walletBalance,
    source: 'earnings',
    reference: ride.rideNumber,
    description: `Earnings from ride ${ride.rideNumber}`,
  });

  // Notify customer
  const io = req.app.get('io');
  if (io) {
    const customerSocketId = matchingEngine.getCustomerSocketId(ride.customerId.toString());
    if (customerSocketId) {
      io.to(customerSocketId).emit('ride:statusUpdate', {
        rideId: ride._id,
        status: 'completed',
        message: 'Trip completed',
        finalFare,
        paymentMode: ride.paymentMode,
      });
    }
  }
  notificationService.notifyCustomerRideStatus(ride.customerId, ride, 'completed');

  res.json({
    success: true,
    message: 'Trip completed successfully',
    data: {
      rideId: ride._id,
      finalFare,
      distanceKm: ride.actualDistanceKm,
      durationMin: ride.actualDurationMin,
      paymentMode: ride.paymentMode,
      paymentStatus: ride.paymentStatus,
      fareBreakdown: {
        baseFare: finalFareCalc.baseFare,
        perKmRate: finalFareCalc.perKmRate,
        perMinRate: finalFareCalc.perMinRate,
        distanceKm: ride.actualDistanceKm,
        durationMin: ride.actualDurationMin,
        surgeMultiplier: finalFareCalc.surgeMultiplier,
        discountApplied: ride.discountApplied,
        finalFare,
      },
    },
  });
});

/**
 * @desc    Get driver earnings
 * @route   GET /api/driver/earnings
 * @access  Private (driver)
 */
const getEarnings = asyncHandler(async (req, res, next) => {
  const driver = req.driver;

  // Get today's rides
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayRides = await Ride.find({
    driverId: driver._id,
    status: 'completed',
    'timestamps.completedAt': { $gte: todayStart },
  });

  // Get this week's rides
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const weekRides = await Ride.find({
    driverId: driver._id,
    status: 'completed',
    'timestamps.completedAt': { $gte: weekStart },
  });

  // Get this month's rides
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthRides = await Ride.find({
    driverId: driver._id,
    status: 'completed',
    'timestamps.completedAt': { $gte: monthStart },
  });

  // Get recent transactions
  const transactions = await Wallet.find({ driverId: driver._id })
    .sort({ createdAt: -1 })
    .limit(20);

  res.json({
    success: true,
    data: {
      summary: {
        today: {
          earnings: todayRides.reduce((sum, r) => sum + (r.finalFare || 0), 0),
          trips: todayRides.length,
        },
        week: {
          earnings: weekRides.reduce((sum, r) => sum + (r.finalFare || 0), 0),
          trips: weekRides.length,
        },
        month: {
          earnings: monthRides.reduce((sum, r) => sum + (r.finalFare || 0), 0),
          trips: monthRides.length,
        },
        totalEarnings: driver.totalEarnings,
        totalTrips: driver.totalTrips,
        walletBalance: driver.walletBalance,
      },
      recentTransactions: transactions,
    },
  });
});

/**
 * @desc    Get driver ride history
 * @route   GET /api/driver/rides
 * @access  Private (driver)
 */
const getRideHistory = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const rides = await Ride.find({ driverId: req.driver._id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('customerId', 'name rating');

  const total = await Ride.countDocuments({ driverId: req.driver._id });

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
 * @desc    Update bank details for payout
 * @route   POST /api/driver/bank-details
 * @access  Private (driver)
 */
const updateBankDetails = asyncHandler(async (req, res, next) => {
  const { accountHolderName, accountNumber, ifscCode, upiId } = req.body;

  const driver = req.driver;

  if (accountHolderName) driver.bankDetails.accountHolderName = accountHolderName;
  if (accountNumber) driver.bankDetails.accountNumber = accountNumber;
  if (ifscCode) driver.bankDetails.ifscCode = ifscCode;
  if (upiId) driver.bankDetails.upiId = upiId;

  await driver.save();

  res.json({
    success: true,
    message: 'Bank details updated successfully',
    data: driver.bankDetails,
  });
});

/**
 * @desc    Request payout
 * @route   POST /api/driver/payout
 * @access  Private (driver)
 */
const requestPayout = asyncHandler(async (req, res, next) => {
  const { amount } = req.body;
  const driver = req.driver;

  if (!amount || amount <= 0) {
    return next(new AppError('Valid amount is required', 400));
  }

  if (amount > driver.walletBalance) {
    return next(new AppError('Insufficient wallet balance', 400));
  }

  if (!driver.bankDetails.accountNumber && !driver.bankDetails.upiId) {
    return next(new AppError('Please add bank details or UPI ID first', 400));
  }

  // Deduct from wallet
  driver.walletBalance -= amount;
  await driver.save();

  // Create payout transaction
  await Wallet.create({
    driverId: driver._id,
    type: 'debit',
    amount,
    balanceAfter: driver.walletBalance,
    source: 'payout',
    description: 'Payout request',
  });

  // Create payment record
  await Payment.create({
    driverId: driver._id,
    amount,
    method: 'payout',
    status: 'initiated',
    description: 'Driver payout request',
  });

  res.json({
    success: true,
    message: 'Payout request submitted. Will be processed within 24-48 hours.',
    data: {
      amount,
      walletBalance: driver.walletBalance,
    },
  });
});

/**
 * @desc    Get driver's current active ride (accepted/arrived/started)
 * @route   GET /api/driver/active-ride
 * @access  Private (driver)
 */
const getActiveRide = asyncHandler(async (req, res, next) => {
  const ride = await Ride.findOne({
    driverId: req.driver._id,
    status: { $in: ['accepted', 'arrived', 'started'] },
  })
    .populate('customerId', 'name mobile rating')
    .lean();

  res.json({ success: true, data: ride });
});

module.exports = {
  getProfile,
  updateProfile,
  uploadDocuments,
  toggleStatus,
  updateLocation,
  acceptRide,
  rejectRide,
  arrivedAtPickup,
  startRide,
  completeRide,
  getEarnings,
  getRideHistory,
  updateBankDetails,
  requestPayout,
  getActiveRide,
};