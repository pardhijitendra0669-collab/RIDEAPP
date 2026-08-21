const express = require('express');
const router = express.Router();
const {
  estimateFare,
  bookRide,
  getRide,
  cancelRide,
  rateRide,
  getRideHistory,
  triggerSOS,
} = require('../controllers/ridesController');
const { protectCustomer, protectDriver, protectAdmin } = require('../middlewares/auth');

/**
 * Middleware to allow any authenticated role (customer/driver/admin)
 */
const protectAny = (req, res, next) => {
  const jwt = require('jsonwebtoken');
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: { message: 'Not authorized' } });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role === 'customer') return protectCustomer(req, res, next);
    if (decoded.role === 'driver') return protectDriver(req, res, next);
    if (decoded.role === 'admin') return protectAdmin(req, res, next);
    return res.status(401).json({ success: false, error: { message: 'Invalid role' } });
  } catch (err) {
    return res.status(401).json({ success: false, error: { message: 'Invalid token' } });
  }
};

/**
 * Middleware to allow customer or driver (for rating)
 */
const protectCustomerOrDriver = (req, res, next) => {
  const jwt = require('jsonwebtoken');
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: { message: 'Not authorized' } });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role === 'customer') return protectCustomer(req, res, next);
    if (decoded.role === 'driver') return protectDriver(req, res, next);
    return res.status(401).json({ success: false, error: { message: 'Invalid role' } });
  } catch (err) {
    return res.status(401).json({ success: false, error: { message: 'Invalid token' } });
  }
};

// Customer routes
router.post('/estimate-fare', protectCustomer, estimateFare);
router.post('/book', protectCustomer, bookRide);
router.get('/history', protectCustomer, getRideHistory);
router.post('/:id/sos', protectCustomer, triggerSOS);

// Shared routes (customer/driver/admin)
router.get('/:id', protectAny, getRide);
router.post('/:id/cancel', protectAny, cancelRide);
router.post('/:id/rate', protectCustomerOrDriver, rateRide);

module.exports = router;