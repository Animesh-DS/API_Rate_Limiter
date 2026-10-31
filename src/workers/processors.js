const { connection } = require('../config/redis');
const logger = require('../utils/logger');

const processHeavyTask = async (job) => {
  const { payload, correlationId, userTier } = job.data;
  
  logger.info({ jobId: job.id, tier: userTier }, 'Started processing heavy task');

  // Simulate a heavy computational task (e.g., 5 seconds of processing)
  await new Promise(resolve => setTimeout(resolve, 5000)); 

  const result = {
    correlationId,
    status: 'completed',
    tier: userTier,
    data: {
      message: 'Task processed successfully',
      originalPayload: payload,
      processedAt: new Date().toISOString()
    }
  };

  // Publish the completion event to the Redis Pub/Sub channel
  await connection.publish('task-events', JSON.stringify(result));
  
  logger.info({ jobId: job.id, tier: userTier }, 'Finished task and published event');
  
  return result; // BullMQ stores this return value in the job history
};

module.exports = {
  processHeavyTask
};