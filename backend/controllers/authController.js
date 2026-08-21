const User = require('../models/User');
const Driver = require('../models/Driver');
const Admin = require('../models/Admin');
const otpService = require('../services/otpService');
const { generateToken, generateRefreshToken } = require('../middlewares/auth');
const { AppError, asyncHandler } = require('../middlewares/errorHandler');

/**
 * @desc    Send OTP for login/registration
 * @route   POST /api/auth/send-otp
 * @access  Public
 */
const sendOtp = asyncHandler(async (req, res, next) => {
  const { mobile, role = 'customer' } = req.body;

  if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
    return next(new AppError('Please enter a valid 10-digit Indian mobile number', 400));
  }

  if (!['customer', 'driver'].includes(role)) {
    return next(new AppError('Invalid role. Must be customer or driver', 400));
  }

  const result = await otpService.sendOtp(mobile, role);

  res.json({
    success: true,
    message: result.message,
    devOtp: result.devOtp,
  });
});

/**
 * @desc    Verify OTP and login/register
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
const verifyOtp = asyncHandler(async (req, res, next) => {
  const { mobile, otp, role = 'customer', name, email, vehicleType, vehicleNumber } = req.body;

  if (!mobile || !otp) {
    return next(new AppError('Mobile and OTP are required', 400));
  }

  // Verify OTP
  const result = await otpService.verifyOtp(mobile, otp, role);
  if (!result.valid) {
    return next(new AppError(result.reason, 400));
  }

  let entity;
  let isNewUser = false;

  if (role === 'customer') {
    // Find or create user
    entity = await User.findOne({ mobile });
    if (!entity) {
      isNewUser = true;
      entity = await User.create({
        mobile,
        name: name || 'User' + mobile.slice(-4),
        email: email || undefined,
      });
    }

    if (entity.isBlocked) {
      return next(new AppError('Your account has been blocked. Contact support.', 403));
    }

    entity.lastLoginAt = new Date();
    await entity.save();
  } else if (role === 'driver') {
    // Find or create driver
    entity = await Driver.findOne({ mobile });
    if (!entity) {
      isNewUser = true;
      entity = await Driver.create({
        mobile,
        name: name || 'Driver' + mobile.slice(-4),
        vehicle: {
          type: vehicleType || 'bike',
          number: vehicleNumber || '',
        },
      });
    }

    if (entity.isBlocked) {
      return next(new AppError('Your account has been blocked. Contact support.', 403));
    }

    entity.lastLoginAt = new Date();
    await entity.save();
  } else {
    return next(new AppError('Invalid role', 400));
  }

  // Generate tokens
  const accessToken = generateToken(entity._id, role);
  const refreshToken = generateRefreshToken(entity._id, role);

  res.json({
    success: true,
    message: 'Login successful',
    isNewUser,
    role,
    accessToken,
    refreshToken,
    user: entity,
  });
});

/**
 * @desc    Admin login
 * @route   POST /api/auth/admin/login
 * @access  Public
 */
const adminLogin = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Email and password are required', 400));
  }

  const admin = await Admin.findOne({ email }).select('+password');
  if (!admin) {
    return next(new AppError('Invalid credentials', 401));
  }

  if (!admin.isActive) {
    return next(new AppError('Admin account is deactivated', 403));
  }

  const isMatch = await admin.comparePassword(password);
  if (!isMatch) {
    return next(new AppError('Invalid credentials', 401));
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  const accessToken = generateToken(admin._id, 'admin');
  const refreshToken = generateRefreshToken(admin._id, 'admin');

  res.json({
    success: true,
    message: 'Admin login successful',
    role: 'admin',
    accessToken,
    refreshToken,
    admin,
  });
});

/**
 * @desc    Register customer (complete profile)
 * @route   POST /api/auth/register
 * @access  Private (customer)
 */
const registerCustomer = asyncHandler(async (req, res, next) => {
  const { name, email, gender, referralCode } = req.body;

  const user = req.user;

  if (name) user.name = name;
  if (email) user.email = email;
  if (gender) user.gender = gender;

  // Handle referral
  if (referralCode) {
    const referrer = await User.findOne({ referralCode });
    if (referrer && referrer._id.toString() !== user._id.toString()) {
      user.referredBy = referrer._id;
      // Add referral bonus to both
      const bonus = 50;
      user.walletBalance += bonus;
      referrer.walletBalance += bonus;
      await referrer.save();
    }
  }

  await user.save();

  res.json({
    success: true,
    message: 'Profile updated successfully',
    user,
  });
});

/**
 * @desc    Register driver (complete profile + vehicle)
 * @route   POST /api/auth/driver/register
 * @access  Private (driver)
 */
const registerDriver = asyncHandler(async (req, res, next) => {
  const { name, email, gender, vehicleType, vehicleNumber, vehicleModel, vehicleColor, vehicleYear } = req.body;

  const driver = req.driver;

  if (!vehicleType || !vehicleNumber || !String(vehicleNumber).trim()) {
    return next(new AppError('Vehicle type and vehicle number are required', 400));
  }

  if (name) driver.name = name;
  if (email) driver.email = email;
  if (gender) driver.gender = gender;

  driver.vehicle.type = vehicleType;
  driver.vehicle.number = String(vehicleNumber).trim().toUpperCase();
  if (vehicleModel) driver.vehicle.model = vehicleModel;
  if (vehicleColor) driver.vehicle.color = vehicleColor;
  if (vehicleYear) driver.vehicle.year = vehicleYear;

  await driver.save();

  res.json({
    success: true,
    message: 'Driver profile updated successfully',
    driver,
  });
});

module.exports = {
  sendOtp,
  verifyOtp,
  adminLogin,
  registerCustomer,
  registerDriver,
};