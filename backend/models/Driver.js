const mongoose = require('mongoose');

/**
 * Driver schema
 */
const driverSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: [true, 'Name is required'],
    },
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      unique: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    profilePic: {
      type: String,
      default: '',
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      default: 'other',
    },
    documents: {
      license: {
        url: { type: String, default: '' },
        number: { type: String, default: '' },
        expiryDate: { type: Date, default: null },
        verified: { type: Boolean, default: false },
      },
      rc: {
        url: { type: String, default: '' },
        number: { type: String, default: '' },
        verified: { type: Boolean, default: false },
      },
      insurance: {
        url: { type: String, default: '' },
        policyNumber: { type: String, default: '' },
        expiryDate: { type: Date, default: null },
        verified: { type: Boolean, default: false },
      },
      aadhaar: {
        url: { type: String, default: '' },
        number: { type: String, default: '' },
        verified: { type: Boolean, default: false },
      },
      verificationStatus: {
        type: String,
        enum: ['pending', 'submitted', 'approved', 'rejected'],
        default: 'pending',
      },
      rejectionReason: {
        type: String,
        default: '',
      },
    },
    vehicle: {
      type: {
        type: String,
        enum: ['bike', 'auto', 'cabmini', 'cabsedan'],
        required: [true, 'Vehicle type is required'],
      },
      number: {
        type: String,
        default: '',
        uppercase: true,
        trim: true,
      },
      model: {
        type: String,
        default: '',
      },
      color: {
        type: String,
        default: '',
      },
      year: {
        type: Number,
        default: null,
      },
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [0, 0], // [longitude, latitude]
      },
    },
    lastLocationUpdateAt: {
      type: Date,
      default: null,
    },
    isBusy: {
      type: Boolean,
      default: false, // true when on a trip
    },
    rating: {
      type: Number,
      default: 5,
      min: 1,
      max: 5,
    },
    totalTrips: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    todayEarnings: {
      type: Number,
      default: 0,
    },
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    fcmToken: {
      type: String,
      default: null,
    },
    bankDetails: {
      accountHolderName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      upiId: { type: String, default: '' },
      verified: { type: Boolean, default: false },
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// 2dsphere index for geo queries (finding nearby drivers)
driverSchema.index({ currentLocation: '2dsphere' });

// Indexes for common queries
driverSchema.index({ isOnline: 1, isApproved: 1, isBlocked: 1, isBusy: 1, 'vehicle.type': 1 });
driverSchema.index({ 'documents.verificationStatus': 1 });

// Virtual for driver id
driverSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// Ensure virtuals are included in JSON
driverSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Driver', driverSchema);