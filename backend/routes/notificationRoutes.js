const express = require("express");
const router = express.Router();
const axios = require("axios");
const db = require("../config/db");

/* ================================
   KCT TEAMS CONFIG
================================ */
const KCT_TEAMS_API_URL = process.env.KCT_TEAMS_API_URL || "http://10.1.76.76:25001/send/";
const KCT_TEAMS_FROM_EMAIL = process.env.KCT_TEAMS_FROM_EMAIL || "entry@kct.ac.in";
const KCT_TEAMS_API_USER = process.env.KCT_TEAMS_API_USER;
const KCT_TEAMS_API_PASSWORD = process.env.KCT_TEAMS_API_PASSWORD;

/* ================================
   SEND TEAMS CHAT MESSAGE
================================ */
const sendTeamsMessage = async (toEmail, message) => {
  console.log("\n=== ATTEMPTING TEAMS MESSAGE ===");
  console.log("To:", toEmail);
  console.log("API URL:", KCT_TEAMS_API_URL);
  console.log("From Email:", KCT_TEAMS_API_USER);
  console.log("Auth configured:", !!(KCT_TEAMS_API_USER && KCT_TEAMS_API_PASSWORD));
  
  // MOCK MODE: Set to true for testing without actual API
  const MOCK_MODE = process.env.MOCK_TEAMS_API === 'true';
  
  if (MOCK_MODE) {
    console.log("🧪 MOCK MODE: Simulating successful Teams notification");
    console.log("Message preview:", message.substring(0, 100) + "...");
    return { success: true, data: { mock: true, message: "Mock notification sent" } };
  }
  
  try {
    const response = await axios.post(
      KCT_TEAMS_API_URL,
      {
        from_email: KCT_TEAMS_FROM_EMAIL,
        email: toEmail,
        message: message,
        content_type: "html",
        mention: "true"
      },
      {
        auth: {
          username: KCT_TEAMS_API_USER,
          password: KCT_TEAMS_API_PASSWORD,
        },
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 60000, // 60 seconds
      }
    );
    
    console.log("✅ SUCCESS! Response:", response.status, response.data);
    return { success: true, data: response.data };
    
  } catch (err) {
    console.error("\n❌ TEAMS API ERROR:");
    console.error("Error Type:", err.code || err.name);
    console.error("Error Message:", err.message);
    
    if (err.response) {
      console.error("Response Status:", err.response.status);
      console.error("Response Data:", err.response.data);
      console.error("Response Headers:", err.response.headers);
    } else if (err.request) {
      console.error("No response received. Request details:", {
        method: err.request.method,
        path: err.request.path,
        host: err.request.host
      });
      console.error("\n⚠️  CONNECTION FAILED - Possible reasons:");
      console.error("   1. Not connected to KCT network/VPN");
      console.error("   2. Server is down or unreachable");
      console.error("   3. Firewall blocking port 25001");
      console.error("   💡 TIP: Add MOCK_TEAMS_API=true to .env for testing");
    }
    
    return { 
      success: false, 
      error: err.message,
      code: err.code,
      responseStatus: err.response?.status,
      responseData: err.response?.data
    };
  }
};

