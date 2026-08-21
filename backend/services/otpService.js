const crypto = require('crypto');
const logger = require('../utils/logger');
const { sendOTP } = require('./notificationService');

/**
 * OTP Service — generate, store, and verify OTPs
 * 
 * In production, use Twilio Verify service for OTP.
 * For development, OTPs are stored in memory and logged to console.
 */

// In-memory OTP store (use Redis in production)
const otpStore = new Map();

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

/**
 * Generate a 6-digit OTP
 */
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Send OTP to a mobile number
 * @param {string} mobile - 10-digit mobile number
 * @param {string} role - 'customer' | 'driver'
 */
const sendOtp = async (mobile, role = 'customer') => {
  // Rate limit: max 3 OTP sends per 10 minutes per mobile
  const key = `otp:${role}:${mobile}`;
  const existing = otpStore.get(key);

  if (existing && existing.sendCount >= 3) {
    const timeSinceFirst = Date.now() - existing.firstSentAt;
    if (timeSinceFirst < 10 * 60 * 1000) {
      throw new Error('Too many OTP requests. Please try again after 10 minutes.');
    }
  }

  const otp = generateOTP();

  // Store OTP
  otpStore.set(key, {
    otp,
    mobile,
    role,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
    sendCount: existing ? existing.sendCount + 1 : 1,
    firstSentAt: existing ? existing.firstSentAt : Date.now(),
    verified: false,
  });

  // Send OTP via SMS (logged in dev)
  await sendOTP(mobile, otp);

  logger.info(`OTP sent to ${mobile} (${role}): ${otp}`);

  // In development, return the OTP so it can be tested easily
  // In production, never return the OTP
  return {
    success: true,
    message: 'OTP sent successfully',
    devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
  };
};

/**
 * Verify OTP
 * @param {string} mobile - 10-digit mobile number
 * @param {string} otp - 6-digit OTP
 * @param {string} role - 'customer' | 'driver'
 */
const verifyOtp = async (mobile, otp, role = 'customer') => {
  const key = `otp:${role}:${mobile}`;
  const record = otpStore.get(key);

  if (!record) {
    return { valid: false, reason: 'No OTP found. Please request a new OTP.' };
  }

  // Check expiry
  if (Date.now() > record.expiresAt) {
    otpStore.delete(key);
    return { valid: false, reason: 'OTP has expired. Please request a new OTP.' };
  }

  // Check attempts
  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(key);
    return { valid: false, reason: 'Too many incorrect attempts. Please request a new OTP.' };
  }

  // Check if already verified
  if (record.verified) {
    return { valid: false, reason: 'OTP already used. Please request a new OTP.' };
  }

  // Verify
  if (record.otp === otp) {
    record.verified = true;
    otpStore.delete(key); // OTP is single-use
    return { valid: true };
  }

  record.attempts += 1;
  otpStore.set(key, record);
  return { valid: false, reason: 'Invalid OTP. Please try again.' };
};

/**
 * Clean up expired OTPs (call periodically)
 */
const cleanupExpiredOtps = () => {
  const now = Date.now();
  for (const [key, record] of otpStore.entries()) {
    if (now > record.expiresAt) {
      otpStore.delete(key);
    }
  }
};

// Run cleanup every 10 minutes
setInterval(cleanupExpiredOtps, 10 * 60 * 1000);

module.exports = {
  sendOtp,
  verifyOtp,
  generateOTP,
};