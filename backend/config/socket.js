const { Server } = require('socket.io');
const { initRideSocket } = require('../sockets/rideSocket');
const logger = require('../utils/logger');

/**
 * Initialize Socket.IO server
 * @param {Object} httpServer - HTTP server instance
 */
const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // For multi-instance scaling, use Redis adapter
  if (process.env.USE_REDIS_ADAPTER === 'true' && process.env.REDIS_URL) {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const { createClient } = require('redis');
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();
    Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.IO Redis adapter connected');
    });
  }

  // Initialize ride socket handlers
  initRideSocket(io);

  logger.info('Socket.IO initialized');

  return io;
};

module.exports = { initSocket };