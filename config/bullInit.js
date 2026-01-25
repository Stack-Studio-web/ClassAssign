// backend/config/bullInit.js
// Exact Node.js equivalent of Python's celery_init.py
// Uses Bull as the Celery equivalent for Node.js

const Queue = require('bull');
const config = require('./config'); // Import your Config object

// Create the Bull queue instance and immediately configure it with the correct
// broker and backend URLs from your config file. This is the most reliable
// way to ensure the correct settings are used.

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

console.log('🔧 Initializing Bull Queue (Celery equivalent) with Redis:', {
  host: redisConfig.host,
  port: redisConfig.port,
  db: redisConfig.db
});

// Create the Bull queue instance (equivalent to: celery = Celery(__name__, broker=..., backend=...))
const bull = new Queue('exam-notifications', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 200
  }
});

// Log queue events
bull.on('error', (error) => {
  console.error('❌ Bull Queue Error:', error.message);
});

bull.on('waiting', (jobId) => {
  console.log(`⏳ Job ${jobId} waiting`);
});

bull.on('active', (job) => {
  console.log(`🔄 Job ${job.id} active`);
});

bull.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed`);
});

bull.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

bull.on('stalled', (job) => {
  console.warn(`⚠️  Job ${job.id} stalled`);
});

module.exports = bull;