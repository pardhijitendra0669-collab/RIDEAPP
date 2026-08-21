const mongoose = require('mongoose');

/**
 * Promo code schema
 */
const promoSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Promo code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: [true, 'Discount type is required'],
    },
    discountValue: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: 0,
    },
    minFare: {
      type: Number,
      default: 0, // minimum fare for promo to apply
    },
    maxDiscount: {
      type: Number,
      default: null, // cap on discount amount (for percentage type)
    },
    expiryDate: {
      type: Date,
      required: [true, 'Expiry date is required'],
    },
    usageLimit: {
      type: Number,
      default: null, // null = unlimited
    },
    perUserLimit: {
      type: Number,
      default: 1,
    },
    usedBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        usedAt: { type: Date, default: Date.now },
        rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride' },
      },
    ],
    applicableVehicleTypes: {
      type: [String],
      enum: ['bike', 'auto', 'cabmini', 'cabsedan'],
      default: ['bike', 'auto', 'cabmini', 'cabsedan'],
    },
    applicableCities: {
      type: [String],
      default: [], // empty = all cities
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

// Indexes
promoSchema.index({ code: 1 });
promoSchema.index({ isActive: 1, expiryDate: 1 });

// Method: check if promo is valid for a user
promoSchema.methods.isValidForUser = function (userId, fareAmount, vehicleType, city) {
  // Check active
  if (!this.isActive) {
    return { valid: false, reason: 'Promo code is inactive' };
  }

  // Check expiry
  if (this.expiryDate < new Date()) {
    return { valid: false, reason: 'Promo code has expired' };
  }

  // Check usage limit
  if (this.usageLimit && this.usedBy.length >= this.usageLimit) {
    return { valid: false, reason: 'Promo code usage limit reached' };
  }

  // Check per-user limit
  const userUsage = this.usedBy.filter((u) => u.userId.toString() === userId.toString()).length;
  if (userUsage >= this.perUserLimit) {
    return { valid: false, reason: 'Promo code limit reached for this user' };
  }

  // Check minimum fare
  if (fareAmount < this.minFare) {
    return { valid: false, reason: `Minimum fare of ₹${this.minFare} required` };
  }

  // Check vehicle type
  if (this.applicableVehicleTypes.length > 0 && !this.applicableVehicleTypes.includes(vehicleType)) {
    return { valid: false, reason: 'Promo not applicable for this vehicle type' };
  }

  // Check city
  if (this.applicableCities.length > 0 && !this.applicableCities.includes(city)) {
    return { valid: false, reason: 'Promo not applicable in this city' };
  }

  return { valid: true };
};

// Method: calculate discount amount
promoSchema.methods.calculateDiscount = function (fareAmount) {
  let discount = 0;
  if (this.discountType === 'percentage') {
    discount = (fareAmount * this.discountValue) / 100;
    if (this.maxDiscount) {
      discount = Math.min(discount, this.maxDiscount);
    }
  } else {
    discount = this.discountValue;
  }
  return Math.min(discount, fareAmount);
};

promoSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

promoSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Promo', promoSchema);