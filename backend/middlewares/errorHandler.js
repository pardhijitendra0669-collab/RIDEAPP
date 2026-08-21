const logger = require('../utils/logger');

/**
 * Custom error class
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Not found handler
 */
const notFound = (req, res, next) => {
  const error = new AppError(`Route not found: ${req.originalUrl}`, 404);
  next(error);
};

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  logger.error(err.stack || err.message);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = `Resource not found with id of ${err.value}`;
    error = new AppError(message, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `Duplicate field value entered for: ${field}. Please use another value.`;
    error = new AppError(message, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((val) => val.message);
    const message = `Invalid input data: ${messages.join('. ')}`;
    error = new AppError(message, 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token, please login again', 401);
  }

  if (err.name === 'TokenExpiredError') {
    error = new AppError('Token expired, please login again', 401);
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    error = new AppError('File too large. Max size is 5MB.', 400);
  }

  // Rate limit
  if (err.type === 'rate-limit') {
    error = new AppError('Too many requests, please try again later.', 429);
  }

  // Razorpay errors
  if (err.name === 'RazorpayError' || error.razorpay) {
    error = new AppError(err.message || 'Payment gateway error', 400);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      message: error.message || 'Server Error',
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    },
  });
};

/**
 * Async handler wrapper to avoid try/catch repetition
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  notFound,
  errorHandler,
  asyncHandler,
};