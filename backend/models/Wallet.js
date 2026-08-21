const mongoose = require('mongoose');

/**
 * Wallet transaction schema
 */
const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    source: {
      type: String,
      enum: [
        'ride_payment',
        'refund',
        'cashback',
        'referral_bonus',
        'promo',
        'wallet_topup',
        'earnings',
        'payout',
        'adjustment',
      ],
      required: true,
    },
    reference: {
      type: String,
      default: '', // e.g. rideId, promoCode
    },
    description: {
      type: String,
      default: '',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
walletSchema.index({ userId: 1, createdAt: -1 });
walletSchema.index({ driverId: 1, createdAt: -1 });
walletSchema.index({ source: 1, createdAt: -1 });

walletSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

walletSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Wallet', walletSchema);