const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/customerController');
const { protectCustomer } = require('../middlewares/auth');
const { uploadProfilePic: uploadProfilePicMiddleware } = require('../config/cloudinary');

// All routes require customer auth
router.use(protectCustomer);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/profile-pic', uploadProfilePicMiddleware.single('profilePic'), uploadProfilePic);

router.get('/saved-places', getSavedPlaces);
router.post('/saved-places', addSavedPlace);
router.delete('/saved-places/:id', deleteSavedPlace);

router.get('/wallet', getWallet);

router.post('/sos-contacts', addSosContact);
router.delete('/sos-contacts/:id', deleteSosContact);

router.get('/promos', getAvailablePromos);
router.get('/active-ride', getActiveRide);
router.post('/fcm-token', updateFcmToken);

module.exports = router;