const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Admin schema
 */
const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['super_admin', 'operations', 'finance', 'support'],
      default: 'operations',
    },
    permissions: {
      type: [String],
      enum: [
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
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Hash password before save
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
adminSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

adminSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

adminSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model('Admin', adminSchema);