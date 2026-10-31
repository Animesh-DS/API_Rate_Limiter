const os = require('os');
const { freeQueue, standardQueue } = require('../config/queues');
const { connection } = require('../config/redis');
const logger = require('../utils/logger');

let isFreePaused = false;
let isStandardPaused = false;

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
  logger.info('Dynamic Load Shedder initialized');

  setInterval(async () => {
    const endMeasure = getCpuUsage();
    const idleDifference = endMeasure.idle - startMeasure.idle;
    const totalDifference = endMeasure.total - startMeasure.total;
    startMeasure = endMeasure;

    const cpuPercentage = 100 - Math.floor((100 * idleDifference) / totalDifference);
    
    // Uncomment for debugging, but keep hidden in production to avoid log spam
    // logger.debug({ cpu: `${cpuPercentage}%` }, 'System Metrics');

    // 1. Level 1 Load Shedding: Drop Free Tier
    if (cpuPercentage > 85 && !isFreePaused) {
      logger.warn('CPU > 85% - Pausing FREE queue (Shedding Load)');
      await freeQueue.pause();
      await connection.set('circuit_breaker:free', 'paused', 'EX', 60); // Auto-expires as a failsafe
      isFreePaused = true;
    }

    // 2. Level 2 Load Shedding: Drop Standard Tier
    if (cpuPercentage > 95 && !isStandardPaused) {
      logger.warn('CPU > 95% - Pausing STANDARD queue (Critical Load)');
      await standardQueue.pause();
      await connection.set('circuit_breaker:standard', 'paused', 'EX', 60);
      isStandardPaused = true;
    }

    // 3. System Recovery: Resume Queues
    if (cpuPercentage < 70 && (isFreePaused || isStandardPaused)) {
      logger.info('CPU < 70% - System stabilized. Resuming queues.');
      
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