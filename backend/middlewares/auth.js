const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Driver = require('../models/Driver');
const Admin = require('../models/Admin');
const { AppError } = require('./errorHandler');

/**
 * Protect routes — requires valid JWT token for User/Customer
 */
const protectCustomer = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('Not authorized, no token provided', 401));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check role
    if (decoded.role !== 'customer') {
      return next(new AppError('Not authorized as customer', 401));
    }

    // Get user
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new AppError('User not found', 401));
    }

    if (user.isBlocked) {
      return next(new AppError('Your account has been blocked. Contact support.', 403));
    }

    req.user = user;
    req.userType = 'customer';
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401));
    }
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Token expired, please login again', 401));
    }
    return next(new AppError('Not authorized', 401));
  }
};

/**
 * Protect routes — requires valid JWT token for Driver
 */
const protectDriver = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('Not authorized, no token provided', 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'driver') {
      return next(new AppError('Not authorized as driver', 401));
    }

    const driver = await Driver.findById(decoded.id);
    if (!driver) {
      return next(new AppError('Driver not found', 401));
    }

    if (driver.isBlocked) {
      return next(new AppError('Your account has been blocked. Contact support.', 403));
    }

    req.driver = driver;
    req.userType = 'driver';
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401));
    }
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Token expired, please login again', 401));
    }
    return next(new AppError('Not authorized', 401));
  }
};

/**
 * Protect routes — requires valid JWT token for Admin
 */
const protectAdmin = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('Not authorized, no token provided', 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'admin') {
      return next(new AppError('Not authorized as admin', 401));
    }

    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return next(new AppError('Admin not found', 401));
    }

    if (!admin.isActive) {
      return next(new AppError('Admin account is deactivated', 403));
    }

    req.admin = admin;
    req.userType = 'admin';
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401));
    }
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Token expired, please login again', 401));
    }
    return next(new AppError('Not authorized', 401));
  }
};

/**
 * Generic protect middleware that accepts a role
 */
const protect = (role) => {
  if (role === 'customer') return protectCustomer;
  if (role === 'driver') return protectDriver;
  if (role === 'admin') return protectAdmin;
  return protectCustomer;
};

/**
 * Generate JWT access token
 */
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
};

/**
 * Refresh token endpoint handler
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return next(new AppError('Refresh token required', 400));
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    let entity;
    if (decoded.role === 'customer') {
      entity = await User.findById(decoded.id);
      if (!entity || entity.isBlocked) {
        return next(new AppError('User not found or blocked', 401));
      }
    } else if (decoded.role === 'driver') {
      entity = await Driver.findById(decoded.id);
      if (!entity || entity.isBlocked) {
        return next(new AppError('Driver not found or blocked', 401));
      }
    } else if (decoded.role === 'admin') {
      entity = await Admin.findById(decoded.id);
      if (!entity || !entity.isActive) {
        return next(new AppError('Admin not found or inactive', 401));
      }
    } else {
      return next(new AppError('Invalid role in token', 401));
    }

    const newToken = generateToken(decoded.id, decoded.role);
    const newRefreshToken = generateRefreshToken(decoded.id, decoded.role);

    res.json({
      success: true,
      accessToken: newToken,
      refreshToken: newRefreshToken,
      role: decoded.role,
    });
  } catch (err) {
    return next(new AppError('Invalid refresh token', 401));
  }
};

module.exports = {
  protect,
  protectCustomer,
  protectDriver,
  protectAdmin,
  generateToken,
  generateRefreshToken,
  refreshToken,
};