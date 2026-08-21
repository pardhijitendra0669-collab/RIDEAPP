const mongoose = require('mongoose');

/**
 * User (Customer) schema
 */
const userSchema = new mongoose.Schema(
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
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say'],
      default: 'prefer_not_to_say',
    },
    profilePic: {
      type: String,
      default: '',
    },
    savedPlaces: [
      {
        label: { type: String, enum: ['home', 'work', 'other'] },
        name: { type: String },
        address: { type: String },
        location: {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: { type: [Number], required: true }, // [lng, lat]
        },
      },
    ],
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    fcmToken: {
      type: String,
      default: null,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    rating: {
      type: Number,
      default: 5,
      min: 1,
      max: 5,
    },
    totalRides: {
      type: Number,
      default: 0,
    },
    sosContacts: [
      {
        name: { type: String },
        mobile: { type: String },
        relation: { type: String },
      },
    ],
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for geo queries on saved places
userSchema.index({ 'savedPlaces.location': '2dsphere' });

// Generate referral code before save
userSchema.pre('save', async function (next) {
  if (!this.referralCode) {
    this.referralCode = `RD${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }
  next();
});

// Virtual for user id
userSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// Ensure virtuals are included in JSON
userSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);