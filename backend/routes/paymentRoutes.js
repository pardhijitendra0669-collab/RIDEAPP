const express = require('express');
const router = express.Router();
const {
  createOrder,
  verifyPayment,
  webhook,
  payWithWallet,
  getPaymentHistory,
} = require('../controllers/paymentsController');
const { protectCustomer } = require('../middlewares/auth');

// Public webhook (Razorpay calls this)
router.post('/webhook', webhook);

// Customer routes
router.post('/create-order', protectCustomer, createOrder);
router.post('/verify', protectCustomer, verifyPayment);
router.post('/wallet', protectCustomer, payWithWallet);
router.get('/history', protectCustomer, getPaymentHistory);

module.exports = router;