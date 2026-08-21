const Admin = require('../models/Admin');
const PricingRule = require('../models/PricingRule');
const logger = require('./logger');

/**
 * Seed default data:
 * - Default admin account
 * - Default pricing rules for common cities & vehicle types
 */

const DEFAULT_CITIES = ['delhi', 'mumbai', 'bangalore', 'hyderabad', 'pune', 'jaipur', 'lucknow', 'indore'];

const DEFAULT_PRICING = {
  bike: { baseFare: 20, perKmRate: 6, perMinRate: 1, minFare: 25 },
  auto: { baseFare: 30, perKmRate: 10, perMinRate: 1.5, minFare: 40 },
  cabmini: { baseFare: 50, perKmRate: 12, perMinRate: 2, minFare: 60 },
  cabsedan: { baseFare: 70, perKmRate: 15, perMinRate: 2.5, minFare: 80 },
};

const seedDatabase = async () => {
  try {
    // Seed default admin
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      await Admin.create({
        name: 'Super Admin',
        email: process.env.ADMIN_DEFAULT_EMAIL || 'admin@rideapp.com',
        password: process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@123',
        role: 'super_admin',
        permissions: [
          'manage_drivers',
          'manage_customers',
          'manage_rides',
          'manage_pricing',
          'manage_promos',
          'manage_payouts',
          'view_reports',
          'broadcast_notifications',
          'manage_support',
        ],
      });
      logger.info('✅ Default admin created');
    }

    // Seed default pricing rules
    const pricingCount = await PricingRule.countDocuments();
    if (pricingCount === 0) {
      for (const city of DEFAULT_CITIES) {
        for (const [vehicleType, rates] of Object.entries(DEFAULT_PRICING)) {
          const admin = await Admin.findOne();
          await PricingRule.create({
            city,
            vehicleType,
            ...rates,
            surgeMultiplier: 1,
            nightChargeMultiplier: 1.25,
            nightChargeStartHour: 23,
            nightChargeEndHour: 5,
            cancellationCharge: vehicleType === 'bike' ? 10 : 20,
            waitChargePerMin: 1,
            freeWaitMinutes: 5,
            isActive: true,
            createdBy: admin._id,
          });
        }
      }
      logger.info(`✅ Seeded pricing rules for ${DEFAULT_CITIES.length} cities x 4 vehicle types`);
    }

    return { success: true };
  } catch (err) {
    logger.error(`Seed error: ${err.message}`);
    return { success: false, error: err.message };
  }
};

module.exports = { seedDatabase };