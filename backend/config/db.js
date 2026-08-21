const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Connect to MongoDB
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    // Create 2dsphere index on Driver.currentLocation for geo queries
    const driverCollection = conn.connection.collection('drivers');
    await driverCollection.createIndex({ currentLocation: '2dsphere' });
    logger.info('2dsphere index created on drivers.currentLocation');

    return conn;
  } catch (err) {
    logger.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;