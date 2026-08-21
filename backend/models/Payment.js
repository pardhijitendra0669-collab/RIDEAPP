const mongoose = require('mongoose');

/**
 * Payment / Transaction schema
 */
const paymentSchema = new mongoose.Schema(
  {
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      default: null,
    },
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
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: 0,
    },
    method: {
      type: String,
      enum: ['cash', 'upi', 'card', 'wallet', 'refund', 'payout'],
      required: [true, 'Payment method is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'initiated'],
      default: 'pending',
    },
    razorpayOrderId: {
      type: String,
      default: null,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    transactionId: {
      type: String,
      unique: true,
      sparse: true,
    },
    description: {
      type: String,
      default: '',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ driverId: 1, createdAt: -1 });
paymentSchema.index({ rideId: 1 });

// Generate transaction id before save
paymentSchema.pre('save', function (next) {
  if (!this.transactionId) {
    this.transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
  }
  next();
});

paymentSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

paymentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Payment', paymentSchema);