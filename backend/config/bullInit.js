// bullInit.js - FIXED: Limiter at correct level
const Queue = require('bull');
const config = require('./config');

function parseRedisUrl(url) {
  try {
    const urlObj = new URL(url);
    return {
      host: urlObj.hostname,
      port: parseInt(urlObj.port) || 6379,
      password: urlObj.password || undefined,
      db: parseInt(urlObj.pathname.slice(1)) || 0
    };
  } catch (err) {
    console.error('Invalid Redis URL:', url);
    return {
      host: 'localhost',
      port: 6379,
      db: 0
    };
  }
}

const redisConfig = parseRedisUrl(config.CELERY_BROKER_URL);

console.log('🔧 Initializing Bull Queue:', {
  host: redisConfig.host,
  port: redisConfig.port,
  db: redisConfig.db
});

const bull = new Queue('exam-notifications', {
  redis: redisConfig,

  defaultJobOptions: {
    attempts: parseInt(process.env.BULL_MAX_RETRIES) || 10,
    backoff: {
      type: 'exponential',
      delay: parseInt(process.env.BULL_RETRY_DELAY) || 3000
    },
    timeout: parseInt(process.env.BULL_JOB_TIMEOUT) || 180000,
    removeOnComplete: 1000,
    removeOnFail: 500
  },

  // ✅ CRITICAL FIX: Limiter MUST be at top level (not inside settings)
  limiter: {
    max: parseInt(process.env.QUEUE_LIMITER_MAX) || 10,
    duration: parseInt(process.env.QUEUE_LIMITER_DURATION) || 10000,
    bounceBack: false
  },

  settings: {
    maxStalledCount: 3,
    stalledInterval: 30000,
    guardInterval: 5000,
    retryProcessDelay: 5000
  }
});

bull.on('error', err => {
  console.error('❌ Bull error:', err.message);
});

bull.on('waiting', id => {
  if (id % 50 === 0) console.log(`⏳ Job ${id} waiting`);
});

bull.on('active', job => {
  if (job.id % 50 === 0) console.log(`🔄 Job ${job.id} active`);
});

bull.on('completed', job => {
  if (job.id % 50 === 0) console.log(`✅ Job ${job.id} completed`);
});

bull.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} FAILED:`, err.message);
});

bull.on('stalled', job => {
  console.warn(`⚠️ Job ${job.id} stalled`);
});

bull.on('drained', () => {
  console.log('🎉 Queue drained - all jobs processed!');
});

setInterval(async () => {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      bull.getWaitingCount(),
      bull.getActiveCount(),
      bull.getCompletedCount(),
      bull.getFailedCount(),
      bull.getDelayedCount()
    ]);

    console.log(
      `📊 Queue: ${waiting} waiting | ${active} active | ${completed} done | ${failed} failed | ${delayed} delayed`
    );
  } catch (err) {
    console.error('❌ Health check error:', err.message);
  }
}, 60000);

console.log('✅ Bull Queue initialized with rate limiter: 10 jobs per 10 seconds');

module.exports = bull;