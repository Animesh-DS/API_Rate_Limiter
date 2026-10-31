const ms = require('ms');
const { connection } = require('../config/redis');
const { SLIDING_WINDOW_LUA } = require('../utils/scripts');
const logger = require('../utils/logger');

// Register the Lua script in Redis so we can call it efficiently by name
connection.defineCommand('slidingWindowRateLimit', {
  numberOfKeys: 1,
  lua: SLIDING_WINDOW_LUA,
});

const TIER_LIMITS = {
  premium: { limit: 1000, window: ms('1m') },
  standard: { limit: 100, window: ms('1m') },
  free: { limit: 10, window: ms('1m') }
};

const rateLimiter = async (req, res, next) => {
  const { userIdentifier, userTier } = req;
  const config = TIER_LIMITS[userTier] || TIER_LIMITS['free'];
  
  const redisKey = `rate_limit:${userTier}:${userIdentifier}`;
  const now = Date.now();

  try {
    // Execute atomic Lua script
    const allowed = await connection.slidingWindowRateLimit(
      redisKey,
      config.limit,
      config.window,
      now
    );

    if (allowed === 1) {
      next();
    } else {
      logger.warn({ tier: userTier, identifier: userIdentifier }, 'Rate limit exceeded');
      res.status(429).json({ 
        error: 'Too Many Requests', 
        message: `Your ${userTier} tier limit is exhausted. Try again later.`
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Rate limiter failed, failing open');
    // In production, if Redis fails, you usually "fail open" so legitimate users aren't blocked
    next();
  }
};

module.exports = rateLimiter;