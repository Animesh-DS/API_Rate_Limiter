const { Server } = require('socket.io');
const { subscriber } = require('../config/redis');
const logger = require('../utils/logger');

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: '*', 
      methods: ['GET', 'POST']
    }
  });

  // 1. Subscribe to the Redis channel
  subscriber.subscribe('task-events', (err, count) => {
    if (err) {
      logger.error({ err }, 'Failed to subscribe to Redis task-events channel');
    } else {
      logger.info(`Socket.io subscribed to ${count} Redis channel(s)`);
    }
  });

  // 2. Listen for messages from Workers and push to specific room
  subscriber.on('message', (channel, message) => {
    if (channel === 'task-events') {
      try {
        const event = JSON.parse(message);
        io.to(event.correlationId).emit('task-completed', event);
        logger.info({ jobId: event.correlationId }, 'Pushed real-time update to client socket');
      } catch (error) {
        logger.error({ err: error }, 'Failed to parse Redis message');
      }
    }
  });

  // 3. Handle Client Connections
  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'New client socket connected');

    // ALL socket.on events must go inside this block
    socket.on('subscribe-to-job', (correlationId) => {
      // In a production environment with JWTs, you would validate the user here
      // e.g., if (data.userId === decodedJwt.id)
      
      socket.join(correlationId);
      logger.info({ socketId: socket.id, room: correlationId }, 'Client subscribed to job updates');
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Client socket disconnected');
    });
  });
};

module.exports = {
  initSocket
};