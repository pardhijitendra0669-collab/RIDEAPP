const express = require('express');
const router = express.Router();
const {
  getProfile,
  updateProfile,
  uploadDocuments,
  toggleStatus,
  updateLocation,
  acceptRide,
  rejectRide,
  arrivedAtPickup,
  startRide,
  completeRide,
  getEarnings,
  getRideHistory,
  updateBankDetails,
  requestPayout,
  getActiveRide,
} = require('../controllers/driverController');
const { protectDriver } = require('../middlewares/auth');
const { uploadDriverDoc } = require('../config/cloudinary');

// All routes require driver auth
router.use(protectDriver);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/documents/upload', uploadDriverDoc.single('document'), uploadDocuments);

router.post('/toggle-status', toggleStatus);
router.post('/location', updateLocation);

router.get('/earnings', getEarnings);
router.get('/rides', getRideHistory);

router.post('/bank-details', updateBankDetails);
router.post('/payout', requestPayout);

router.get('/active-ride', getActiveRide);

// Ride actions
router.post('/rides/:id/accept', acceptRide);
router.post('/rides/:id/reject', rejectRide);
router.post('/rides/:id/arrived', arrivedAtPickup);
router.post('/rides/:id/start', startRide);
router.post('/rides/:id/complete', completeRide);

module.exports = router;