const User = require('../models/User');
const Ride = require('../models/Ride');
const Wallet = require('../models/Wallet');
const Promo = require('../models/Promo');
const { AppError, asyncHandler } = require('../middlewares/errorHandler');

/**
 * @desc    Get customer profile
 * @route   GET /api/customer/profile
 * @access  Private (customer)
 */
const getProfile = asyncHandler(async (req, res, next) => {
  res.json({
    success: true,
    data: req.user,
  });
});

/**
 * @desc    Update customer profile
 * @route   PUT /api/customer/profile
 * @access  Private (customer)
 */
const updateProfile = asyncHandler(async (req, res, next) => {
  const { name, email, gender } = req.body;

  const user = req.user;

  if (name) user.name = name;
  if (email) user.email = email;
  if (gender) user.gender = gender;

  await user.save();

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: user,
  });
});

/**
 * @desc    Upload profile picture
 * @route   POST /api/customer/profile-pic
 * @access  Private (customer)
 */
const uploadProfilePic = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please upload an image', 400));
  }

  const user = req.user;
  user.profilePic = req.file.path;
  await user.save();

  res.json({
    success: true,
    message: 'Profile picture updated',
    data: { profilePic: user.profilePic },
  });
});

/**
 * @desc    Add saved place
 * @route   POST /api/customer/saved-places
 * @access  Private (customer)
 */
const addSavedPlace = asyncHandler(async (req, res, next) => {
  const { label, name, address, lat, lng } = req.body;

  if (!label || !address || !lat || !lng) {
    return next(new AppError('Label, address, latitude and longitude are required', 400));
  }

  const user = req.user;

  // Check if place with same label already exists
  const existingIndex = user.savedPlaces.findIndex((p) => p.label === label);
  const place = {
    label,
    name: name || address,
    address,
    location: {
      type: 'Point',
      coordinates: [lng, lat],
    },
  };

  if (existingIndex >= 0) {
    user.savedPlaces[existingIndex] = place;
  } else {
    user.savedPlaces.push(place);
  }

  await user.save();

  res.json({
    success: true,
    message: 'Place saved successfully',
    data: user.savedPlaces,
  });
});

/**
 * @desc    Get saved places
 * @route   GET /api/customer/saved-places
 * @access  Private (customer)
 */
const getSavedPlaces = asyncHandler(async (req, res, next) => {
  res.json({
    success: true,
    data: req.user.savedPlaces,
  });
});

/**
 * @desc    Delete saved place
 * @route   DELETE /api/customer/saved-places/:id
 * @access  Private (customer)
 */
const deleteSavedPlace = asyncHandler(async (req, res, next) => {
  const user = req.user;
  const placeId = req.params.id;

  user.savedPlaces = user.savedPlaces.filter((p) => p._id.toString() !== placeId);
  await user.save();

  res.json({
    success: true,
    message: 'Place deleted',
    data: user.savedPlaces,
  });
});

/**
 * @desc    Get wallet balance & transactions
 * @route   GET /api/customer/wallet
 * @access  Private (customer)
 */
const getWallet = asyncHandler(async (req, res, next) => {
  const transactions = await Wallet.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({
    success: true,
    data: {
      balance: req.user.walletBalance,
      transactions,
    },
  });
});

/**
 * @desc    Add SOS contact
 * @route   POST /api/customer/sos-contacts
 * @access  Private (customer)
 */
const addSosContact = asyncHandler(async (req, res, next) => {
  const { name, mobile, relation } = req.body;

  if (!name || !mobile) {
    return next(new AppError('Name and mobile are required', 400));
  }

  if (!/^[6-9]\d{9}$/.test(mobile)) {
    return next(new AppError('Please enter a valid 10-digit mobile number', 400));
  }

  const user = req.user;
  user.sosContacts.push({ name, mobile, relation: relation || 'other' });
  await user.save();

  res.json({
    success: true,
    message: 'SOS contact added',
    data: user.sosContacts,
  });
});

/**
 * @desc    Delete SOS contact
 * @route   DELETE /api/customer/sos-contacts/:id
 * @access  Private (customer)
 */
const deleteSosContact = asyncHandler(async (req, res, next) => {
  const user = req.user;
  const contactId = req.params.id;

  user.sosContacts = user.sosContacts.filter((c) => c._id.toString() !== contactId);
  await user.save();

  res.json({
    success: true,
    message: 'SOS contact deleted',
    data: user.sosContacts,
  });
});

/**
 * @desc    Get available promos
 * @route   GET /api/customer/promos
 * @access  Private (customer)
 */
const getAvailablePromos = asyncHandler(async (req, res, next) => {
  const promos = await Promo.find({
    isActive: true,
    expiryDate: { $gt: new Date() },
  }).select('code description discountType discountValue minFare maxDiscount expiryDate');

  res.json({
    success: true,
    data: promos,
  });
});

/**
 * @desc    Get active ride for customer
 * @route   GET /api/customer/active-ride
 * @access  Private (customer)
 */
const getActiveRide = asyncHandler(async (req, res, next) => {
  const ride = await Ride.findOne({
    customerId: req.user._id,
    status: { $in: ['requested', 'searching', 'accepted', 'arrived', 'started'] },
  })
    .populate('driverId', 'name mobile rating vehicle profilePic')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: ride,
  });
});

/**
 * @desc    Update FCM token
 * @route   POST /api/customer/fcm-token
 * @access  Private (customer)
 */
const updateFcmToken = asyncHandler(async (req, res, next) => {
  const { fcmToken } = req.body;

  if (!fcmToken) {
    return next(new AppError('FCM token is required', 400));
  }

  const user = req.user;
  user.fcmToken = fcmToken;
  await user.save();

  res.json({
    success: true,
    message: 'FCM token updated',
  });
});

module.exports = {
  getProfile,
  updateProfile,
  uploadProfilePic,
  addSavedPlace,
  getSavedPlaces,
  deleteSavedPlace,
  getWallet,
  addSosContact,
  deleteSosContact,
  getAvailablePromos,
  getActiveRide,
  updateFcmToken,
};