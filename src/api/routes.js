const express = require('express');
const tierResolver = require('../middleware/tier-resolver');
const rateLimiter = require('../middleware/rate-limiter');
const { processTask } = require('./controller');

const router = express.Router();

// Apply the tier resolution and rate limiting strictly to this endpoint
router.post('/process', tierResolver, rateLimiter, processTask);

// A simple health check route for load balancers
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

module.exports = router;