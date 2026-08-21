const mongoose = require('mongoose');

/**
 * Ride schema
 */
const rideSchema = new mongoose.Schema(
  {
    rideNumber: {
      type: String,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer is required'],
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },
    pickupLocation: {
      address: { type: String, required: true },
      location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true }, // [lng, lat]
      },
    },
    dropLocation: {
      address: { type: String, required: true },
      location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true }, // [lng, lat]
      },
    },
    vehicleType: {
      type: String,
      enum: ['bike', 'auto', 'cabmini', 'cabsedan'],
      required: [true, 'Vehicle type is required'],
    },
    status: {
      type: String,
      enum: [
        'requested',
        'searching',
        'accepted',
        'arrived',
        'started',
        'completed',
        'cancelled',
        'no_driver_found',
      ],
      default: 'requested',
    },
    otp: {
      type: String,
      required: true,
    },
    fareEstimate: {
      baseFare: { type: Number },
      perKmRate: { type: Number },
      perMinRate: { type: Number },
      distanceKm: { type: Number },
      durationMin: { type: Number },
      surgeMultiplier: { type: Number, default: 1 },
      estimatedFare: { type: Number },
      minFareApplied: { type: Boolean, default: false },
      currency: { type: String, default: 'INR' },
    },
    finalFare: {
      type: Number,
      default: null,
    },
    distanceKm: {
      type: Number,
      default: 0,
    },
    durationMin: {
      type: Number,
      default: 0,
    },
    actualDistanceKm: {
      type: Number,
      default: 0,
    },
    actualDurationMin: {
      type: Number,
      default: 0,
    },
    paymentMode: {
      type: String,
      enum: ['cash', 'upi', 'card', 'wallet'],
      default: 'cash',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
    promoCode: {
      type: String,
      default: null,
    },
    discountApplied: {
      type: Number,
      default: 0,
    },
    cancellation: {
      cancelledBy: {
        type: String,
        enum: ['customer', 'driver', 'admin', 'system'],
        default: null,
      },
      reason: { type: String, default: '' },
      cancelledAt: { type: Date, default: null },
      cancellationCharge: { type: Number, default: 0 },
    },
    ratings: {
      customerRating: {
        rating: { type: Number, min: 1, max: 5 },
        comment: { type: String, default: '' },
        ratedAt: { type: Date },
      },
      driverRating: {
        rating: { type: Number, min: 1, max: 5 },
        comment: { type: String, default: '' },
        ratedAt: { type: Date },
      },
    },
    route: [
      {
        lat: { type: Number },
        lng: { type: Number },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    matchedDrivers: [
      {
        driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
        status: {
          type: String,
          enum: ['pending', 'accepted', 'rejected', 'timeout'],
        },
        sentAt: { type: Date, default: Date.now },
        respondedAt: { type: Date },
      },
    ],
    currentMatchedDriverIndex: {
      type: Number,
      default: 0,
    },
    driverLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
      updatedAt: { type: Date, default: null },
    },
    timestamps: {
      requestedAt: { type: Date, default: Date.now },
      acceptedAt: { type: Date, default: null },
      arrivedAt: { type: Date, default: null },
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      cancelledAt: { type: Date, default: null },
    },
    emergencySos: {
      triggered: { type: Boolean, default: false },
      triggeredAt: { type: Date },
      sharedWith: [{ type: String }], // phone numbers notified
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
rideSchema.index({ status: 1, vehicleType: 1, requestedAt: -1 });
rideSchema.index({ customerId: 1, requestedAt: -1 });
rideSchema.index({ driverId: 1, requestedAt: -1 });
rideSchema.index({ 'pickupLocation.location': '2dsphere' });
rideSchema.index({ 'dropLocation.location': '2dsphere' });
rideSchema.index({ status: 1, driverId: 1 });

// Generate ride number before save
rideSchema.pre('save', async function (next) {
  if (!this.rideNumber) {
    const date = new Date();
    const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
      date.getDate()
    ).padStart(2, '0')}`;
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    this.rideNumber = `R${ymd}${rand}`;
  }
  next();
});

// Virtual for ride id
rideSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// Ensure virtuals are included in JSON
rideSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Ride', rideSchema);