const express = require("express");
const router = express.Router();
const axios = require("axios");
const SeatingPlan = require("../models/SeatingPlan");
const Student = require("../models/Student");
const Exam = require("../models/Exam");
const { URLSearchParams } = require("url");

/* ================================
   MICROSOFT TEAMS CONFIG
================================ */
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID;

const AUTH_BASE_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;

/* ================================
   GET TEAMS ACCESS TOKEN
================================ */
const getTeamsAccessToken = async () => {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    scope: "https://graph.microsoft.com/.default",
    client_secret: MICROSOFT_CLIENT_SECRET,
    grant_type: "client_credentials",
  });

  const { data } = await axios.post(AUTH_BASE_URL, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return data.access_token;
};

/* ================================
   GET MICROSOFT USER ID
================================ */
const getMicrosoftUserId = async (accessToken, email) => {
  try {
    const { data } = await axios.get(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return data.id;
  } catch {
    return null;
  }
};

/* ================================
   SEND TEAMS MESSAGE
================================ */
const sendTeamsMessage = async (accessToken, userId, message) => {
  try {
    const chat = await axios.post(
      `https://graph.microsoft.com/v1.0/users/${userId}/chats`,
      {
        chatType: "oneOnOne",
        members: [
          {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users/${userId}`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    await axios.post(
      `https://graph.microsoft.com/v1.0/chats/${chat.data.id}/messages`,
      {
        body: { contentType: "text", content: message },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return true;
  } catch {
    return false;
  }
};

/* ================================
   POST /api/notifications/teams
================================ */
router.post("/teams", async (req, res) => {
  const { date, session } = req.body;

  if (!date || !session) {
    return res
      .status(400)
      .json({ error: "Date and Session are required." });
  }

  try {
    /* 1️⃣ Get seating plans */
    const plans = await SeatingPlan.getPlansByDateSession(date, session);

    if (!plans.length) {
      return res.status(404).json({
        message: "No seating plans found for this date and session.",
      });
    }

    /* 2️⃣ Extract roll numbers */
    const studentVenueMap = {};
    const rollSet = new Set();

    plans.forEach((p) => {
      p.venuesUsed.forEach((v) => {
        v.seating.forEach((seat) => {
          if (!seat.regn_no || seat.regn_no === "Empty") return;
          rollSet.add(seat.regn_no);
          studentVenueMap[seat.regn_no] = {
            venueName: v.venue_name,
            examTime: `${p.exam_start_time} - ${p.exam_end_time}`,
            examDate: p.exam_date,
          };
        });
      });
    });

    const rollNumbers = [...rollSet];

    /* 3️⃣ Fetch students */
    const students = await Student.getByRegnNos(rollNumbers);

    if (!students.length) {
      return res.status(404).json({
        error: "No students found in Student table.",
      });
    }

    /* 4️⃣ Fetch exam names */
    const examCodes = [
      ...new Set(students.map((s) => s.course_description)),
    ];
    const exams = await Exam.getByCodes(examCodes);
    const examMap = Object.fromEntries(
      exams.map((e) => [e.exam_code, e.exam_name])
    );

    /* 5️⃣ Get Teams token */
    const accessToken = await getTeamsAccessToken();

    /* 6️⃣ Send notifications */
    const sent = [];
    const failed = [];
    const seenEmails = new Set();

    for (const s of students) {
      if (!s.email || seenEmails.has(s.email)) continue;
      seenEmails.add(s.email);

      const details = studentVenueMap[s.regn_no];
      if (!details) continue;

      const msg = `
🎓 KCT Exam Allotment

Hello ${s.student_name},

📅 Date: ${new Date(details.examDate).toDateString()}
⏰ Time: ${details.examTime}
🏛️ Venue: ${details.venueName}

📘 Course: ${examMap[s.course_description] || s.course_name}

Best of luck!
— KCT Examination Cell
      `.trim();

      const userId = await getMicrosoftUserId(accessToken, s.email);
      if (!userId) {
        failed.push({ regnNo: s.regn_no, reason: "MS user not found" });
        continue;
      }

      const ok = await sendTeamsMessage(accessToken, userId, msg);
      ok
        ? sent.push({ regnNo: s.regn_no, email: s.email })
        : failed.push({ regnNo: s.regn_no, reason: "Send failed" });
    }

    return res.json({
      success: sent.length > 0,
      stats: {
        totalStudents: rollNumbers.length,
        foundStudents: students.length,
        sent: sent.length,
        failed: failed.length,
      },
      sent,
      failed,
    });
  } catch (err) {
    console.error("[Notification Error]", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
