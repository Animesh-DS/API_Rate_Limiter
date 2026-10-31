const { connection } = require('../config/redis');
const logger = require('../utils/logger');
const { slidingWindowScript } = require('../utils/scripts');

const rateLimiter = async (req, res, next) => {
  const { userTier, userIdentifier } = req;
  const correlationId = req.id;

  // 1. Resolve dynamic limits set by the Load Shedder, fallback to defaults
  let limit = 10; // default free
  if (userTier === 'premium') limit = 1000;
  else if (userTier === 'standard') {
    const dynamicLimit = await connection.get('dynamic_limit:standard');
    limit = dynamicLimit ? parseInt(dynamicLimit, 10) : 100;
  } else {
    const dynamicLimit = await connection.get('dynamic_limit:free');
    limit = dynamicLimit ? parseInt(dynamicLimit, 10) : 10;
  }

  const windowSize = 60000; // 1 minute window
  const key = `ratelimit:${userTier}:${userIdentifier}`;

  try {
    // 2. Execute Lua Script
    const currentRequests = await connection.eval(
      slidingWindowScript,
      1,
      key,
      limit,
      windowSize
    );

    const remaining = Math.max(0, limit - currentRequests);
    
    // Set informative standard headers
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (currentRequests > limit) {
      // 3. Calculate Retry-After dynamically based on key TTL
      const ttl = await connection.pttl(key);
      const retryAfterSeconds = Math.max(1, Math.ceil(ttl / 1000));
      
      res.setHeader('Retry-After', retryAfterSeconds);
      
      logger.warn({ tier: userTier, correlationId, retryAfter: retryAfterSeconds }, 'Rate limit exceeded');
      
      return res.status(429).json({ 
        error: 'Too Many Requests', 
        message: 'Rate limit sliding window exhausted.',
        retryAfter: retryAfterSeconds
      });
    }

    next();
  } catch (error) {
    logger.error({ err: error, correlationId }, 'Rate limiter failed, failing open');
    next(); // Fail open so a Redis crash doesn't take down the API
  }
};

module.exports = rateLimiter;