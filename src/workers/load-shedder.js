const os = require('os');
const { freeQueue, standardQueue } = require('../config/queues');
const { connection } = require('../config/redis');
const logger = require('../utils/logger');

let isFreePaused = false;
let isStandardPaused = false;
let isThrottled = false; // Tracks the state of adaptive rate limiting

// Helper to calculate CPU utilization percentage
const getCpuUsage = () => {
  const cpus = os.cpus();
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  
  for (let cpu in cpus) {
    user += cpus[cpu].times.user;
    nice += cpus[cpu].times.nice;
    sys += cpus[cpu].times.sys;
    idle += cpus[cpu].times.idle;
    irq += cpus[cpu].times.irq;
  }
  
  const total = user + nice + sys + idle + irq;
  return { idle, total };
};

let startMeasure = getCpuUsage();

const initLoadShedder = () => {
  logger.info('Dynamic Load Shedder & Adaptive Limiter initialized');

  setInterval(async () => {
    const endMeasure = getCpuUsage();
    const idleDifference = endMeasure.idle - startMeasure.idle;
    const totalDifference = endMeasure.total - startMeasure.total;
    startMeasure = endMeasure;

    const cpuPercentage = 100 - Math.floor((100 * idleDifference) / totalDifference);

    // 1. Level 1 Backpressure (CPU > 85%): Adaptive Limits + Drop Free Tier
    if (cpuPercentage > 85 && !isThrottled) {
      logger.warn('CPU > 85% - Applying backpressure (Dynamic Limits) & Pausing FREE queue');
      
      // Implement Adaptive Rate Limiting via Redis
      await connection.set('dynamic_limit:standard', 50, 'EX', 60); // Drop to 50 req/min
      await connection.set('dynamic_limit:free', 2, 'EX', 60);      // Drop to 2 req/min
      isThrottled = true;

      // Shed Background Load
      if (!isFreePaused) {
        await freeQueue.pause();
        await connection.set('circuit_breaker:free', 'paused', 'EX', 60); // Auto-expires as a failsafe
        isFreePaused = true;
      }
    }

    // 2. Level 2 Critical Load (CPU > 95%): Drop Standard Tier
    if (cpuPercentage > 95 && !isStandardPaused) {
      logger.warn('CPU > 95% - Critical Load! Pausing STANDARD queue');
      await standardQueue.pause();
      await connection.set('circuit_breaker:standard', 'paused', 'EX', 60);
      isStandardPaused = true;
    }

    // 3. System Recovery (CPU < 70%): Restore limits and resume queues
    if (cpuPercentage < 70 && (isFreePaused || isStandardPaused || isThrottled)) {
      logger.info('CPU < 70% - System stabilized. Resuming normal operations.');
      
      if (isThrottled) {
        await connection.del('dynamic_limit:standard');
        await connection.del('dynamic_limit:free');
        isThrottled = false;
      }
      
      if (isFreePaused) {
        await freeQueue.resume();
        await connection.del('circuit_breaker:free');
        isFreePaused = false;
      }
      
      if (isStandardPaused) {
        await standardQueue.resume();
        await connection.del('circuit_breaker:standard');
        isStandardPaused = false;
      }
    }
  }, 5000); // Sample CPU every 5 seconds
};

module.exports = { initLoadShedder };