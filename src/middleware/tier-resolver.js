const { LRUCache } = require('lru-cache');
const { connection } = require('../config/redis');
const logger = require('../utils/logger');

// Protects Node.js memory from spoofed IP DDoS attacks
const tierCache = new LRUCache({
  max: 10000, // Maximum number of users to keep in memory
  ttl: 1000 * 60, // Cache for 60 seconds
});

// Helper to seed some dummy data for testing
const seedDummyData = async () => {
  await connection.hset('api_keys', {
    'premium-key-123': 'premium',
    'standard-key-456': 'standard'
  });
};
seedDummyData();

const tierResolver = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const identifier = apiKey || req.ip;
  
  // 1. Check ultra-fast local memory
  let tier = tierCache.get(identifier);

  if (!tier) {
    // 2. Fallback to O(1) Redis lookup if not in memory
    if (apiKey) {
      tier = await connection.hget('api_keys', apiKey);
    }
    
    // Default to free if no valid key is provided
    if (!tier) {
      tier = 'free';
    }

    tierCache.set(identifier, tier);
  }

  // Attach to the request object for the rate limiter and router to use
  req.userIdentifier = identifier;
  req.userTier = tier;
  
  next();
};

module.exports = tierResolver;