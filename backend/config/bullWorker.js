// bullWorker.js - GUARANTEED 10 per 10 seconds (1 per second)
const bull = require('./bullInit');
const axios = require('axios');
const config = require('./config');

// ✅ Track global send statistics
let sendStats = {
  total: 0,
  sent: 0,
  failed: 0,
  startTime: null
};

async function sendTeamsMessage(toEmail, message, jobId, attempt) {
  const MOCK_MODE = process.env.MOCK_TEAMS_API === 'true';
  const startTime = Date.now();
  
  console.log(`📤 [Job ${jobId}] Sending to ${toEmail} (Attempt ${attempt}/${config.BULL_MAX_RETRIES || 10})`);
  
  if (MOCK_MODE) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const duration = Date.now() - startTime;
    console.log(`✅ [Job ${jobId}] MOCK sent in ${duration}ms`);
    return { success: true, data: { mock: true }, duration };
  }

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
        timeout: 30000
      }
    );

    const duration = Date.now() - startTime;
    console.log(`✅ [Job ${jobId}] Successfully sent to ${toEmail} in ${duration}ms`);
    return { success: true, data: response.data, duration };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error.code === 'ECONNABORTED') {
      console.error(`⏱️ [Job ${jobId}] TIMEOUT after ${duration}ms`);
    } else if (error.response) {
      console.error(`❌ [Job ${jobId}] API ERROR ${error.response.status}`);
    } else if (error.request) {
      console.error(`🔌 [Job ${jobId}] NO RESPONSE from API`);
    } else {
      console.error(`❌ [Job ${jobId}] ERROR: ${error.message}`);
    }
    
    throw error;
  }
}

// ✅ CRITICAL FIX: Force CONCURRENCY to 1 (don't trust .env)
const CONCURRENCY = 1;

console.log('🚀 ===== BULL WORKER STARTED =====');
console.log(`⚙️  Concurrency: ${CONCURRENCY} (FORCED TO 1 for rate limit)`);
console.log(`⚙️  Max Retries: ${process.env.BULL_MAX_RETRIES || 10}`);
console.log(`⚙️  Queue Limiter: ${process.env.QUEUE_LIMITER_MAX || 10} jobs per ${process.env.QUEUE_LIMITER_DURATION || 10000}ms`);
console.log(`⚙️  Rate Limit: TRUE 10 per 10 seconds (1 per second)`);
console.log(`⚙️  Mock Mode: ${process.env.MOCK_TEAMS_API === 'true' ? '✅ ENABLED' : '❌ DISABLED'}`);
console.log('==================================\n');

bull.process(CONCURRENCY, async (job) => {
  // Initialize stats on first job
  if (!sendStats.startTime) {
    sendStats.startTime = Date.now();
    try {
      const waiting = await bull.getWaitingCount();
      const active = await bull.getActiveCount();
      sendStats.total = waiting + active + 1;
      console.log(`📊 Starting batch: ${sendStats.total} total notifications to send\n`);
    } catch (err) {
      console.error('Error getting initial queue count:', err.message);
    }
  }
  
  // Log job start
  const { email, studentName, type } = job.data;
  console.log(`\n🔄 [Job ${job.id}] Processing: ${email} (${studentName || 'Unknown'})`);
  console.log(`   Type: ${type || 'seating-notification'}`);
  console.log(`   Progress: ${sendStats.sent}/${sendStats.total} sent | ${sendStats.failed} failed`);
  
  let message = '';

  if (job.data.customMessage) {
    message = job.data.customMessage;
  } else {
    const { studentName, examDate, examTime, venue, courseName } = job.data;
    message = `
      <b>📢 EXAM ANNOUNCEMENT</b><br><br>
      Hello <b>${studentName}</b>,<br><br>
      <b>Venue:</b> ${venue}<br>
      <b>Course:</b> ${courseName}<br>
      <b>Date:</b> ${new Date(examDate).toDateString()}<br>
      <b>Time:</b> ${examTime}<br><br>

      <br>
      Please arrive 10 minutes early.
      <br>
      <i>— KSI</i>
    `.trim();
  }

  try {
    const result = await sendTeamsMessage(job.data.email, message, job.id, job.attemptsMade + 1);
    
    if (result.success) {
      await job.progress(100);
      
      sendStats.sent++;
      const elapsed = Math.round((Date.now() - sendStats.startTime) / 1000);
      const rate = sendStats.sent > 0 ? (sendStats.sent / elapsed).toFixed(2) : '0.00';
      const percent = sendStats.total > 0 ? ((sendStats.sent / sendStats.total) * 100).toFixed(1) : '0.0';
      
      console.log(`✅ [Job ${job.id}] SUCCESS - Sent in ${result.duration}ms`);
      console.log(`📊 Overall: ${sendStats.sent}/${sendStats.total} (${percent}%) | Rate: ${rate}/sec | Elapsed: ${elapsed}s`);
      
      return result;
    } else {
      throw new Error('Send failed');
    }
  } catch (error) {
    if (job.attemptsMade < (process.env.BULL_MAX_RETRIES || 10) - 1) {
      console.warn(`⚠️ [Job ${job.id}] RETRY scheduled (${job.attemptsMade + 1}/${process.env.BULL_MAX_RETRIES || 10})`);
    } else {
      sendStats.failed++;
      console.error(`❌ [Job ${job.id}] FINAL FAILURE after ${job.attemptsMade + 1} attempts`);
    }
    throw error;
  }
});