/* ================================
   POST /api/notifications/teams
================================ */
router.post("/teams", async (req, res) => {
  const { date, session } = req.body;

  if (!date || !session) {
    return res.status(400).json({
      error: "Date and session are required",
    });
  }

  // Check credentials
  if (!KCT_TEAMS_API_USER || !KCT_TEAMS_API_PASSWORD) {
    return res.status(500).json({
      error: "Teams API credentials not configured",
      message: "Please set KCT_TEAMS_API_USER and KCT_TEAMS_API_PASSWORD in .env"
    });
  }

  try {
    // 1️⃣ Get seating plans
    const dateOnly = date.includes("T") ? date.split("T")[0] : date;
    
    const [plans] = await db.query(
      `SELECT 
        id, exam_date, exam_session, exam_type,
        exam_start_time, exam_end_time, selected_courses
      FROM seating_plans
      WHERE exam_date = ? AND exam_session = ?`,
      [dateOnly, session]
    );

    if (plans.length === 0) {
      return res.status(404).json({ 
        error: "No seating plans found for this date and session" 
      });
    }

    // 2️⃣ Get venues
    const planIds = plans.map(p => p.id);
    const placeholders = planIds.map(() => '?').join(',');
    
    const [venues] = await db.query(
      `SELECT 
        spv.id as venue_plan_id, spv.seating_plan_id, spv.venue_name,
        f.name as faculty_name, f.department as faculty_department
      FROM seating_plan_venues spv
      LEFT JOIN faculty f ON spv.faculty_id = f.id
      WHERE spv.seating_plan_id IN (${placeholders})`,
      planIds
    );

    if (venues.length === 0) {
      return res.status(404).json({ error: "No venues found" });
    }

    // 3️⃣ Get seating arrangements
    const venuePlanIds = venues.map(v => v.venue_plan_id);
    const venuePlaceholders = venuePlanIds.map(() => '?').join(',');
    
    const [seatingArrangements] = await db.query(
      `SELECT seating_plan_venue_id, regn_no
      FROM seating_arrangements
      WHERE seating_plan_venue_id IN (${venuePlaceholders})`,
      venuePlanIds
    );

    // 4️⃣ Build mapping
    const studentVenueMap = {};
    const studentSet = new Set();

    seatingArrangements.forEach(seat => {
      const regnNo = seat.regn_no.trim();
      if (!regnNo) return;

      studentSet.add(regnNo);
      const venue = venues.find(v => v.venue_plan_id === seat.seating_plan_venue_id);
      if (!venue) return;

      const plan = plans.find(p => p.id === venue.seating_plan_id);
      if (!plan) return;

      studentVenueMap[regnNo] = {
        venueName: venue.venue_name,
        facultyName: venue.faculty_name || "TBA",
        examTime: `${plan.exam_start_time} - ${plan.exam_end_time}`,
        examDate: plan.exam_date,
        examType: plan.exam_type,
        examSession: plan.exam_session,
        courses: typeof plan.selected_courses === 'string'
          ? JSON.parse(plan.selected_courses)
          : plan.selected_courses || []
      };
    });

    if (studentSet.size === 0) {
      return res.status(404).json({ error: "No students found" });
    }

    // 5️⃣ Get student details (FIXED: SQL GROUP BY issue)
    const regnNos = Array.from(studentSet);
    const studentPlaceholders = regnNos.map(() => '?').join(',');
    
    const [studentRecords] = await db.query(
      `SELECT 
        regn_no, 
        MIN(student_name) as student_name, 
        MIN(email) as email, 
        MIN(course_description) as course_description, 
        MIN(course_name) as course_name
      FROM students
      WHERE regn_no IN (${studentPlaceholders})
      GROUP BY regn_no`,
      regnNos
    );

    if (studentRecords.length === 0) {
      return res.status(404).json({ error: "No student records found" });
    }

    // 6️⃣ Get exam names
    const courseDescriptions = [...new Set(studentRecords.map(s => s.course_description))].filter(Boolean);
    let examMap = {};
    
    if (courseDescriptions.length > 0) {
      try {
        const examPlaceholders = courseDescriptions.map(() => '?').join(',');
        const [exams] = await db.query(
          `SELECT exam_code, exam_name FROM exams WHERE exam_code IN (${examPlaceholders})`,
          courseDescriptions
        );
        examMap = Object.fromEntries(exams.map(e => [e.exam_code, e.exam_name]));
      } catch (err) {
        console.log("Exams table error:", err.message);
      }
    }

    // 7️⃣ Send notifications
    const sent = [];
    const failed = [];
    const skipped = [];
    const seen = new Set();

    for (const student of studentRecords) {
      const email = student.email;
      const regnNo = student.regn_no;

      if (!email || !email.trim()) {
        skipped.push({ regnNo, name: student.student_name, reason: "No email" });
        continue;
      }

      if (seen.has(email)) {
        skipped.push({ regnNo, email, name: student.student_name, reason: "Duplicate" });
        continue;
      }
      seen.add(email);

      const venueData = studentVenueMap[regnNo];
      if (!venueData) {
        skipped.push({ regnNo, email, name: student.student_name, reason: "No venue" });
        continue;
      }

      const courseName = examMap[student.course_description] 
        || student.course_name 
        || student.course_description 
        || "N/A";

      // Format message with HTML and line breaks
      const message = `
        <b>📢 EXAM ANNOUNCEMENT</b><br><br>
        Hello ${student.student_name},<br><br>
        <b>📅 Date:</b> ${new Date(venueData.examDate).toDateString()}<br><br>
        <b>⏰ Time:</b> ${venueData.examTime}<br><br>
        <b>🏛 Venue:</b> ${venueData.venueName}<br><br>
        <b>📘 Course:</b> ${courseName}<br><br>
        Please be present at least 30 minutes early.<br><br>
        — KCT Examination Cell
      `.trim();

      const result = await sendTeamsMessage(email, message);
      
      if (result.success) {
        sent.push({ regnNo, email, name: student.student_name, venue: venueData.venueName });
      } else {
        failed.push({ 
          regnNo, 
          email, 
          name: student.student_name,
          reason: result.error,
          errorCode: result.code,
          apiStatus: result.responseStatus,
          apiResponse: result.responseData
        });
      }
    }

    // 8️⃣ Return results
    res.json({
      success: true,
      message: "Notification process completed",
      stats: {
        totalPlans: plans.length,
        totalVenues: venues.length,
        totalStudentsInSeating: studentSet.size,
        studentsInDatabase: studentRecords.length,
        sent: sent.length,
        failed: failed.length,
        skipped: skipped.length
      },
      sent,
      failed,
      skipped
    });

  } catch (err) {
    console.error("Teams Notification Error:", err);
    res.status(500).json({ 
      error: "Failed to send notifications",
      message: err.message
    });
  }
});

module.exports = router;