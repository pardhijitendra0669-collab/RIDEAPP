const Razorpay = require('razorpay');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const Ride = require('../models/Ride');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { AppError, asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

// Lazy-initialize Razorpay (only when keys are configured)
let razorpay = null;

const getRazorpay = () => {
  if (!razorpay) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new AppError('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env', 500);
    }
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
};

/**
 * @desc    Create Razorpay order for ride payment
 * @route   POST /api/payments/create-order
 * @access  Private (customer)
 */
const createOrder = asyncHandler(async (req, res, next) => {
  const { rideId } = req.body;

  if (!rideId) {
    return next(new AppError('Ride ID is required', 400));
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    return next(new AppError('Ride not found', 404));
  }

  if (ride.customerId.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized for this ride', 403));
  }

  if (ride.status !== 'completed') {
    return next(new AppError('Ride must be completed to make payment', 400));
  }

  if (ride.paymentStatus === 'completed') {
    return next(new AppError('Payment already completed for this ride', 400));
  }

  const amount = ride.finalFare || ride.fareEstimate.estimatedFare;

  // Create Razorpay order
  const options = {
    amount: Math.round(amount * 100), // Razorpay expects amount in paise
    currency: 'INR',
    receipt: `ride_${ride.rideNumber}`,
    notes: {
      rideId: ride._id.toString(),
      rideNumber: ride.rideNumber,
      customerId: ride.customerId.toString(),
    },
  };

  const order = await getRazorpay().orders.create(options);

  // Save payment record
  const payment = await Payment.create({
    rideId: ride._id,
    userId: req.user._id,
    driverId: ride.driverId,
    amount,
    method: 'upi',
    status: 'initiated',
    razorpayOrderId: order.id,
    description: `Ride ${ride.rideNumber} payment`,
  });

  res.json({
    success: true,
    data: {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      paymentId: payment._id,
    },
  });
});

/**
 * @desc    Verify Razorpay payment (from frontend callback)
 * @route   POST /api/payments/verify
 * @access  Private (customer)
 */
const verifyPayment = asyncHandler(async (req, res, next) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, rideId } = req.body;

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return next(new AppError('Payment verification data is required', 400));
  }

  // Verify signature
  const body = razorpayOrderId + '|' + razorpayPaymentId;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest('hex');

  if (expectedSignature !== razorpaySignature) {
    return next(new AppError('Invalid payment signature', 400));
  }

  // Find payment record
  const payment = await Payment.findOne({ razorpayOrderId });
  if (!payment) {
    return next(new AppError('Payment record not found', 404));
  }

  // Update payment
  payment.razorpayPaymentId = razorpayPaymentId;
  payment.razorpaySignature = razorpaySignature;
  payment.status = 'completed';
  payment.paidAt = new Date();
  await payment.save();

  // Update ride
  if (payment.rideId) {
    const ride = await Ride.findById(payment.rideId);
    if (ride) {
      ride.paymentStatus = 'completed';
      await ride.save();
    }
  }

  res.json({
    success: true,
    message: 'Payment verified successfully',
    data: payment,
  });
});

/**
 * @desc    Razorpay webhook handler
 * @route   POST /api/payments/webhook
 * @access  Public (Razorpay calls this)
 */
const webhook = asyncHandler(async (req, res, next) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // Verify webhook signature
  const signature = req.headers['x-razorpay-signature'];
  if (!signature) {
    return next(new AppError('Missing webhook signature', 400));
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (expectedSignature !== signature) {
    return next(new AppError('Invalid webhook signature', 400));
  }

  const { event, payload } = req.body;

  logger.info(`Razorpay webhook event: ${event}`);

  switch (event) {
    case 'payment.captured':
    case 'payment.authorized': {
      const { order_id, id: paymentId } = payload.payment.entity;

      // Find payment record
      const payment = await Payment.findOne({ razorpayOrderId: order_id });
      if (payment) {
        payment.razorpayPaymentId = paymentId;
        payment.status = 'completed';
        payment.paidAt = new Date();
        await payment.save();

        // Update ride
        if (payment.rideId) {
          const ride = await Ride.findById(payment.rideId);
          if (ride) {
            ride.paymentStatus = 'completed';
            await ride.save();
          }
        }
      }
      break;
    }

    case 'payment.failed': {
      const { order_id } = payload.payment.entity;
      const payment = await Payment.findOne({ razorpayOrderId: order_id });
      if (payment) {
        payment.status = 'failed';
        await payment.save();
      }
      break;
    }

    case 'refund.processed': {
      const { payment_id } = payload.refund.entity;
      const payment = await Payment.findOne({ razorpayPaymentId: payment_id });
      if (payment) {
        payment.status = 'refunded';
        await payment.save();
      }
      break;
    }

    default:
      logger.info(`Unhandled webhook event: ${event}`);
  }

  // Always respond 200 to Razorpay
  res.json({ received: true });
});

/**
 * @desc    Pay with wallet
 * @route   POST /api/payments/wallet
 * @access  Private (customer)
 */
const payWithWallet = asyncHandler(async (req, res, next) => {
  const { rideId } = req.body;

  if (!rideId) {
    return next(new AppError('Ride ID is required', 400));
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    return next(new AppError('Ride not found', 404));
  }

  if (ride.customerId.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized for this ride', 403));
  }

  if (ride.status !== 'completed') {
    return next(new AppError('Ride must be completed to make payment', 400));
  }

  if (ride.paymentStatus === 'completed') {
    return next(new AppError('Payment already completed for this ride', 400));
  }

  const amount = ride.finalFare || ride.fareEstimate.estimatedFare;

  // Check wallet balance
  const user = req.user;
  if (user.walletBalance < amount) {
    return next(new AppError(`Insufficient wallet balance. Need ₹${amount}, have ₹${user.walletBalance}`, 400));
  }

  // Deduct from wallet
  user.walletBalance -= amount;
  await user.save();

  // Create wallet transaction
  await Wallet.create({
    userId: user._id,
    type: 'debit',
    amount,
    balanceAfter: user.walletBalance,
    source: 'ride_payment',
    reference: ride.rideNumber,
    description: `Payment for ride ${ride.rideNumber}`,
  });

  // Update ride
  ride.paymentStatus = 'completed';
  ride.paymentMode = 'wallet';
  await ride.save();

  // Create payment record
  const payment = await Payment.create({
    rideId: ride._id,
    userId: user._id,
    driverId: ride.driverId,
    amount,
    method: 'wallet',
    status: 'completed',
    paidAt: new Date(),
    description: `Ride ${ride.rideNumber} wallet payment`,
  });

  res.json({
    success: true,
    message: 'Payment successful',
    data: {
      payment,
      walletBalance: user.walletBalance,
    },
  });
});

/**
 * @desc    Get payment history
 * @route   GET /api/payments/history
 * @access  Private (customer)
 */
const getPaymentHistory = asyncHandler(async (req, res, next) => {
  const payments = await Payment.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('rideId', 'rideNumber pickupLocation dropLocation');

  res.json({
    success: true,
    data: payments,
  });
});

module.exports = {
  createOrder,
  verifyPayment,
  webhook,
  payWithWallet,
  getPaymentHistory,
};