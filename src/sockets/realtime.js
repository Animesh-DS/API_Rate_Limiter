const { Server } = require('socket.io');
const { subscriber } = require('../config/redis');
const logger = require('../utils/logger');

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: '*', // Open for development testing
      methods: ['GET', 'POST']
    }
  });

  // 1. Subscribe to the Redis channel where Workers will broadcast results
  subscriber.subscribe('task-events', (err, count) => {
    if (err) {
      logger.error({ err }, 'Failed to subscribe to Redis task-events channel');
    } else {
      logger.info(`Socket.io subscribed to ${count} Redis channel(s)`);
    }
  });

  // 2. Listen for messages from the Workers and push to the specific client
  subscriber.on('message', (channel, message) => {
    if (channel === 'task-events') {
      try {
        const event = JSON.parse(message);
        
        // Emit the event strictly to the room matching the correlationId
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

    // When the frontend receives the 202 Accepted, it sends the jobId here to listen for updates
    socket.on('subscribe-to-job', (correlationId) => {
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