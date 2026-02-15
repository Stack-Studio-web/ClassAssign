const bull = require('./bullInit');
const axios = require('axios');
const config = require('./config');

async function sendTeamsMessage(toEmail, message) {
  const MOCK_MODE = process.env.MOCK_TEAMS_API === 'true';
  
  if (MOCK_MODE) {
    await new Promise(resolve => setTimeout(resolve, 50));
    return { success: true, data: { mock: true } };
  }

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
      }
    }
  );

  return { success: true, data: response.data };
}

const CONCURRENCY = parseInt(process.env.BULL_CONCURRENCY) || 2;

console.log('🚀 BULL WORKER - CUSTOM MESSAGE SUPPORT ENABLED');

bull.process(CONCURRENCY, async (job) => {
  let message = '';

  // ✅ If customMessage provided, use it
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
      <i>— KSI</i>
    `.trim();
  }

  const result = await sendTeamsMessage(job.data.email, message);
  
  if (result.success) {
    await job.progress(100);
    return result;
  } else {
    throw new Error('Send failed');
  }
});

bull.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

bull.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

module.exports = bull;