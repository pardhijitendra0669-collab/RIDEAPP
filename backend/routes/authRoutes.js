const express = require('express');
const router = express.Router();
const {
  sendOtp,
  verifyOtp,
  adminLogin,
  registerCustomer,
  registerDriver,
} = require('../controllers/authController');
const { protectCustomer, protectDriver, refreshToken } = require('../middlewares/auth');
const { rateLimit } = require('express-rate-limit');

// Rate limiting for OTP endpoints
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  message: 'Too many OTP requests. Please try again later.',
});

// Public routes
router.post('/send-otp', otpLimiter, sendOtp);
router.post('/verify-otp', otpLimiter, verifyOtp);
router.post('/admin/login', adminLogin);
router.post('/refresh-token', refreshToken);

// Private routes
router.post('/register', protectCustomer, registerCustomer);
router.post('/driver/register', protectDriver, registerDriver);

module.exports = router;