// notificationRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bull = require("../config/bullQueue");
const IneligibleStudent = require("../models/IneligibleStudent");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");

// ✅ Store batch tracking for progress updates
let currentBatch = {
  total: 0,
  startTime: null,
  initialCompleted: 0
};

/* ================================
   GET /api/notifications/progress
   Poll this to get current progress
================================ */
router.get("/progress", sessionAuth, async (req, res) => {
  try {
    const [completed, failed, waiting, active] = await Promise.all([
      bull.getCompletedCount(),
      bull.getFailedCount(),
      bull.getWaitingCount(),
      bull.getActiveCount()
    ]);
    
    const sent = Math.max(0, completed - currentBatch.initialCompleted);
    const total = currentBatch.total;
    const isComplete = sent >= total && waiting === 0 && active === 0;
    
    let message;
    if (isComplete && total > 0) {
      message = `Notification sent to ${sent}/${total} students`;
    } else if (total > 0) {
      message = `Sending notification ${sent}/${total}`;
    } else {
      message = "No notifications in progress";
    }
    
    res.json({
      message,
      sent,
      total,
      failed,
      isComplete
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(
  "/exam-announcement-v2",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  auditLogger("SEND_EXAM_ANNOUNCEMENT_V2", "Notification"),
  async (req, res) => {
    const { examType, coursesWithDates, department } = req.body;

    if (!examType || !coursesWithDates || coursesWithDates.length === 0) {
      return res.status(400).json({
        error: "Exam type and at least one course with date are required",
      });
    }

    for (const item of coursesWithDates) {
      if (!item.courseCode || !item.examDate) {
        return res.status(400).json({
          error: "Each course must have courseCode and examDate",
        });
      }
    }

    try {
      console.log('\n' + '='.repeat(60));
      console.log('📢 EXAM ANNOUNCEMENT V2 - PROCESSING');
      console.log(`Exam Type: ${examType} | Courses: ${coursesWithDates.length}`);

      const courses = coursesWithDates.map(c => c.courseCode);
      const placeholders = courses.map(() => "?").join(",");

      const [students] = await db.query(
        `SELECT regn_no, student_name, email, course_description, course_name
         FROM students WHERE course_description IN (${placeholders})
         GROUP BY regn_no, student_name, email, course_description, course_name`,
        courses
      );

      if (students.length === 0) {
        return res.status(404).json({ error: "No students found" });
      }

      console.log(`✅ Found ${students.length} student records`);

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
        
        const courseData = coursesWithDates.find(c => c.courseCode === s.course_description);
        studentMap[s.email].courses.push({
          code: s.course_description,
          name: s.course_name,
          examDate: courseData?.examDate
        });
      });

      let totalEligible = 0;
      let totalIneligible = 0;

      for (const email in studentMap) {
        const student = studentMap[email];
        for (const course of student.courses) {
          const isIneligible = await IneligibleStudent.isIneligible(
            student.regnNo, course.code, examType, course.examDate
          );
          course.eligible = !isIneligible;
          if (isIneligible) totalIneligible++; else totalEligible++;
        }
      }

      console.log(`Eligible: ${totalEligible} | Ineligible: ${totalIneligible}`);

      const queued = [];
      const skipped = [];

      for (const email in studentMap) {
        const student = studentMap[email];
        const eligibleCourses = student.courses.filter(c => c.eligible);
        const ineligibleCourses = student.courses.filter(c => !c.eligible);

        if (eligibleCourses.length === 0 && ineligibleCourses.length === 0) {
          skipped.push({ email, reason: "No courses" });
          continue;
        }

        let message = `<b>📢 EXAM ANNOUNCEMENT</b><br><br>Hello <b>${student.studentName}</b>,<br><br>`;

        if (eligibleCourses.length > 0) {
          message += `<b>${examType}</b> exams are scheduled for:<br><br>`;
          eligibleCourses.forEach(c => {
            const dateStr = new Date(c.examDate).toLocaleDateString('en-IN', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            message += `📘 <b>${c.code}</b> - ${c.name || c.code}<br>   📅 ${dateStr}<br><br>`;
          });
        }

        if (ineligibleCourses.length > 0) {
          message += `<br><b style="color: red;">⚠️ IMPORTANT NOTICE</b><br><br>`;
          message += `You are <b>INELIGIBLE</b> for the following exam(s):<br><br>`;
          ineligibleCourses.forEach(c => {
            const dateStr = new Date(c.examDate).toLocaleDateString('en-IN', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            message += `❌ <b>${c.code}</b> - ${c.name || c.code}<br>   📅 ${dateStr}<br><br>`;
          });
          message += `<i>Contact your faculty advisor immediately.</i><br><br>`;
        }

        if (eligibleCourses.length > 0) {
          message += `Please arrive 10 minutes early.<br><br>`;
        }
        message += `<i>— KSI</i>`;

        const job = await bull.add({
          type: "exam-announcement-v2",
          email,
          studentName: student.studentName,
          examType,
          eligibleCourses: eligibleCourses.length,
          ineligibleCourses: ineligibleCourses.length,
          customMessage: message.trim()
        });

        queued.push({ jobId: job.id, email });
      }

      const [waiting, active, completed, failed] = await Promise.all([
        bull.getWaitingCount(),
        bull.getActiveCount(),
        bull.getCompletedCount(),
        bull.getFailedCount()
      ]);

      // ✅ Set batch tracking
      currentBatch = {
        total: queued.length,
        startTime: Date.now(),
        initialCompleted: completed
      };

      console.log(`✅ Queued: ${queued.length} | Skipped: ${skipped.length}`);
      console.log('='.repeat(60) + '\n');

      // ✅ Return initial message - your frontend will poll /progress for updates
      res.json({
        success: true,
        message: `Sending notification 0/${queued.length}`,
        id: `${examType}_${Date.now()}`,
        examType,
        courses: coursesWithDates,
        stats: {
          queued: queued.length,
          skipped: skipped.length,
          queueStats: { waiting, active, completed, failed }
        },
        queued,
        skipped
      });

    } catch (err) {
      console.error("Error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

router.post(
  "/teams",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  auditLogger("SEND_NOTIFICATION", "Notification"),
  async (req, res) => {
    // @deprecated Manual Hall notifications — use automated scheduling via seating plan finalize.
    // Kept for backward compatibility only.
    const { date, session } = req.body;

    if (!date || !session) {
      return res.status(400).json({ error: "Date and session required" });
    }

    try {
      console.log('\n' + '='.repeat(60));
      console.log(`📧 SEATING NOTIFICATIONS: ${date} ${session}`);

      const dateOnly = date.includes("T") ? date.split("T")[0] : date;

      const [plans] = await db.query(
        `SELECT id, exam_date, exam_session, exam_type, exam_start_time, exam_end_time, selected_courses
         FROM seating_plans WHERE exam_date = ? AND exam_session = ?`,
        [dateOnly, session]
      );

      if (plans.length === 0) {
        return res.status(404).json({ error: "No seating plans found" });
      }

      const planIds = plans.map(p => p.id);
      const [venues] = await db.query(
        `SELECT spv.id as venue_plan_id, spv.seating_plan_id, spv.venue_name
         FROM seating_plan_venues spv WHERE spv.seating_plan_id IN (${planIds.map(() => "?").join(",")})`,
        planIds
      );

      const venuePlanIds = venues.map(v => v.venue_plan_id);
      const [seatingArrangements] = await db.query(
        `SELECT seating_plan_venue_id, regn_no FROM seating_arrangements
         WHERE seating_plan_venue_id IN (${venuePlanIds.map(() => "?").join(",")})`,
        venuePlanIds
      );

      const studentVenueMap = {};
      const studentCourseMap = {};
      const studentSet = new Set();

      for (const plan of plans) {
        const [planStudents] = await db.query(
          `SELECT regn_no, course_description FROM seating_plan_students WHERE seating_plan_id = ?`,
          [plan.id]
        );
        planStudents.forEach(s => {
          if (s.regn_no && s.course_description) {
            studentCourseMap[s.regn_no.trim()] = s.course_description;
          }
        });
      }

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
            allSelectedCourses: typeof plan.selected_courses === "string"
              ? JSON.parse(plan.selected_courses) : plan.selected_courses || []
          };
        }
      });

      if (studentSet.size === 0) {
        return res.status(404).json({ error: "No students found" });
      }

      const regnNos = Array.from(studentSet);
      const [studentRecords] = await db.query(
        `SELECT regn_no, MIN(student_name) AS student_name, MIN(email) AS email
         FROM students WHERE regn_no IN (${regnNos.map(() => "?").join(",")}) GROUP BY regn_no`,
        regnNos
      );

      const allCourseCodes = new Set(Object.values(studentCourseMap));
      plans.forEach(plan => {
        const courses = typeof plan.selected_courses === "string" ? JSON.parse(plan.selected_courses) : plan.selected_courses;
        if (courses) courses.forEach(code => allCourseCodes.add(code));
      });

      let courseMap = {};
      if (allCourseCodes.size > 0) {
        const courseCodesArray = Array.from(allCourseCodes);
        const [courses] = await db.query(
          `SELECT DISTINCT course_description AS courseCode, course_name FROM students
           WHERE course_description IN (${courseCodesArray.map(() => "?").join(",")})`,
          courseCodesArray
        );
        courses.forEach(c => {
          if (c.courseCode && c.course_name) courseMap[c.courseCode] = c.course_name;
        });
      }

      const queued = [];
      const skipped = [];

      for (const student of studentRecords) {
        const { regn_no, student_name, email } = student;

        if (!email || !email.trim()) {
          skipped.push({ regnNo: regn_no, reason: "No email" });
          continue;
        }

        const venueData = studentVenueMap[regn_no];
        if (!venueData) {
          skipped.push({ regnNo: regn_no, reason: "No venue" });
          continue;
        }

        const thisCourseCode = studentCourseMap[regn_no];
        let courseName = "N/A";
        let courseCodes = [];

        if (thisCourseCode) {
          courseCodes = [thisCourseCode];
          courseName = courseMap[thisCourseCode] || thisCourseCode;
        } else {
          courseCodes = venueData.allSelectedCourses;
          courseName = courseCodes.map(c => courseMap[c] || c).join(", ");
        }

        const job = await bull.add({
          type: "seating-notification",
          email,
          studentName: student_name,
          examDate: venueData.examDate,
          examTime: venueData.examTime,
          venue: venueData.venueName,
          courseName,
          courseCodes
        });

        queued.push({ jobId: job.id, regnNo: regn_no, email });
      }

      const [waiting, active, completed, failed] = await Promise.all([
        bull.getWaitingCount(),
        bull.getActiveCount(),
        bull.getCompletedCount(),
        bull.getFailedCount()
      ]);

      // ✅ Set batch tracking
      currentBatch = {
        total: queued.length,
        startTime: Date.now(),
        initialCompleted: completed
      };

      console.log(`✅ Queued: ${queued.length} | Skipped: ${skipped.length}`);
      console.log('='.repeat(60) + '\n');

      // ✅ Return initial message - your frontend will poll /progress for updates
      res.json({
        success: true,
        message: `Sending notification 0/${queued.length}`,
        id: `${dateOnly}_${session}`,
        examDate: dateOnly,
        examSession: session,
        examType: plans[0]?.exam_type,
        stats: {
          queued: queued.length,
          skipped: skipped.length,
          queueStats: { waiting, active, completed, failed }
        },
        queued,
        skipped
      });

    } catch (err) {
      console.error("Error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Other routes unchanged
router.post("/exam-announcement", sessionAuth, checkRole(['admin', 'faculty_incharge']), auditLogger("SEND_EXAM_ANNOUNCEMENT", "Notification"), async (req, res) => {
  const { examType, courses } = req.body;
  if (!examType || !courses || courses.length === 0) return res.status(400).json({ error: "Required fields missing" });
  try {
    const placeholders = courses.map(() => "?").join(",");
    const [students] = await db.query(`SELECT regn_no, student_name, email, course_description, course_name FROM students WHERE course_description IN (${placeholders}) GROUP BY regn_no, student_name, email, course_description, course_name`, courses);
    if (students.length === 0) return res.status(404).json({ error: "No students found" });
    const studentMap = {};
    students.forEach(s => {
      if (!s.email) return;
      if (!studentMap[s.email]) studentMap[s.email] = { regnNo: s.regn_no, studentName: s.student_name, email: s.email, courses: [] };
      studentMap[s.email].courses.push({ code: s.course_description, name: s.course_name });
    });
    const queued = [];
    for (const email in studentMap) {
      const student = studentMap[email];
      if (student.courses.length === 0) continue;
      const courseList = student.courses.map(c => `📘 ${c.code} - ${c.name || c.code}`).join("\n");
      const job = await bull.add({ type: "exam-announcement", email, studentName: student.studentName, examType, courseList });
      queued.push({ jobId: job.id, email });
    }
    const [completed] = await Promise.all([bull.getCompletedCount()]);
    currentBatch = { total: queued.length, startTime: Date.now(), initialCompleted: completed };
    res.json({ success: true, message: `Sending notification 0/${queued.length}`, id: `${examType}_${Date.now()}`, stats: { queued: queued.length } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/queue/stats", sessionAuth, async (req, res) => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([bull.getWaitingCount(), bull.getActiveCount(), bull.getCompletedCount(), bull.getFailedCount()]);
    res.json({ stats: { waiting, active, completed, failed } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/queue/clear", sessionAuth, checkRole(['admin']), auditLogger("CLEAR_NOTIFICATION_QUEUE", "NotificationQueue"), async (req, res) => {
  try {
    await bull.empty();
    await bull.clean(0, "completed");
    await bull.clean(0, "failed");
    currentBatch = { total: 0, startTime: null, initialCompleted: 0 };
    res.json({ message: "Bull queue cleared", id: `queue_clear_${Date.now()}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;