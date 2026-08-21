const logger = require('../utils/logger');
const User = require('../models/User');
const Driver = require('../models/Driver');

/**
 * Notification Service — FCM push notifications + SMS
 * 
 * In production, use Firebase Admin SDK for FCM and Twilio for SMS.
 * For development, we log notifications to console.
 */

/**
 * Send FCM push notification to a device
 * @param {string} fcmToken - device token
 * @param {Object} payload - { title, body, data }
 */
const sendPushNotification = async (fcmToken, payload) => {
  if (!fcmToken) {
    logger.warn('No FCM token provided, skipping push notification');
    return { success: false, reason: 'no_token' };
  }

  try {
    // In production, use firebase-admin messaging
    // const message = {
    //   token: fcmToken,
    //   notification: { title: payload.title, body: payload.body },
    //   data: payload.data || {},
    // };
    // await admin.messaging().send(message);

    // For development, log the notification
    logger.info(`[FCM] Sending push to ${fcmToken.slice(0, 10)}...: ${payload.title} - ${payload.body}`);

    return { success: true };
  } catch (err) {
    logger.error(`FCM push failed: ${err.message}`);
    return { success: false, error: err.message };
  }
};

/**
 * Send SMS via Twilio (or log in dev)
 * @param {string} mobile - recipient mobile number
 * @param {string} message - SMS content
 */
const sendSMS = async (mobile, message) => {
  try {
    // In production, use Twilio
    // const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({
    //   body: message,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: `+91${mobile}`,
    // });

    // For development, log the SMS
    logger.info(`[SMS] To ${mobile}: ${message}`);

    return { success: true };
  } catch (err) {
    logger.error(`SMS send failed: ${err.message}`);
    return { success: false, error: err.message };
  }
};

/**
 * Send ride status notification to customer
 */
const notifyCustomerRideStatus = async (customerId, ride, status) => {
  const user = await User.findById(customerId);
  if (!user || !user.fcmToken) return;

  const messages = {
    accepted: {
      title: 'Driver on the way! 🚗',
      body: `Your ${ride.vehicleType} driver is heading to pickup.`,
    },
    arrived: {
      title: 'Driver has arrived!',
      body: 'Your driver is waiting at the pickup location.',
    },
    started: {
      title: 'Trip started!',
      body: 'Enjoy your ride. Stay safe!',
    },
    completed: {
      title: 'Trip completed!',
      body: `Your trip is complete. Final fare: ₹${ride.finalFare || ride.fareEstimate?.estimatedFare}`,
    },
    cancelled: {
      title: 'Ride cancelled',
      body: 'Your ride has been cancelled.',
    },
    no_driver_found: {
      title: 'No drivers available',
      body: 'Sorry, no drivers found nearby. Please try again.',
    },
  };

  const msg = messages[status];
  if (msg) {
    await sendPushNotification(user.fcmToken, {
      title: msg.title,
      body: msg.body,
      data: { rideId: ride._id.toString(), status },
    });
  }
};

/**
 * Send ride request notification to driver
 */
const notifyDriverRideRequest = async (driverId, ride) => {
  const driver = await Driver.findById(driverId);
  if (!driver || !driver.fcmToken) return;

  await sendPushNotification(driver.fcmToken, {
    title: 'New ride request! 🚕',
    body: `Pickup: ${ride.pickupLocation.address}`,
    data: {
      rideId: ride._id.toString(),
      type: 'ride_request',
    },
  });
};

/**
 * Send OTP SMS
 */
const sendOTP = async (mobile, otp) => {
  const message = `Your RIDEAPP verification code is ${otp}. Valid for 5 minutes. Do not share this code with anyone.`;
  return await sendSMS(mobile, message);
};

/**
 * Send SOS alert to emergency contacts
 */
const sendSOSAlert = async (mobile, location, rideNumber) => {
  const message = `🚨 SOS ALERT from RIDEAPP! Ride ${rideNumber} has triggered an emergency. Location: https://maps.google.com/?q=${location.lat},${location.lng}. Please contact immediately.`;
  return await sendSMS(mobile, message);
};

/**
 * Broadcast notification to all users or drivers
 * @param {string} audience - 'users' | 'drivers' | 'all'
 * @param {Object} payload - { title, body, data }
 */
const broadcastNotification = async (audience, payload) => {
  try {
    let tokens = [];

    if (audience === 'users' || audience === 'all') {
      const users = await User.find({ fcmToken: { $ne: null } }).select('fcmToken');
      tokens = tokens.concat(users.map((u) => u.fcmToken));
    }

    if (audience === 'drivers' || audience === 'all') {
      const drivers = await Driver.find({ fcmToken: { $ne: null } }).select('fcmToken');
      tokens = tokens.concat(drivers.map((d) => d.fcmToken));
    }

    logger.info(`Broadcasting to ${tokens.length} devices`);

    // In production, send in batches via FCM
    for (const token of tokens) {
      await sendPushNotification(token, payload);
    }

    return { success: true, count: tokens.length };
  } catch (err) {
    logger.error(`Broadcast failed: ${err.message}`);
    return { success: false, error: err.message };
  }
};

module.exports = {
  sendPushNotification,
  sendSMS,
  sendOTP,
  sendSOSAlert,
  notifyCustomerRideStatus,
  notifyDriverRideRequest,
  broadcastNotification,
};