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

const premiumQueue = new Queue('queue:premium', queueOptions);
const standardQueue = new Queue('queue:standard', queueOptions);
const freeQueue = new Queue('queue:free', queueOptions);

module.exports = {
  premiumQueue,
  standardQueue,
  freeQueue
};