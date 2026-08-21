const express = require('express');
const router = express.Router();
const {
  getDashboard,
  getDrivers,
  getDriverDetails,
  approveDriver,
  blockDriver,
  getCustomers,
  blockCustomer,
  getRides,
  getLiveRides,
  getPricingRules,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  getPromos,
  createPromo,
  updatePromo,
  deletePromo,
  getRevenueReport,
  getDriverReport,
  broadcastNotification,
  getAdmins,
  createAdmin,
  debugMatching,
} = require('../controllers/adminController');
const { protectAdmin } = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/roleCheck');

// All routes require admin auth
router.use(protectAdmin);

// Dashboard
router.get('/dashboard', getDashboard);

// Driver management
router.get('/drivers', getDrivers);
router.get('/drivers/:id', getDriverDetails);
router.put('/drivers/:id/approve', checkPermission('manage_drivers'), approveDriver);
router.put('/drivers/:id/block', checkPermission('manage_drivers'), blockDriver);

// Customer management
router.get('/customers', getCustomers);
router.put('/customers/:id/block', checkPermission('manage_customers'), blockCustomer);

// Ride management
router.get('/rides', getRides);
router.get('/rides/live', getLiveRides);

// Pricing management
router.get('/pricing', getPricingRules);
router.post('/pricing', checkPermission('manage_pricing'), createPricingRule);
router.put('/pricing/:id', checkPermission('manage_pricing'), updatePricingRule);
router.delete('/pricing/:id', checkPermission('manage_pricing'), deletePricingRule);

// Promo management
router.get('/promos', getPromos);
router.post('/promo', checkPermission('manage_promos'), createPromo);
router.put('/promo/:id', checkPermission('manage_promos'), updatePromo);
router.delete('/promo/:id', checkPermission('manage_promos'), deletePromo);

// Reports
router.get('/reports/revenue', checkPermission('view_reports'), getRevenueReport);
router.get('/reports/drivers', checkPermission('view_reports'), getDriverReport);

// Debug tools
router.get('/debug/matching', checkPermission('manage_drivers'), debugMatching);

// Notifications
router.post('/broadcast', checkPermission('broadcast_notifications'), broadcastNotification);

// Admin management
router.get('/admins', getAdmins);
router.post('/admins', checkPermission('manage_drivers'), createAdmin);

module.exports = router;