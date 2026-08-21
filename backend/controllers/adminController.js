const User = require('../models/User');
const Driver = require('../models/Driver');
const Ride = require('../models/Ride');
const Payment = require('../models/Payment');
const Promo = require('../models/Promo');
const Admin = require('../models/Admin');
const PricingRule = require('../models/PricingRule');
const mongoose = require('mongoose');
const pricingEngine = require('../services/pricingEngine');
const matchingEngine = require('../services/matchingEngine');
const notificationService = require('../services/notificationService');
const { AppError, asyncHandler } = require('../middlewares/errorHandler');

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

/**
 * @desc    Get dashboard stats
 * @route   GET /api/admin/dashboard
 * @access  Private (admin)
 */
const getDashboard = asyncHandler(async (req, res, next) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Total counts
  const [totalUsers, totalDrivers, totalRides, activeDrivers, onlineDrivers, pendingDrivers] =
    await Promise.all([
      User.countDocuments(),
      Driver.countDocuments(),
      Ride.countDocuments(),
      Driver.countDocuments({ isApproved: true }),
      Driver.countDocuments({ isOnline: true, isApproved: true }),
      Driver.countDocuments({ 'documents.verificationStatus': 'submitted' }),
    ]);

  // Today's stats
  const [todayRides, todayRevenue, todayCompleted] = await Promise.all([
    Ride.countDocuments({ createdAt: { $gte: today } }),
    Ride.aggregate([
      { $match: { status: 'completed', 'timestamps.completedAt': { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$finalFare' } } },
    ]),
    Ride.countDocuments({ status: 'completed', 'timestamps.completedAt': { $gte: today } }),
  ]);

  // Monthly stats
  const [monthRides, monthRevenue] = await Promise.all([
    Ride.countDocuments({ createdAt: { $gte: monthStart } }),
    Ride.aggregate([
      { $match: { status: 'completed', 'timestamps.completedAt': { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$finalFare' } } },
    ]),
  ]);

  // Revenue by vehicle type
  const revenueByVehicle = await Ride.aggregate([
    { $match: { status: 'completed' } },
    {
      $group: {
        _id: '$vehicleType',
        count: { $sum: 1 },
        revenue: { $sum: '$finalFare' },
      },
    },
  ]);

  // Recent rides
  const recentRides = await Ride.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('customerId', 'name mobile')
    .populate('driverId', 'name mobile');

  res.json({
    success: true,
    data: {
      totals: {
        users: totalUsers,
        drivers: totalDrivers,
        rides: totalRides,
        activeDrivers,
        onlineDrivers,
        pendingDrivers,
      },
      today: {
        rides: todayRides,
        completed: todayCompleted,
        revenue: todayRevenue[0]?.total || 0,
      },
      month: {
        rides: monthRides,
        revenue: monthRevenue[0]?.total || 0,
      },
      revenueByVehicle,
      recentRides,
    },
  });
});

/**
 * @desc    Get all drivers (with filters)
 * @route   GET /api/admin/drivers
 * @access  Private (admin)
 */
const getDrivers = asyncHandler(async (req, res, next) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};
  if (status === 'pending') filter['documents.verificationStatus'] = 'submitted';
  if (status === 'approved') filter.isApproved = true;
  if (status === 'rejected') filter['documents.verificationStatus'] = 'rejected';
  if (status === 'blocked') filter.isBlocked = true;
  if (status === 'online') filter.isOnline = true;

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { mobile: { $regex: search, $options: 'i' } },
      { 'vehicle.number': { $regex: search, $options: 'i' } },
    ];
  }

  const drivers = await Driver.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Driver.countDocuments(filter);

  res.json({
    success: true,
    data: {
      drivers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * @desc    Get driver details
 * @route   GET /api/admin/drivers/:id
 * @access  Private (admin)
 */
const getDriverDetails = asyncHandler(async (req, res, next) => {
  if (!isValidObjectId(req.params.id)) {
    return next(new AppError('Invalid driver id', 400));
  }

  const driver = await Driver.findById(req.params.id);

  if (!driver) {
    return next(new AppError('Driver not found', 404));
  }

  // Get driver's rides
  const rides = await Ride.find({ driverId: driver._id })
    .sort({ createdAt: -1 })
    .limit(20);

  // Get driver's earnings
  const earnings = await Payment.find({ driverId: driver._id, method: 'payout' })
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({
    success: true,
    data: {
      driver,
      recentRides: rides,
      payouts: earnings,
    },
  });
});

/**
 * @desc    Approve/reject driver
 * @route   PUT /api/admin/drivers/:id/approve
 * @access  Private (admin)
 */
const approveDriver = asyncHandler(async (req, res, next) => {
  const { approve, rejectionReason } = req.body;

  if (!isValidObjectId(req.params.id)) {
    return next(new AppError('Invalid driver id', 400));
  }

  const driver = await Driver.findById(req.params.id);

  if (!driver) {
    return next(new AppError('Driver not found', 404));
  }

  if (approve) {
    driver.isApproved = true;
    driver.documents.verificationStatus = 'approved';
    driver.documents.rejectionReason = '';
    // Mark all documents as verified
    driver.documents.license.verified = true;
    driver.documents.rc.verified = true;
    driver.documents.insurance.verified = true;
    driver.documents.aadhaar.verified = true;
  } else {
    driver.isApproved = false;
    driver.documents.verificationStatus = 'rejected';
    driver.documents.rejectionReason = rejectionReason || 'Documents rejected';
  }

  await driver.save();

  // Notify driver via FCM
  if (driver.fcmToken) {
    await notificationService.sendPushNotification(driver.fcmToken, {
      title: approve ? 'Account Approved! ✅' : 'Account Rejected ❌',
      body: approve
        ? 'Congratulations! Your documents are approved. You can now go online and start earning.'
        : `Your documents were rejected. Reason: ${driver.documents.rejectionReason}`,
      data: { type: 'approval_status', approved: approve },
    });
  }

  res.json({
    success: true,
    message: approve ? 'Driver approved successfully' : 'Driver rejected',
    data: driver,
  });
});

/**
 * @desc    Block/unblock driver
 * @route   PUT /api/admin/drivers/:id/block
 * @access  Private (admin)
 */
const blockDriver = asyncHandler(async (req, res, next) => {
  const { block, reason } = req.body;

  if (!isValidObjectId(req.params.id)) {
    return next(new AppError('Invalid driver id', 400));
  }

  const driver = await Driver.findById(req.params.id);

  if (!driver) {
    return next(new AppError('Driver not found', 404));
  }

  driver.isBlocked = block;
  if (block) {
    driver.isOnline = false;
    driver.isBusy = false;
  }
  await driver.save();

  res.json({
    success: true,
    message: block ? 'Driver blocked' : 'Driver unblocked',
    data: driver,
  });
});

/**
 * @desc    Get all customers
 * @route   GET /api/admin/customers
 * @access  Private (admin)
 */
const getCustomers = asyncHandler(async (req, res, next) => {
  const { search, page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { mobile: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const customers = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await User.countDocuments(filter);

  res.json({
    success: true,
    data: {
      customers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * @desc    Block/unblock customer
 * @route   PUT /api/admin/customers/:id/block
 * @access  Private (admin)
 */
const blockCustomer = asyncHandler(async (req, res, next) => {
  const { block, reason } = req.body;
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError('Customer not found', 404));
  }

  user.isBlocked = block;
  await user.save();

  res.json({
    success: true,
    message: block ? 'Customer blocked' : 'Customer unblocked',
    data: user,
  });
});

/**
 * @desc    Get all rides (with filters)
 * @route   GET /api/admin/rides
 * @access  Private (admin)
 */
const getRides = asyncHandler(async (req, res, next) => {
  const { status, vehicleType, search, from, to, page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};
  if (status) filter.status = status;
  if (vehicleType) filter.vehicleType = vehicleType;

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  if (search) {
    filter.$or = [
      { rideNumber: { $regex: search, $options: 'i' } },
      { 'pickupLocation.address': { $regex: search, $options: 'i' } },
      { 'dropLocation.address': { $regex: search, $options: 'i' } },
    ];
  }

  const rides = await Ride.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('customerId', 'name mobile')
    .populate('driverId', 'name mobile vehicle');

  const total = await Ride.countDocuments(filter);

  res.json({
    success: true,
    data: {
      rides,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * @desc    Get ongoing rides (live)
 * @route   GET /api/admin/rides/live
 * @access  Private (admin)
 */
const getLiveRides = asyncHandler(async (req, res, next) => {
  const rides = await Ride.find({
    status: { $in: ['accepted', 'arrived', 'started'] },
  })
    .populate('customerId', 'name mobile')
    .populate('driverId', 'name mobile vehicle currentLocation');

  res.json({
    success: true,
    data: rides,
  });
});

/**
 * @desc    Get all pricing rules
 * @route   GET /api/admin/pricing
 * @access  Private (admin)
 */
const getPricingRules = asyncHandler(async (req, res, next) => {
  const rules = await pricingEngine.getAllPricingRules();
  res.json({
    success: true,
    data: rules,
  });
});

/**
 * @desc    Create/update pricing rule
 * @route   POST /api/admin/pricing
 * @access  Private (admin)
 */
const createPricingRule = asyncHandler(async (req, res, next) => {
  const { city, vehicleType, baseFare, perKmRate, perMinRate, minFare, surgeMultiplier } = req.body;

  if (!city || !vehicleType || !baseFare || !perKmRate || !perMinRate || !minFare) {
    return next(new AppError('City, vehicle type, base fare, per km rate, per min rate and min fare are required', 400));
  }

  const { rule, created } = await pricingEngine.upsertPricingRule(req.body, req.admin._id);

  res.status(created ? 201 : 200).json({
    success: true,
    message: created ? 'Pricing rule created' : 'Pricing rule updated',
    data: rule,
  });
});

/**
 * @desc    Update pricing rule
 * @route   PUT /api/admin/pricing/:id
 * @access  Private (admin)
 */
const updatePricingRule = asyncHandler(async (req, res, next) => {
  const rule = await PricingRule.findById(req.params.id);
  if (!rule) {
    return next(new AppError('Pricing rule not found', 404));
  }

  Object.assign(rule, req.body);
  await rule.save();

  res.json({
    success: true,
    message: 'Pricing rule updated',
    data: rule,
  });
});

/**
 * @desc    Delete pricing rule
 * @route   DELETE /api/admin/pricing/:id
 * @access  Private (admin)
 */
const deletePricingRule = asyncHandler(async (req, res, next) => {
  const rule = await PricingRule.findById(req.params.id);
  if (!rule) {
    return next(new AppError('Pricing rule not found', 404));
  }

  await rule.deleteOne();

  res.json({
    success: true,
    message: 'Pricing rule deleted',
  });
});

/**
 * @desc    Get all promos
 * @route   GET /api/admin/promos
 * @access  Private (admin)
 */
const getPromos = asyncHandler(async (req, res, next) => {
  const promos = await Promo.find().sort({ createdAt: -1 });
  res.json({
    success: true,
    data: promos,
  });
});

/**
 * @desc    Create promo code
 * @route   POST /api/admin/promo
 * @access  Private (admin)
 */
const createPromo = asyncHandler(async (req, res, next) => {
  const { code, description, discountType, discountValue, minFare, maxDiscount, expiryDate, usageLimit, perUserLimit, applicableVehicleTypes, applicableCities } = req.body;

  if (!code || !discountType || !discountValue || !expiryDate) {
    return next(new AppError('Code, discount type, discount value and expiry date are required', 400));
  }

  const promo = await Promo.create({
    code: code.toUpperCase(),
    description,
    discountType,
    discountValue,
    minFare,
    maxDiscount,
    expiryDate,
    usageLimit,
    perUserLimit,
    applicableVehicleTypes,
    applicableCities,
    createdBy: req.admin._id,
  });

  res.status(201).json({
    success: true,
    message: 'Promo code created',
    data: promo,
  });
});

/**
 * @desc    Update promo code
 * @route   PUT /api/admin/promo/:id
 * @access  Private (admin)
 */
const updatePromo = asyncHandler(async (req, res, next) => {
  const promo = await Promo.findById(req.params.id);
  if (!promo) {
    return next(new AppError('Promo not found', 404));
  }

  Object.assign(promo, req.body);
  if (req.body.code) promo.code = req.body.code.toUpperCase();
  await promo.save();

  res.json({
    success: true,
    message: 'Promo updated',
    data: promo,
  });
});

/**
 * @desc    Delete promo code
 * @route   DELETE /api/admin/promo/:id
 * @access  Private (admin)
 */
const deletePromo = asyncHandler(async (req, res, next) => {
  const promo = await Promo.findById(req.params.id);
  if (!promo) {
    return next(new AppError('Promo not found', 404));
  }

  await promo.deleteOne();

  res.json({
    success: true,
    message: 'Promo deleted',
  });
});

/**
 * @desc    Get revenue reports
 * @route   GET /api/admin/reports/revenue
 * @access  Private (admin)
 */
const getRevenueReport = asyncHandler(async (req, res, next) => {
  const { from, to, city } = req.query;

  const match = { status: 'completed' };
  if (from || to) {
    match['timestamps.completedAt'] = {};
    if (from) match['timestamps.completedAt'].$gte = new Date(from);
    if (to) match['timestamps.completedAt'].$lte = new Date(to);
  }

  const revenue = await Ride.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamps.completedAt' } },
          vehicleType: '$vehicleType',
        },
        count: { $sum: 1 },
        revenue: { $sum: '$finalFare' },
        distance: { $sum: '$actualDistanceKm' },
      },
    },
    { $sort: { '_id.date': -1 } },
  ]);

  const totals = await Ride.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$finalFare' },
        totalRides: { $sum: 1 },
        totalDistance: { $sum: '$actualDistanceKm' },
        avgFare: { $avg: '$finalFare' },
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      daily: revenue,
      totals: totals[0] || { totalRevenue: 0, totalRides: 0, totalDistance: 0, avgFare: 0 },
    },
  });
});

/**
 * @desc    Get driver performance report
 * @route   GET /api/admin/reports/drivers
 * @access  Private (admin)
 */
const getDriverReport = asyncHandler(async (req, res, next) => {
  const drivers = await Driver.aggregate([
    {
      $lookup: {
        from: 'rides',
        localField: '_id',
        foreignField: 'driverId',
        as: 'rides',
      },
    },
    {
      $project: {
        name: 1,
        mobile: 1,
        rating: 1,
        isApproved: 1,
        isOnline: 1,
        totalTrips: 1,
        totalEarnings: 1,
        completedRides: {
          $size: {
            $filter: {
              input: '$rides',
              as: 'ride',
              cond: { $eq: ['$$ride.status', 'completed'] },
            },
          },
        },
        cancelledRides: {
          $size: {
            $filter: {
              input: '$rides',
              as: 'ride',
              cond: { $eq: ['$$ride.status', 'cancelled'] },
            },
          },
        },
      },
    },
    { $sort: { totalEarnings: -1 } },
    { $limit: 50 },
  ]);

  res.json({
    success: true,
    data: drivers,
  });
});

/**
 * @desc    Broadcast notification
 * @route   POST /api/admin/broadcast
 * @access  Private (admin)
 */
const broadcastNotification = asyncHandler(async (req, res, next) => {
  const { audience, title, body, data } = req.body;

  if (!audience || !title || !body) {
    return next(new AppError('Audience, title and body are required', 400));
  }

  const result = await notificationService.broadcastNotification(audience, {
    title,
    body,
    data: data || {},
  });

  res.json({
    success: true,
    message: `Notification sent to ${result.count} devices`,
    data: result,
  });
});

/**
 * @desc    Get all admins
 * @route   GET /api/admin/admins
 * @access  Private (admin)
 */
const getAdmins = asyncHandler(async (req, res, next) => {
  const admins = await Admin.find().select('-password');
  res.json({
    success: true,
    data: admins,
  });
});

/**
 * @desc    Create admin
 * @route   POST /api/admin/admins
 * @access  Private (admin)
 */
const createAdmin = asyncHandler(async (req, res, next) => {
  const { name, email, password, role, permissions } = req.body;

  if (!name || !email || !password) {
    return next(new AppError('Name, email and password are required', 400));
  }

  const admin = await Admin.create({
    name,
    email,
    password,
    role: role || 'operations',
    permissions: permissions || [],
  });

  res.status(201).json({
    success: true,
    message: 'Admin created',
    data: admin,
  });
});

/**
 * @desc    Debug matching eligibility around a location
 * @route   GET /api/admin/debug/matching
 * @access  Private (admin)
 */
const debugMatching = asyncHandler(async (req, res, next) => {
  const { lat, lng, vehicleType, radiusKm } = req.query;

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  const parsedRadius = Number(radiusKm || 5);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return next(new AppError('lat and lng query parameters are required and must be numbers', 400));
  }

  if (!vehicleType) {
    return next(new AppError('vehicleType query parameter is required', 400));
  }

  if (!Number.isFinite(parsedRadius) || parsedRadius <= 0) {
    return next(new AppError('radiusKm must be a positive number', 400));
  }

  const nearbyDrivers = await matchingEngine.findNearbyDrivers(
    {
      location: {
        type: 'Point',
        coordinates: [parsedLng, parsedLat],
      },
    },
    vehicleType,
    parsedRadius
  );

  const drivers = nearbyDrivers.map((driver) => ({
    id: driver._id,
    name: driver.name,
    mobile: driver.mobile,
    rating: driver.rating,
    vehicleType: driver.vehicle?.type,
    distanceKm: Number(driver.distanceKm?.toFixed(3) || 0),
    isSocketConnected: Boolean(matchingEngine.getDriverSocketId(driver._id.toString())),
    coordinates: driver.currentLocation?.coordinates,
  }));

  res.json({
    success: true,
    data: {
      input: {
        lat: parsedLat,
        lng: parsedLng,
        vehicleType,
        radiusKm: parsedRadius,
      },
      totalEligibleNearby: drivers.length,
      socketConnectedCount: drivers.filter((d) => d.isSocketConnected).length,
      drivers,
    },
  });
});

module.exports = {
  getDashboard,
  getDrivers,
  getDriverDetails,
  approveDriver,
  blockDriver,
  getCustomers,
  blockCustomer,
  getRides,
  getLiveRides,
  getPricingRules,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  getPromos,
  createPromo,
  updatePromo,
  deletePromo,
  getRevenueReport,
  getDriverReport,
  broadcastNotification,
  getAdmins,
  createAdmin,
  debugMatching,
};