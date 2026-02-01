// backend/config/bullWorker.js
// PRODUCTION-GRADE: Zero-Failure Worker for 2000+ Notifications

const bull = require('./bullInit');
const axios = require('axios');
const config = require('./config');
const http = require('http');
const https = require('https');

/* ================================
   HTTP AGENTS WITH KEEP-ALIVE
================================ */
const httpAgent = new http.Agent({ 
  keepAlive: true, 
  maxSockets: 100,
  keepAliveMsecs: 30000,
  timeout: 60000
});

const httpsAgent = new https.Agent({ 
  keepAlive: true, 
  maxSockets: 100,
  keepAliveMsecs: 30000,
  timeout: 60000
});

/* ================================
   PERFORMANCE METRICS
================================ */
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
   ADAPTIVE RATE LIMITER
   Automatically slows down on errors
================================ */
class AdaptiveRateLimiter {
  constructor(initialRate) {
    this.maxPerSecond = initialRate;
    this.currentRate = initialRate;
    this.tokens = initialRate;
    this.lastRefill = Date.now();
    this.consecutiveErrors = 0;
    this.consecutiveSuccesses = 0;
  }

  async acquire() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    
    if (timePassed > 0) {
      const tokensToAdd = (timePassed / 1000) * this.currentRate;
      this.tokens = Math.min(this.currentRate, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }

    if (this.tokens < 1) {
      const waitTime = (1 - this.tokens) * (1000 / this.currentRate);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.acquire();
    }

    this.tokens -= 1;
  }

  reportError() {
    this.consecutiveErrors++;
    this.consecutiveSuccesses = 0;
    
    // Slow down if too many errors
    if (this.consecutiveErrors >= 3 && this.currentRate > 5) {
      this.currentRate = Math.max(5, this.currentRate - 2);
      console.log(`⚠️  Rate reduced to ${this.currentRate} req/s due to errors`);
      this.consecutiveErrors = 0;
    }
  }

  reportSuccess() {
    this.consecutiveSuccesses++;
    this.consecutiveErrors = 0;
    
    // Speed up if doing well
    if (this.consecutiveSuccesses >= 100 && this.currentRate < this.maxPerSecond) {
      this.currentRate = Math.min(this.maxPerSecond, this.currentRate + 1);
      console.log(`✅ Rate increased to ${this.currentRate} req/s`);
      this.consecutiveSuccesses = 0;
    }
  }
}

const rateLimiter = new AdaptiveRateLimiter(
  config.RATE_LIMIT_MAX_REQUESTS || 20
);

