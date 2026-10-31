const { Queue } = require('bullmq');
const { connection } = require('./redis');

const queueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true, // Keep Redis memory footprint low
    removeOnFail: 100 // Retain last 100 failed jobs for debugging
  }
};

// Queue names changed from 'queue:tier' to 'tier' to comply with BullMQ v5+
const premiumQueue = new Queue('premium', queueOptions);
const standardQueue = new Queue('standard', queueOptions);
const freeQueue = new Queue('free', queueOptions);

module.exports = {
  premiumQueue,
  standardQueue,
  freeQueue
};