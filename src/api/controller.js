const queues = require('../config/queues');
const { connection } = require('../config/redis'); // <-- ADD THIS IMPORT
const logger = require('../utils/logger');

const tierPriorities = { premium: 1, standard: 5, free: 10 }; 

const processTask = async (req, res) => {
  const { userTier, userIdentifier } = req;
  const correlationId = req.id; 
  
  const queue = queues[`${userTier}Queue`];
  
  if (!queue) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }

  try {
    // --- NEW LOAD SHEDDING CHECK ---
    // Premium tier bypasses this check entirely
    if (userTier !== 'premium') {
      const isPaused = await connection.get(`circuit_breaker:${userTier}`);
      if (isPaused === 'paused') {
        logger.warn({ tier: userTier, correlationId }, 'Request dropped via load shedding');
        return res.status(503).json({ 
          error: 'Service Unavailable', 
          message: 'Server is experiencing extreme load. Low-priority tasks are temporarily paused.' 
        });
      }
    }
    // -------------------------------

    const job = await queue.add('heavy-task', {
      payload: req.body,
      userIdentifier,
      userTier,
      correlationId
    }, {
      jobId: correlationId,
      priority: tierPriorities[userTier]
    });

    logger.info({ jobId: job.id, tier: userTier }, 'Job successfully queued');
    
    res.status(202).json({
      message: 'Request accepted. Processing in background.',
      jobId: job.id,
      tier: userTier
    });
  } catch (error) {
    logger.error({ err: error, correlationId }, 'Failed to queue job');
    res.status(503).json({ error: 'Service Unavailable' });
  }
};

module.exports = {
  processTask
};