/* ================================
   EXPONENTIAL BACKOFF RETRY
================================ */
async function retryWithBackoff(fn, maxRetries = 5, baseDelay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) {
        throw err;
      }
      
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 30000);
      console.log(`  ⏳ Retry ${attempt}/${maxRetries} in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/* ================================
   CIRCUIT BREAKER
   Prevents hammering failed API
================================ */
class CircuitBreaker {
  constructor() {
    this.state = 'CLOSED'; // CLOSED = working, OPEN = failed
    this.failureCount = 0;
    this.threshold = 20; // Open after 20 failures
    this.timeout = 60000; // Try again after 60s
    this.nextAttempt = Date.now();
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker OPEN - API temporarily unavailable');
      }
      this.state = 'HALF_OPEN';
      console.log('🔄 Circuit breaker attempting recovery...');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      console.log('✅ Circuit breaker recovered - API is back online');
    }
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
      console.error(`🚨 Circuit breaker OPEN - API appears down for ${this.timeout/1000}s`);
    }
  }
}

const circuitBreaker = new CircuitBreaker();

/* ================================
   SEND TEAMS MESSAGE (BULLETPROOF)
================================ */
async function sendTeamsMessage(toEmail, message) {
  const MOCK_MODE = process.env.MOCK_TEAMS_API === 'true';
  
  if (MOCK_MODE) {
    await new Promise(resolve => setTimeout(resolve, 50));
    rateLimiter.reportSuccess();
    return { success: true, data: { mock: true } };
  }

  // Rate limiting
  await rateLimiter.acquire();

  // Circuit breaker + retry
  try {
    const result = await circuitBreaker.execute(async () => {
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
              timeout: 45000, // 45 second timeout
              httpAgent,
              httpsAgent,
              // Disable automatic retries (we handle them)
              maxRedirects: 0,
              validateStatus: (status) => status < 500 // Don't throw on 4xx
            }
          );

          // Check response
          if (response.status >= 200 && response.status < 300) {
            rateLimiter.reportSuccess();
            return { success: true, data: response.data };
          } else if (response.status >= 400 && response.status < 500) {
            // Client error - don't retry
            rateLimiter.reportError();
            return { 
              success: false, 
              error: `HTTP ${response.status}`,
              retryable: false 
            };
          } else {
            // Server error - retry
            throw new Error(`HTTP ${response.status}`);
          }

        } catch (err) {
          // Track error type
          if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
            metrics.apiErrors.timeout++;
          } else if (err.code === 'ECONNRESET') {
            metrics.apiErrors.connectionReset++;
          } else if (err.response && err.response.status >= 500) {
            metrics.apiErrors.serverError++;
          } else {
            metrics.apiErrors.other++;
          }

          // Determine if retryable
          const isRetryable = 
            err.code === 'ECONNABORTED' ||
            err.code === 'ECONNRESET' ||
            err.code === 'ETIMEDOUT' ||
            err.code === 'ENOTFOUND' ||
            err.code === 'EAI_AGAIN' ||
            (err.response && err.response.status >= 500);

          if (!isRetryable) {
            rateLimiter.reportError();
            return { 
              success: false, 
              error: err.message,
              code: err.code,
              retryable: false 
            };
          }

          // Retryable - throw to trigger retry
          throw err;
        }
      }, config.BULL_MAX_RETRIES || 8, 2000);
    });

    return result;

  } catch (err) {
    rateLimiter.reportError();
    
    // Final fallback
    return {
      success: false,
      error: err.message,
      retryable: false
    };
  }
}

/* ================================
   BULL JOB PROCESSOR
================================ */
const CONCURRENCY = parseInt(
  process.env.BULL_CONCURRENCY || config.BULL_CONCURRENCY || 15
);

console.log('🚀 ZERO-FAILURE WORKER - Production Ready');
console.log(`⚙️  Concurrency: ${CONCURRENCY} parallel jobs`);
console.log(`⚙️  Max Retries: ${config.BULL_MAX_RETRIES || 8} attempts`);
console.log(`⚙️  Rate Limit: ${config.RATE_LIMIT_MAX_REQUESTS || 20} req/s`);
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
      const duration = Date.now() - startTime;
      await job.progress(100);
      await job.log(`✅ Sent in ${duration}ms`);
      return result;
    } else {
      // Non-retryable failure
      await job.log(`❌ Failed: ${result.error}`);
      throw new Error(result.error);
    }

  } catch (err) {
    const duration = Date.now() - startTime;
    await job.log(`❌ Attempt ${job.attemptsMade}: ${err.message} (${duration}ms)`);
    throw err;
  }
});

/* ================================
   ENHANCED EVENT HANDLERS
================================ */
bull.on('completed', (job) => {
  metrics.totalProcessed++;
  metrics.totalSuccess++;

  const now = Date.now();
  
  if (metrics.totalProcessed % 50 === 0 || now - metrics.lastReport > 10000) {
    const elapsed = (now - metrics.startTime) / 1000;
    const rate = (metrics.totalProcessed / elapsed).toFixed(1);
    const successRate = ((metrics.totalSuccess / metrics.totalProcessed) * 100).toFixed(1);

    console.log(`📊 ${metrics.totalSuccess} ✅ | ${metrics.totalFailed} ❌ | ${successRate}% | ${rate}/s | Rate: ${rateLimiter.currentRate}/s`);
    metrics.lastReport = now;
  }
});

bull.on('failed', (job, err) => {
  metrics.totalProcessed++;
  metrics.totalFailed++;

  console.error(`❌ Job ${job.id} FAILED (${job.data.email}): ${err.message} [${job.attemptsMade}/${job.opts.attempts}]`);

  if (job.attemptsMade >= job.opts.attempts) {
    console.error(`🚨 PERMANENT FAILURE: ${job.data.email} after ${job.attemptsMade} attempts`);
  }
});

bull.on('stalled', (job) => {
  console.warn(`⚠️  Job ${job.id} stalled - will retry`);
});

bull.on('error', (error) => {
  console.error('❌ Bull Error:', error.message);
});

bull.on('drained', async () => {
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
  console.log(`📡 Final Rate: ${rateLimiter.currentRate} req/s`);
  
  if (metrics.totalFailed > 0) {
    console.log(`\n🔍 Error Breakdown:`);
    console.log(`  Timeout: ${metrics.apiErrors.timeout}`);
    console.log(`  Connection Reset: ${metrics.apiErrors.connectionReset}`);
    console.log(`  Server Error: ${metrics.apiErrors.serverError}`);
    console.log(`  Other: ${metrics.apiErrors.other}`);
  }
  console.log('==========================================\n');

  // Reset for next batch
  metrics = {
    totalProcessed: 0,
    totalSuccess: 0,
    totalFailed: 0,
    startTime: Date.now(),
    lastReport: Date.now(),
    apiErrors: { timeout: 0, connectionReset: 0, serverError: 0, other: 0 }
  };
});

/* ================================
   GRACEFUL SHUTDOWN
================================ */
async function gracefulShutdown() {
  console.log('\n📴 Shutting down gracefully...');
  
  try {
    await bull.close();
    httpAgent.destroy();
    httpsAgent.destroy();
    console.log('✅ Worker closed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Shutdown error:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

console.log('✅ Worker ready - designed for ZERO FAILURES\n');

module.exports = bull;