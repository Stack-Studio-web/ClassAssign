const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bull = require("../config/bullWorker"); // Bull queue instance

/* ================================
   POST /api/notifications/teams
   Seating-plan based notifications
================================ */
router.post("/teams", async (req, res) => {
  const { date, session } = req.body;

  if (!date || !session) {
    return res.status(400).json({
      error: "Date and session are required",
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
      return res.status(404).json({ error: "No seating plans found" });
    }

    // 2️⃣ Get venues
    const planIds = plans.map(p => p.id);
    const planPlaceholders = planIds.map(() => "?").join(",");

    const [venues] = await db.query(
      `SELECT 
        spv.id as venue_plan_id,
        spv.seating_plan_id,
        spv.venue_name
      FROM seating_plan_venues spv
      WHERE spv.seating_plan_id IN (${planPlaceholders})`,
      planIds
    );

    if (venues.length === 0) {
      return res.status(404).json({ error: "No venues found" });
    }

    // 3️⃣ Get seating arrangements
    const venuePlanIds = venues.map(v => v.venue_plan_id);
    const venuePlaceholders = venuePlanIds.map(() => "?").join(",");

    const [seatingArrangements] = await db.query(
      `SELECT seating_plan_venue_id, regn_no
       FROM seating_arrangements
       WHERE seating_plan_venue_id IN (${venuePlaceholders})`,
      venuePlanIds
    );

    // 4️⃣ Build student → venue map
    const studentVenueMap = {};
    const studentSet = new Set();

    seatingArrangements.forEach(seat => {
      const regnNo = seat.regn_no?.trim();
      if (!regnNo) return;

      studentSet.add(regnNo);

      const venue = venues.find(v => v.venue_plan_id === seat.seating_plan_venue_id);
      const plan = plans.find(p => p.id === venue?.seating_plan_id);

      if (venue && plan) {
        studentVenueMap[regnNo] = {
          venueName: venue.venue_name,
          examTime: `${plan.exam_start_time} - ${plan.exam_end_time}`,
          examDate: plan.exam_date,
          examType: plan.exam_type,
          courses: typeof plan.selected_courses === "string"
            ? JSON.parse(plan.selected_courses)
            : plan.selected_courses || []
        };
      }
    });

    if (studentSet.size === 0) {
      return res.status(404).json({ error: "No students found" });
    }

    // 5️⃣ Get student details
    const regnNos = Array.from(studentSet);
    const studentPlaceholders = regnNos.map(() => "?").join(",");

    const [studentRecords] = await db.query(
      `SELECT 
        regn_no,
        MIN(student_name) AS student_name,
        MIN(email) AS email,
        MIN(course_description) AS course_description,
        MIN(course_name) AS course_name
      FROM students
      WHERE regn_no IN (${studentPlaceholders})
      GROUP BY regn_no`,
      regnNos
    );

    // 6️⃣ Get exam names
    const courseDescriptions = [...new Set(studentRecords.map(s => s.course_description))].filter(Boolean);
    let examMap = {};

    if (courseDescriptions.length > 0) {
      try {
        const examPlaceholders = courseDescriptions.map(() => "?").join(",");
        const [exams] = await db.query(
          `SELECT exam_code, exam_name
           FROM exams
           WHERE exam_code IN (${examPlaceholders})`,
          courseDescriptions
        );
        examMap = Object.fromEntries(exams.map(e => [e.exam_code, e.exam_name]));
      } catch (err) {
        console.log("Exams table error:", err.message);
      }
    }

    // 7️⃣ Queue notifications
    const queued = [];
    const skipped = [];
    const seen = new Set();

    for (const student of studentRecords) {
      const { regn_no, student_name, email } = student;

      if (!email || !email.trim()) {
        skipped.push({ regnNo: regn_no, name: student_name, reason: "No email" });
        continue;
      }

      if (seen.has(email)) {
        skipped.push({ regnNo: regn_no, email, name: student_name, reason: "Duplicate" });
        continue;
      }
      seen.add(email);

      const venueData = studentVenueMap[regn_no];
      if (!venueData) {
        skipped.push({ regnNo: regn_no, email, name: student_name, reason: "No venue" });
        continue;
      }

      const courseName =
        examMap[student.course_description] ||
        student.course_name ||
        student.course_description ||
        "N/A";

      const job = await bull.add({
        type: "seating-notification",
        email,
        studentName: student_name,
        examDate: venueData.examDate,
        examTime: venueData.examTime,
        venue: venueData.venueName,
        courseName
      });

      queued.push({
        jobId: job.id,
        regnNo: regn_no,
        email,
        name: student_name,
        venue: venueData.venueName
      });
    }

    const [waiting, active, completed, failed] = await Promise.all([
      bull.getWaitingCount(),
      bull.getActiveCount(),
      bull.getCompletedCount(),
      bull.getFailedCount()
    ]);

    res.json({
      success: true,
      message: "Notifications queued successfully",
      stats: {
        queued: queued.length,
        skipped: skipped.length,
        queueStats: { waiting, active, completed, failed }
      },
      queued,
      skipped
    });

  } catch (err) {
    console.error("Teams Notification Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================================
   POST /api/notifications/exam-announcement
   Course-based exam announcements
================================ */
router.post("/exam-announcement", async (req, res) => {
  const { examType, courses } = req.body;

  if (!examType || !courses || courses.length === 0) {
    return res.status(400).json({
      error: "Exam type and at least one course are required",
    });
  }

  try {
    const placeholders = courses.map(() => "?").join(",");

    const [students] = await db.query(
      `SELECT regn_no, student_name, email, course_description, course_name
       FROM students
       WHERE course_description IN (${placeholders})
       GROUP BY regn_no, student_name, email, course_description, course_name`,
      courses
    );

    if (students.length === 0) {
      return res.status(404).json({ error: "No students found" });
    }

    const studentMap = {};

    students.forEach(s => {
      if (!s.email) return;
      if (!studentMap[s.email]) {
        studentMap[s.email] = {
          regnNo: s.regn_no,
          studentName: s.student_name,
          email: s.email,
          courses: []
        };
      }
      studentMap[s.email].courses.push({
        code: s.course_description,
        name: s.course_name
      });
    });

    let examMap = {};
    try {
      const [exams] = await db.query(
        `SELECT exam_code, exam_name
         FROM exams
         WHERE exam_code IN (${placeholders})`,
        courses
      );
      examMap = Object.fromEntries(exams.map(e => [e.exam_code, e.exam_name]));
    } catch (_) {}

    const queued = [];
    const skipped = [];

    for (const email in studentMap) {
      const student = studentMap[email];
      if (student.courses.length === 0) {
        skipped.push({ email, reason: "No courses" });
        continue;
      }

      const courseList = student.courses
        .map(c => `📘 ${c.code} - ${examMap[c.code] || c.name || c.code}`)
        .join("\n");

      const job = await bull.add({
        type: "exam-announcement",
        email,
        studentName: student.studentName,
        examType,
        courseList
      });

      queued.push({ jobId: job.id, email });
    }

    const [waiting, active, completed, failed] = await Promise.all([
      bull.getWaitingCount(),
      bull.getActiveCount(),
      bull.getCompletedCount(),
      bull.getFailedCount()
    ]);

    res.json({
      success: true,
      message: `${examType} notifications queued`,
      stats: {
        queued: queued.length,
        skipped: skipped.length,
        queueStats: { waiting, active, completed, failed }
      }
    });

  } catch (err) {
    console.error("Exam Announcement Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================================
   GET /api/notifications/queue/stats
================================ */
router.get("/queue/stats", async (req, res) => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      bull.getWaitingCount(),
      bull.getActiveCount(),
      bull.getCompletedCount(),
      bull.getFailedCount()
    ]);
    res.json({ stats: { waiting, active, completed, failed } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================
   POST /api/notifications/queue/clear
================================ */
router.post("/queue/clear", async (req, res) => {
  try {
    await bull.empty();
    await bull.clean(0, "completed");
    await bull.clean(0, "failed");
    res.json({ message: "Bull queue cleared" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
