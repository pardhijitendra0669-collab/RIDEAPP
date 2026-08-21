const PricingRule = require('../models/PricingRule');
const { AppError } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

const normalizeCity = (city) => String(city || '').trim().toLowerCase();

const looksLikeCoordinate = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  return /^-?\d+(\.\d+)?$/.test(text);
};

/**
 * Pricing Engine — calculates transparent, fair fares
 * fare = baseFare + (distance_km * perKmRate) + (duration_min * perMinRate)
 * fare = fare * surgeMultiplier (if applicable)
 * fare = max(fare, minFare)
 */

/**
 * Get pricing rule for a city and vehicle type
 */
const getPricingRule = async (city, vehicleType) => {
  const normalizedCity = normalizeCity(city);

  const rule = await PricingRule.findOne({
    city: normalizedCity,
    vehicleType,
    isActive: true,
  });

  if (rule) {
    return rule;
  }

  // Fallback to any active rule for this vehicle type when city is invalid/missing
  // or when that city is not configured yet.
  const fallbackRule = await PricingRule.findOne({
    vehicleType,
    isActive: true,
  }).sort({ updatedAt: -1 });

  if (fallbackRule) {
    logger.warn(
      `Pricing fallback used for vehicleType=${vehicleType}. Requested city="${city}" resolved to configured city="${fallbackRule.city}"`
    );
    return fallbackRule;
  }

  if (looksLikeCoordinate(normalizedCity)) {
    throw new AppError(`Invalid city value received for fare calculation: ${city}`, 400);
  }

  throw new AppError(`No pricing rule configured for ${vehicleType} in ${city}`, 404);
};

/**
 * Check if night charges apply based on hour
 */
const isNightTime = (rule, date = new Date()) => {
  const hour = date.getHours();
  const start = rule.nightChargeStartHour;
  const end = rule.nightChargeEndHour;

  if (start < end) {
    // e.g. 23 to 5 (crosses midnight handled below)
    return hour >= start && hour < end;
  } else {
    // e.g. 23 to 5 — crosses midnight
    return hour >= start || hour < end;
  }
};

/**
 * Calculate fare estimate
 * @param {Object} params
 * @param {string} params.city
 * @param {string} params.vehicleType
 * @param {number} params.distanceKm
 * @param {number} params.durationMin
 * @param {number} params.surgeMultiplier - optional override
 * @param {Date} params.date - optional, for testing night charges
 */
const calculateFare = async ({ city, vehicleType, distanceKm, durationMin, surgeMultiplier, date }) => {
  const rule = await getPricingRule(city, vehicleType);

  // Base calculation
  let fare = rule.baseFare + distanceKm * rule.perKmRate + durationMin * rule.perMinRate;

  // Apply surge multiplier
  const effectiveSurge = surgeMultiplier || rule.surgeMultiplier || 1;
  fare = fare * effectiveSurge;

  // Apply night charge multiplier
  const nightTime = isNightTime(rule, date);
  if (nightTime) {
    fare = fare * rule.nightChargeMultiplier;
  }

  // Apply minimum fare
  let minFareApplied = false;
  if (fare < rule.minFare) {
    fare = rule.minFare;
    minFareApplied = true;
  }

  // Round to nearest rupee
  fare = Math.round(fare);

  return {
    baseFare: rule.baseFare,
    perKmRate: rule.perKmRate,
    perMinRate: rule.perMinRate,
    distanceKm,
    durationMin,
    surgeMultiplier: effectiveSurge,
    nightChargeMultiplier: nightTime ? rule.nightChargeMultiplier : 1,
    nightTimeApplied: nightTime,
    estimatedFare: fare,
    minFare: rule.minFare,
    minFareApplied,
    currency: 'INR',
    ruleId: rule._id,
  };
};

/**
 * Calculate final fare after trip completion
 * Uses actual distance & duration
 */
const calculateFinalFare = async ({ city, vehicleType, actualDistanceKm, actualDurationMin, surgeMultiplier, date }) => {
  const estimate = await calculateFare({
    city,
    vehicleType,
    distanceKm: actualDistanceKm,
    durationMin: actualDurationMin,
    surgeMultiplier,
    date,
  });

  return {
    ...estimate,
    finalFare: estimate.estimatedFare,
  };
};

/**
 * Calculate cancellation charge
 */
const calculateCancellationCharge = async (city, vehicleType) => {
  const rule = await getPricingRule(city, vehicleType);
  return rule.cancellationCharge || 0;
};

/**
 * Get all pricing rules (for admin)
 */
const getAllPricingRules = async (filter = {}) => {
  return await PricingRule.find(filter).sort({ city: 1, vehicleType: 1 });
};

/**
 * Create or update pricing rule
 */
const upsertPricingRule = async (data, adminId) => {
  const { city, vehicleType } = data;

  const existing = await PricingRule.findOne({ city: city.toLowerCase(), vehicleType });

  if (existing) {
    // Update existing
    Object.assign(existing, data, { city: city.toLowerCase() });
    await existing.save();
    return { rule: existing, created: false };
  }

  // Create new
  const rule = await PricingRule.create({
    ...data,
    city: city.toLowerCase(),
    createdBy: adminId,
  });
  return { rule, created: true };
};

/**
 * Get surge multiplier based on demand (simplified)
 * In production, this would factor in active drivers vs ride requests
 */
const getSurgeMultiplier = async (city, vehicleType) => {
  const rule = await getPricingRule(city, vehicleType);
  return rule.surgeMultiplier || 1;
};

module.exports = {
  calculateFare,
  calculateFinalFare,
  calculateCancellationCharge,
  getAllPricingRules,
  upsertPricingRule,
  getSurgeMultiplier,
  getPricingRule,
};