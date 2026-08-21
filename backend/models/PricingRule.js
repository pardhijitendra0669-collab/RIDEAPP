const mongoose = require('mongoose');

/**
 * PricingRule schema — admin configurable per city & vehicle type
 * This is the key differentiator: fair, transparent pricing
 */
const pricingRuleSchema = new mongoose.Schema(
  {
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      lowercase: true,
    },
    vehicleType: {
      type: String,
      enum: ['bike', 'auto', 'cabmini', 'cabsedan'],
      required: [true, 'Vehicle type is required'],
    },
    baseFare: {
      type: Number,
      required: [true, 'Base fare is required'],
      min: 0,
    },
    perKmRate: {
      type: Number,
      required: [true, 'Per km rate is required'],
      min: 0,
    },
    perMinRate: {
      type: Number,
      required: [true, 'Per minute rate is required'],
      min: 0,
    },
    minFare: {
      type: Number,
      required: [true, 'Minimum fare is required'],
      min: 0,
    },
    surgeMultiplier: {
      type: Number,
      default: 1,
      min: 1,
    },
    nightChargeMultiplier: {
      type: Number,
      default: 1,
      min: 1,
    },
    nightChargeStartHour: {
      type: Number,
      default: 23, // 11 PM
      min: 0,
      max: 23,
    },
    nightChargeEndHour: {
      type: Number,
      default: 5, // 5 AM
      min: 0,
      max: 23,
    },
    cancellationCharge: {
      type: Number,
      default: 0,
    },
    waitChargePerMin: {
      type: Number,
      default: 0,
    },
    freeWaitMinutes: {
      type: Number,
      default: 5,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique index to prevent duplicate rules for same city+vehicle
pricingRuleSchema.index({ city: 1, vehicleType: 1 }, { unique: true });
pricingRuleSchema.index({ isActive: 1 });

pricingRuleSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

pricingRuleSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('PricingRule', pricingRuleSchema);