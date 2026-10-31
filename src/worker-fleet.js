require('dotenv').config();
const { Worker } = require('bullmq');
const { connection } = require('./config/redis');
const { processHeavyTask } = require('./workers/processors');
const logger = require('./utils/logger');

logger.info('Starting Worker Fleet...');

const workerOptions = {
  connection,
  removeOnComplete: { count: 100 }, // Keep last 100 for debugging
  removeOnFail: { count: 100 }
};

// Dedicated Premium Workers (High Concurrency)
const premiumWorker = new Worker('premium', processHeavyTask, {
  ...workerOptions,
  concurrency: 10
});

// Standard Workers (Medium Concurrency)
const standardWorker = new Worker('standard', processHeavyTask, {
  ...workerOptions,
  concurrency: 5
});

// Free Workers (Low Concurrency)
const freeWorker = new Worker('free', processHeavyTask, {
  ...workerOptions,
  concurrency: 2
});

// Worker Event Listeners for structured logging
const setupListeners = (worker, tier) => {
  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, tier }, 'Worker successfully completed job');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, tier, err }, 'Worker failed to process job');
  });
};

setupListeners(premiumWorker, 'premium');
setupListeners(standardWorker, 'standard');
setupListeners(freeWorker, 'free');

// Handle graceful shutdown for cluster environments
process.on('SIGINT', async () => {
  logger.info('Shutting down workers gracefully...');
  await premiumWorker.close();
  await standardWorker.close();
  await freeWorker.close();
  process.exit(0);
});