// backend/config/bullWorker.js
// OPTIMIZED for High-Volume Notifications (1000+ recipients)

const bull = require('./bullInit');
const axios = require('axios');
const config = require('./config');
const http = require('http');
const https = require('https');

/* ================================
   SHARED HTTP AGENTS
================================ */
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

/* ================================
   SPEED METRICS
================================ */
let totalProcessed = 0;
let totalSuccess = 0;
let totalFailed = 0;
const workerStartTime = Date.now();
let lastReport = Date.now();

/* ================================
   FAST RATE LIMITER
================================ */
class RateLimiter {
  constructor(maxPerSec) {
    this.interval = 1000 / maxPerSec;
    this.lastTime = 0;
  }

  async wait() {
    const now = Date.now();
    const diff = now - this.lastTime;
    if (diff < this.interval) {
      await new Promise(r => setTimeout(r, this.interval - diff));
    }
    this.lastTime = Date.now();
  }
}

const rateLimiter = new RateLimiter(20);

/* ================================
   RETRY WITH BACKOFF
================================ */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, baseDelay * attempt));
    }
  }
}

/* ================================
   SEND TEAMS MESSAGE
================================ */
async function sendTeamsMessage(toEmail, message) {
  console.time(`API-${toEmail}`);
  console.log(`➡️ API START | ${toEmail}`);

  await rateLimiter.wait();

  try {
    const response = await retryWithBackoff(() =>
      axios.post(
        config.KCT_TEAMS_API_URL,
        {
          from_email: config.KCT_TEAMS_FROM_EMAIL,
          email: toEmail,
          message,
          content_type: "html",
          mention: "true"
        },
        {
          auth: {
            username: config.KCT_TEAMS_API_USER,
            password: config.KCT_TEAMS_API_PASSWORD
          },
          timeout: 30000,
          httpAgent,
          httpsAgent,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    console.timeEnd(`API-${toEmail}`);
    return { success: true, data: response.data };

  } catch (err) {
    console.timeEnd(`API-${toEmail}`);
    console.error(`⚠️ API ERROR | ${toEmail} | ${err.message}`);
    return { success: false, error: err.message };
  }
}

/* ================================
   BULL PROCESSOR
================================ */
const CONCURRENCY = Number(process.env.BULL_CONCURRENCY || 15);
console.log(`🚀 Worker started | concurrency=${CONCURRENCY}`);

bull.process(CONCURRENCY, async (job) => {
  console.time(`JOB-${job.id}`);

  const startTime = Date.now();
  const jobType = job.data.type || 'seating';
  const shouldLog = job.id % 10 === 0;

  let message = '';

  if (jobType === 'exam-announcement') {
    const { studentName, examType, courseList } = job.data;

    message = `
      <b>📢 EXAM ANNOUNCEMENT</b><br><br>
      Hello <b>${studentName}</b>,<br><br>
      <b>${examType}</b> exams are scheduled for the following courses:<br><br>
      ${courseList.split('\n').join('<br>')}<br><br>

      
      <i>— KSI</i>
    `.trim();

  } else {
    const { studentName, examDate, examTime, venue, courseName, courseCodes } = job.data;

    const courseDisplay =
      courseName && courseName !== "N/A"
        ? courseName
        : (courseCodes?.length ? courseCodes.join(", ") : "N/A");

    message = `
      <b>📢 EXAM ANNOUNCEMENT</b><br><br>
      Hello <b>${studentName}</b>,<br><br>
      <b>Venue:</b> <b>${venue}</b><br>
      <b>Course(s):</b> <b>${courseDisplay}</b><br>
      <b>Date:</b> ${new Date(examDate).toDateString()}<br>
      <b>Time:</b> ${examTime}<br><br>
      Please be present at least 10 minutes
      <br>
      <i>— KSI</i>
    `.trim();
  }

  const result = await sendTeamsMessage(job.data.email, message);
  await job.progress(100);

  if (shouldLog) {
    console.log(`✅ Job ${job.id} | ${jobType} | ${Date.now() - startTime}ms`);
  }

  console.timeEnd(`JOB-${job.id}`);
  return result;
});

/* ================================
   EVENTS + THROUGHPUT LOGS
================================ */
bull.on('completed', () => {
  totalProcessed++;
  totalSuccess++;

  const now = Date.now();
  if (now - lastReport >= 5000) {
    const elapsed = (now - workerStartTime) / 1000;
    const speed = (totalProcessed / elapsed).toFixed(2);

    console.log(
      `📊 STATS | Done=${totalProcessed} | Success=${totalSuccess} | Failed=${totalFailed} | Speed=${speed}/sec`
    );

    lastReport = now;
  }
});

bull.on('failed', () => {
  totalProcessed++;
  totalFailed++;
});

bull.on('error', err => {
  console.error('❌ Bull error:', err.message);
});

/* ================================
   QUEUE ETA LOGGER
================================ */
async function logQueueETA() {
  const counts = await bull.getJobCounts();
  const remaining = counts.waiting + counts.active;

  const elapsed = (Date.now() - workerStartTime) / 1000;
  const speed = totalProcessed / elapsed || 1;
  const eta = Math.ceil(remaining / speed);

  console.log(
    `⏳ QUEUE | Waiting=${counts.waiting} | Active=${counts.active} | ETA≈${eta}s`
  );
}

setInterval(logQueueETA, 10000);

/* ================================
   GRACEFUL SHUTDOWN
================================ */
async function shutdown() {
  console.log('📴 Shutting down worker...');
  await bull.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('🚀 Worker ready');
console.log(`⚙️ Concurrency=${CONCURRENCY} | Rate=20 req/sec`);

module.exports = bull;
