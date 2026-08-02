const bull = require("./bullInit");
const axios = require("axios");
const config = require("./config");
const db = require("../config/db");
const HallNotificationService = require("../services/hallNotificationService");
const { buildHallSeatingMessage } = require("../services/hallNotificationMessage");
const { startHallNotificationScheduler } = require("../services/hallNotificationScheduler");

let sendStats = { total: 0, sent: 0, failed: 0, startTime: null };

async function sendTeamsMessage(toEmail, message, jobId, attempt) {
  const MOCK_MODE = process.env.MOCK_TEAMS_API === "true";
  const startTime = Date.now();

  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 50));
    return { success: true, data: { mock: true }, duration: Date.now() - startTime };
  }

  const response = await axios.post(
    config.KCT_TEAMS_API_URL,
    {
      from_email: config.KCT_TEAMS_FROM_EMAIL,
      email: toEmail,
      message,
      content_type: "html",
      mention: "true",
    },
    {
      auth: {
        username: config.KCT_TEAMS_API_USER,
        password: config.KCT_TEAMS_API_PASSWORD,
      },
      timeout: 30000,
    }
  );

  return { success: true, data: response.data, duration: Date.now() - startTime };
}

function formatExamTime(start, end) {
  if (!start && !end) return "—";
  const fmt = (t) => {
    if (!t) return "";
    const s = String(t).slice(0, 5);
    const [h, m] = s.split(":");
    let hour = parseInt(h, 10);
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${m} ${suffix}`;
  };
  return `${fmt(start)} - ${fmt(end)}`.trim();
}

async function buildMessageForJob(job) {
  if (job.data.customMessage) return job.data.customMessage;

  if (job.data.type === "hall-notification" && job.data.notificationId) {
    const [rows] = await db.query(`SELECT * FROM hall_notifications WHERE id = ?`, [
      job.data.notificationId,
    ]);
    const row = rows[0];
    if (!row) throw new Error("Hall notification record not found");

    const settings = await HallNotificationService.getSettings();
    return buildHallSeatingMessage({
      studentName: row.recipient_name ?? row.recipientname,
      regnNo: row.regn_no ?? row.regnno,
      hallName: row.hall_name ?? row.hallname,
      examDate: row.exam_date ?? row.examdate,
      examTime: formatExamTime(
        row.exam_start_time ?? row.examstarttime,
        row.exam_end_time ?? row.examendtime
      ),
      examSession: row.exam_session ?? row.examsession,
      examType: row.exam_type ?? row.examtype,
      courseName: row.course_name ?? row.coursename,
      courseCode: row.course_code ?? row.coursecode,
      department: row.department,
      portalUrl: settings.portalUrl,
    });
  }

  const { studentName, examDate, examTime, venue, courseName } = job.data;
  return `
<b>📢 EXAM ANNOUNCEMENT</b><br><br>
Hello <b>${studentName}</b>,<br><br>
<b>Venue:</b> ${venue}<br>
<b>Course:</b> ${courseName}<br>
<b>Date:</b> ${new Date(examDate).toDateString()}<br>
<b>Time:</b> ${examTime}<br><br>
Please arrive 10 minutes early.<br>
<i>— KSI</i>
  `.trim();
}

const CONCURRENCY = Math.max(1, parseInt(process.env.BULL_CONCURRENCY || "1", 10));

console.log("🚀 Hallora notification worker starting");
console.log(`   Concurrency: ${CONCURRENCY}`);
console.log(`   Mock: ${process.env.MOCK_TEAMS_API === "true"}`);

bull.process(CONCURRENCY, async (job) => {
  const notificationId = job.data.notificationId;
  const isHall = job.data.type === "hall-notification" && notificationId;

  if (isHall) {
    await HallNotificationService.markProcessing(notificationId);
  }

  const message = await buildMessageForJob(job);
  const email = job.data.email;
  const maxRetries = parseInt(process.env.BULL_MAX_RETRIES || "5", 10);

  try {
    const result = await sendTeamsMessage(email, message, job.id, job.attemptsMade + 1);

    if (isHall) {
      await HallNotificationService.markSent(notificationId, { duration: result.duration });
      await HallNotificationService.markDelivered(notificationId, result.data);
    }

    sendStats.sent += 1;
    return result;
  } catch (error) {
    const errMsg = error.response?.data?.message || error.message || "Send failed";
    const willRetry = job.attemptsMade < maxRetries - 1;

    if (isHall) {
      await HallNotificationService.markFailed(notificationId, errMsg, { retrying: willRetry });
    }

    if (!willRetry) sendStats.failed += 1;
    throw error;
  }
});

bull.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

startHallNotificationScheduler();

module.exports = bull;
