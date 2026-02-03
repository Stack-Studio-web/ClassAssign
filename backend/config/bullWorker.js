const bull = require('./bullInit');
const axios = require('axios');
const config = require('./config');
const http = require('http');
const https = require('https');

const httpAgent = new http.Agent({ 
  keepAlive: true, 
  maxSockets: 50,
  keepAliveMsecs: 30000,
  timeout: 60000
});

const httpsAgent = new https.Agent({ 
  keepAlive: true, 
  maxSockets: 50,
  keepAliveMsecs: 30000,
  timeout: 60000
});

let metrics = {
  totalProcessed: 0,
  totalSuccess: 0,
  totalFailed: 0,
  startTime: Date.now(),
  lastReport: Date.now(),
  apiErrors: {
    timeout: 0,
    connectionReset: 0,
    serverError: 0,
    other: 0
  }
};

/* ================================
   SIMPLE RATE LIMITER (1 req/s = 10 per 10s)
================================ */
class RateLimiter {
  constructor(maxPerSecond) {
    this.maxPerSecond = maxPerSecond;
    this.tokens = maxPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    
    if (timePassed > 0) {
      const tokensToAdd = (timePassed / 1000) * this.maxPerSecond;
      this.tokens = Math.min(this.maxPerSecond, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }

    if (this.tokens < 1) {
      const waitTime = (1 - this.tokens) * (1000 / this.maxPerSecond);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.acquire();
    }

    this.tokens -= 1;
  }
}

const rateLimiter = new RateLimiter(
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1
);

async function retryWithBackoff(fn, maxRetries = 10, baseDelay = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 30000);
      console.log(`  ⏳ Retry ${attempt}/${maxRetries} in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function sendTeamsMessage(toEmail, message) {
  const MOCK_MODE = process.env.MOCK_TEAMS_API === 'true';
  
  if (MOCK_MODE) {
    await new Promise(resolve => setTimeout(resolve, 50));
    return { success: true, data: { mock: true } };
  }

  await rateLimiter.acquire();

  return await retryWithBackoff(async () => {
    try {
      const response = await axios.post(
        config.KCT_TEAMS_API_URL,
        {
          from_email: config.KCT_TEAMS_FROM_EMAIL,
          email: toEmail,
          message: message,
          content_type: "html",
          mention: "true"
        },
        {
          auth: {
            username: config.KCT_TEAMS_API_USER,
            password: config.KCT_TEAMS_API_PASSWORD
          },
          headers: { 
            "Content-Type": "application/json",
            "Connection": "keep-alive"
          },
          timeout: 60000,
          httpAgent,
          httpsAgent
        }
      );

      return { success: true, data: response.data };

    } catch (err) {
      if (err.code === 'ETIMEDOUT') metrics.apiErrors.timeout++;
      else if (err.code === 'ECONNRESET') metrics.apiErrors.connectionReset++;
      else if (err.response && err.response.status >= 500) metrics.apiErrors.serverError++;
      else metrics.apiErrors.other++;

      const isRetryable = 
        err.code === 'ECONNABORTED' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ENOTFOUND' ||
        (err.response && err.response.status >= 500);

      if (!isRetryable) {
        return { success: false, error: err.message, retryable: false };
      }

      throw err;
    }
  }, parseInt(process.env.BULL_MAX_RETRIES) || 10, 3000);
}

const CONCURRENCY = parseInt(process.env.BULL_CONCURRENCY) || 2;

console.log('🚀 ULTRA-RELIABLE WORKER (10 per 10 seconds)');
console.log(`⚙️  Concurrency: ${CONCURRENCY} parallel jobs`);
console.log(`⚙️  Rate Limit: ${process.env.RATE_LIMIT_MAX_REQUESTS || 1} req/s (10 per 10s)`);
console.log(`⚙️  Max Retries: ${process.env.BULL_MAX_RETRIES || 10} attempts`);
console.log(`⚙️  Mock Mode: ${process.env.MOCK_TEAMS_API === 'true' ? 'ON' : 'OFF'}`);

bull.process(CONCURRENCY, async (job) => {
  const startTime = Date.now();
  const jobType = job.data.type || 'seating';

  let message = '';

  if (jobType === 'exam-announcement') {
    const { studentName, examType, courseList } = job.data;
    message = `
      <b>📢 EXAM ANNOUNCEMENT</b><br><br>
      Hello <b>${studentName}</b>,<br><br>
      <b>${examType}</b> exams are scheduled for the following courses:<br><br>
      ${courseList.split('\n').join('<br>')}<br><br>
      Please prepare accordingly.<br><br>
      <i>— KSI</i>
    `.trim();
  } else {
    const { studentName, examDate, examTime, venue, courseName, courseCodes } = job.data;
    const courseDisplay = 
      courseName && courseName !== "N/A" 
        ? courseName 
        : (courseCodes && courseCodes.length > 0 ? courseCodes.join(", ") : "N/A");

    message = `
      <b>📢 EXAM ANNOUNCEMENT</b><br><br>
      Hello <b>${studentName}</b>,<br><br>
      <b>Venue:</b> <b>${venue}</b><br>
      <b>Course(s):</b> <b>${courseDisplay}</b><br>
      <b>Date:</b> ${new Date(examDate).toDateString()}<br>
      <b>Time:</b> ${examTime}<br><br>
      Please be present at least 10 minutes early.<br><br>
      <i>— KSI</i>
    `.trim();
  }

  try {
    const result = await sendTeamsMessage(job.data.email, message);

    if (result.success) {
      await job.progress(100);
      return result;
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    throw err;
  }
});

bull.on('completed', () => {
  metrics.totalProcessed++;
  metrics.totalSuccess++;

  if (metrics.totalProcessed % 50 === 0) {
    const elapsed = (Date.now() - metrics.startTime) / 1000;
    const rate = (metrics.totalProcessed / elapsed).toFixed(1);
    const successRate = ((metrics.totalSuccess / metrics.totalProcessed) * 100).toFixed(1);

    console.log(`📊 ${metrics.totalSuccess} ✅ | ${metrics.totalFailed} ❌ | ${successRate}% | ${rate}/s`);
  }
});

bull.on('failed', () => {
  metrics.totalProcessed++;
  metrics.totalFailed++;
});

bull.on('drained', () => {
  const totalTime = ((Date.now() - metrics.startTime) / 1000).toFixed(1);
  const avgRate = (metrics.totalProcessed / totalTime).toFixed(1);
  const successRate = metrics.totalProcessed > 0 
    ? ((metrics.totalSuccess / metrics.totalProcessed) * 100).toFixed(2)
    : 0;

  console.log('\n🎉 ============ QUEUE COMPLETED ============ 🎉');
  console.log(`📊 Total: ${metrics.totalProcessed} jobs`);
  console.log(`✅ Success: ${metrics.totalSuccess} (${successRate}%)`);
  console.log(`❌ Failed: ${metrics.totalFailed}`);
  console.log(`⏱️  Time: ${totalTime}s`);
  console.log(`⚡ Speed: ${avgRate} jobs/s`);
  
  if (metrics.totalFailed > 0) {
    console.log(`\n🔍 Error Breakdown:`);
    console.log(`  Timeout: ${metrics.apiErrors.timeout}`);
    console.log(`  Connection Reset: ${metrics.apiErrors.connectionReset}`);
    console.log(`  Server Error: ${metrics.apiErrors.serverError}`);
    console.log(`  Other: ${metrics.apiErrors.other}`);
  }
  console.log('==========================================\n');

  metrics = {
    totalProcessed: 0,
    totalSuccess: 0,
    totalFailed: 0,
    startTime: Date.now(),
    lastReport: Date.now(),
    apiErrors: { timeout: 0, connectionReset: 0, serverError: 0, other: 0 }
  };
});

process.on('SIGTERM', async () => {
  console.log('\n📴 Shutting down...');
  await bull.close();
  httpAgent.destroy();
  httpsAgent.destroy();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n📴 Shutting down...');
  await bull.close();
  httpAgent.destroy();
  httpsAgent.destroy();
  process.exit(0);
});

console.log('✅ Worker ready - ULTRA-RELIABLE MODE\n');

module.exports = bull;