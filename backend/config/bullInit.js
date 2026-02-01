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

/* ===============================
   ✅ SAFE Bull Queue Initialization
   =============================== */
const bull = new Queue('exam-notifications', {
  redis: {
    ...redisConfig
    // ❌ DO NOT add enableReadyCheck
    // ❌ DO NOT add maxRetriesPerRequest
  },

  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 3000
    },
    timeout: 90000,
    removeOnComplete: 1000,
    removeOnFail: 500
  },

  settings: {
    maxStalledCount: 3,
    stalledInterval: 30000,
    guardInterval: 5000,
    retryProcessDelay: 5000
  },

  limiter: {
    max: 50,
    duration: 10000,
    bounceBack: false
  }
});

/* ===============================
   ✅ Event Logging
   =============================== */
bull.on('error', err => {
  console.error('❌ Bull error:', err.message);
});

bull.on('waiting', id => {
  if (id % 10 === 0) console.log(`⏳ Job ${id} waiting`);
});

bull.on('active', job => {
  if (job.id % 10 === 0) console.log(`🔄 Job ${job.id} active`);
});

bull.on('completed', job => {
  if (job.id % 10 === 0) console.log(`✅ Job ${job.id} completed`);
});

bull.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

bull.on('stalled', job => {
  console.warn(`⚠️ Job ${job.id} stalled`);
});

bull.on('drained', () => {
  console.log('🎉 Queue drained');
});

/* ===============================
   ✅ Health Check
   =============================== */
setInterval(async () => {
  try {
    const stats = await Promise.all([
      bull.getWaitingCount(),
      bull.getActiveCount(),
      bull.getCompletedCount(),
      bull.getFailedCount(),
      bull.getDelayedCount()
    ]);

    console.log(
      `📊 Queue: ${stats[0]} waiting | ${stats[1]} active | ${stats[2]} done | ${stats[3]} failed | ${stats[4]} delayed`
    );
  } catch (err) {
    console.error('❌ Health check error:', err.message);
  }
}, 60000);

module.exports = bull;
