// backend/config/bullWorker.js
// Exact Node.js equivalent of Python's celery_worker.py
// This file creates a Bull worker that processes notification jobs
// NOW HANDLES TWO TYPES: seating notifications + exam announcements

const bull = require('./bullInit'); // Import the pre-configured Bull instance
const db = require('./db'); // Your database connection
const axios = require('axios');
const config = require('./config');

/* ================================
   SEND TEAMS MESSAGE FUNCTION
================================ */
async function sendTeamsMessage(toEmail, message) {
  const MOCK_MODE = process.env.MOCK_TEAMS_API === 'true';
  
  if (MOCK_MODE) {
    console.log('🧪 MOCK: Teams to', toEmail);
    return { success: true, data: { mock: true } };
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
          password: config.KCT_TEAMS_API_PASSWORD,
        },
        headers: { "Content-Type": "application/json" },
        timeout: 60000
      }
    );
    
    return { success: true, data: response.data };
  } catch (err) {
    return { 
      success: false, 
      error: err.message,
      code: err.code
    };
  }
}

/* ================================
   PROCESS NOTIFICATION JOBS
   This is equivalent to a Celery @task decorator
   Python: @celery.task
   Node.js: bull.process()
   
   NOW HANDLES TWO TYPES:
   1. Seating notifications (type: 'seating' or undefined)
   2. Exam announcements (type: 'exam-announcement')
================================ */
bull.process(async (job) => {
  const jobType = job.data.type || 'seating'; // Default to seating for backward compatibility
  
  console.log(`\n📤 Processing ${jobType} notification for ${job.data.studentName} (${job.data.email})`);
  
  let message = '';
  
  if (jobType === 'exam-announcement') {
    // 🔴 NEW: Exam Announcement Message (No date/time/venue)
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
    // 🔵 ORIGINAL: Seating Notification Message (With venue/time/date)
    const { studentName, examDate, examTime, venue, courseName } = job.data;
    
    message = `
      <br><b>📢 EXAM ANNOUNCEMENT</b><br><br>
      Hello <b>${studentName}</b>,<br><br>
      <b>Venue:</b> <b> ${venue}</b><br><br>
      <b>Course:</b> <b>${courseName}</b><br><br>
      <b>Date:</b> ${new Date(examDate).toDateString()}<br><br>
      <b>Time:</b> ${examTime}<br><br>
      Please be present at least 30 minutes early.<br><br>
      <i>— KSI</i>
    `.trim();
  }
  
  // Send Teams notification
  const result = await sendTeamsMessage(job.data.email, message);
  
  if (result.success) {
    console.log(`  ✅ Teams notification sent successfully`);
  } else {
    console.error(`  ❌ Failed:`, result.error);
    throw new Error(result.error); // This will trigger retry
  }
  
  return result;
});

/* ================================
   EVENT HANDLERS
================================ */
bull.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed`);
});

bull.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

bull.on('stalled', (job) => {
  console.warn(`⚠️  Job ${job.id} stalled`);
});

bull.on('error', (error) => {
  console.error('❌ Bull Queue Error:', error.message);
});

console.log('🚀 Bull worker started and ready to process jobs ');

module.exports = bull;