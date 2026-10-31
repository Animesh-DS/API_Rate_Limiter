require('dotenv').config();
const Redis = require('ioredis');
const logger = require('../utils/logger');

const redisConfig = {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
};

const connection = new Redis(process.env.REDIS_URL, redisConfig);
const subscriber = new Redis(process.env.REDIS_URL, redisConfig);

connection.on('error', (err) => logger.error({ err }, 'Redis Connection Error'));
connection.on('ready', () => logger.info('Redis connected successfully'));

module.exports = {
  connection,
  subscriber
};