bull.on('completed', (job) => {
  if (job.id % 10 === 0 || sendStats.sent === sendStats.total) {
    const percent = sendStats.total > 0 ? ((sendStats.sent / sendStats.total) * 100).toFixed(1) : '0.0';
    console.log(`\n🎉 Progress Milestone: ${sendStats.sent}/${sendStats.total} (${percent}%)`);
  }
  
  if (sendStats.sent === sendStats.total && sendStats.total > 0) {
    const totalTime = Math.round((Date.now() - sendStats.startTime) / 1000);
    const avgRate = sendStats.sent > 0 ? (sendStats.sent / totalTime).toFixed(2) : '0.00';
    const successRate = ((sendStats.sent / sendStats.total) * 100).toFixed(2);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎊 ALL NOTIFICATIONS COMPLETED!');
    console.log('='.repeat(60));
    console.log(`✅ Total Sent: ${sendStats.sent}`);
    console.log(`❌ Failed: ${sendStats.failed}`);
    console.log(`🎯 Success Rate: ${successRate}%`);
    console.log(`⏱️  Total Time: ${totalTime}s (${(totalTime / 60).toFixed(1)} minutes)`);
    console.log(`📈 Average Rate: ${avgRate} notifications/sec`);
    console.log('='.repeat(60) + '\n');
    
    sendStats = {
      total: 0,
      sent: 0,
      failed: 0,
      startTime: null
    };
  }
});

bull.on('failed', (job, err) => {
  console.error(`\n❌ [Job ${job.id}] FAILED PERMANENTLY`);
  console.error(`   Email: ${job.data.email}`);
  console.error(`   Error: ${err.message}`);
  console.error(`   Attempts: ${job.attemptsMade}/${process.env.BULL_MAX_RETRIES || 10}\n`);
});

bull.on('stalled', (job) => {
  console.warn(`⚠️ [Job ${job.id}] STALLED - Will retry`);
});

bull.on('error', (error) => {
  console.error('❌ Bull Queue Error:', error.message);
});

setInterval(async () => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      bull.getWaitingCount(),
      bull.getActiveCount(),
      bull.getCompletedCount(),
      bull.getFailedCount()
    ]);

    if (waiting > 0 || active > 0) {
      console.log(`\n📊 Queue Health:`);
      console.log(`   ⏳ Waiting: ${waiting}`);
      console.log(`   🔄 Active: ${active}`);
      console.log(`   ✅ Completed: ${completed}`);
      console.log(`   ❌ Failed: ${failed}`);
      
      if (sendStats.total > 0) {
        const percent = ((sendStats.sent / sendStats.total) * 100).toFixed(1);
        console.log(`   📈 Batch Progress: ${sendStats.sent}/${sendStats.total} (${percent}%)`);
      }
    }
  } catch (err) {
    console.error('❌ Health check error:', err.message);
  }
}, 30000);

module.exports = bull;