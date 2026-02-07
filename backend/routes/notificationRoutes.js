const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bull = require("../config/bullWorker");

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
    const dateOnly = date.includes("T") ? date.split("T")[0] : date;

    // 1️⃣ Get seating plans
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
    const [venues] = await db.query(
      `SELECT 
        spv.id as venue_plan_id,
        spv.seating_plan_id,
        spv.venue_name
      FROM seating_plan_venues spv
      WHERE spv.seating_plan_id IN (${planIds.map(() => "?").join(",")})`,
      planIds
    );

    if (venues.length === 0) {
      return res.status(404).json({ error: "No venues found" });
    }

    // 3️⃣ Get seating arrangements (regn_no per venue)
    const venuePlanIds = venues.map(v => v.venue_plan_id);
    const [seatingArrangements] = await db.query(
      `SELECT seating_plan_venue_id, regn_no
       FROM seating_arrangements
       WHERE seating_plan_venue_id IN (${venuePlanIds.map(() => "?").join(",")})`,
      venuePlanIds
    );

    // 4️⃣ Build student → venue map  AND  student → course map
    const studentVenueMap = {};   // regn_no → { venueName, examTime, examDate, examType }
    const studentCourseMap = {};  // regn_no → course_description (SOURCE OF TRUTH)
    const studentSet = new Set();

    // ✅ Query seating_plan_students for each plan
    // This table stores the ACTUAL course each student was enrolled in
    for (const plan of plans) {
      const [planStudents] = await db.query(
        `SELECT regn_no, course_description
         FROM seating_plan_students
         WHERE seating_plan_id = ?`,
        [plan.id]
      );

      planStudents.forEach(s => {
        if (s.regn_no && s.course_description) {
          studentCourseMap[s.regn_no.trim()] = s.course_description;
        }
      });
    }

    console.log(`🗺️  Built student→course map for ${Object.keys(studentCourseMap).length} students`);

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
          // Keep selectedCourses only as a last-resort fallback for old data
          allSelectedCourses: typeof plan.selected_courses === "string"
            ? JSON.parse(plan.selected_courses)
            : plan.selected_courses || []
        };
      }
    });

    if (studentSet.size === 0) {
      return res.status(404).json({ error: "No students found" });
    }

    // 5️⃣ Get student details (name, email)
    const regnNos = Array.from(studentSet);
    const [studentRecords] = await db.query(
      `SELECT 
        regn_no,
        MIN(student_name) AS student_name,
        MIN(email) AS email
      FROM students
      WHERE regn_no IN (${regnNos.map(() => "?").join(",")})
      GROUP BY regn_no`,
      regnNos
    );

    // 6️⃣ Get course code → course name mapping
    // Collect all unique course codes that appear in studentCourseMap
    const allCourseCodes = new Set(Object.values(studentCourseMap));
    // Also include plan-level selectedCourses as fallback source
    plans.forEach(plan => {
      const courses = typeof plan.selected_courses === "string"
        ? JSON.parse(plan.selected_courses)
        : plan.selected_courses;
      if (courses) courses.forEach(code => allCourseCodes.add(code));
    });

    console.log('📋 All Course Codes from Seating Plan:', Array.from(allCourseCodes));

    let courseMap = {};
    if (allCourseCodes.size > 0) {
      const courseCodesArray = Array.from(allCourseCodes);
      const [courses] = await db.query(
        `SELECT DISTINCT course_description AS courseCode, course_name
         FROM students
         WHERE course_description IN (${courseCodesArray.map(() => "?").join(",")})`,
        courseCodesArray
      );

      courses.forEach(c => {
        if (c.courseCode && c.course_name) {
          courseMap[c.courseCode] = c.course_name;
        }
      });

      console.log('📚 Course Map from Students Table:', courseMap);
      console.log(`✅ Found ${Object.keys(courseMap).length} course names out of ${allCourseCodes.size} courses`);
    }

    // 7️⃣ Queue notifications — each student gets ONLY their own course
    const queued = [];
    const skipped = [];

    for (const student of studentRecords) {
      const { regn_no, student_name, email } = student;

      if (!email || !email.trim()) {
        skipped.push({ regnNo: regn_no, name: student_name, reason: "No email" });
        continue;
      }

      const venueData = studentVenueMap[regn_no];
      if (!venueData) {
        skipped.push({ regnNo: regn_no, email, name: student_name, reason: "No venue" });
        continue;
      }

      // ✅ FIXED: Look up THIS student's specific course from seating_plan_students
      const thisCourseCode = studentCourseMap[regn_no]; // e.g. "TEST002"

      let courseName = "N/A";
      let courseCodes = [];

      if (thisCourseCode) {
        // ✅ NEW: student has their own course from seating_plan_students
        courseCodes = [thisCourseCode];
        courseName = courseMap[thisCourseCode] || thisCourseCode;

        console.log(`🎓 Student ${regn_no}: course = ${thisCourseCode}`);
        console.log(`✅ Mapped ${thisCourseCode} → ${courseName} for ${regn_no}`);
      } else {
        // ⬇️ OLD DATA FALLBACK: no entry in seating_plan_students, use all plan courses
        courseCodes = venueData.allSelectedCourses;
        courseName = courseCodes.map(c => courseMap[c] || c).join(", ");

        console.log(`🎓 Student ${regn_no}: no course in seating_plan_students, fallback to all ${courseCodes.length} plan courses`);
      }

      console.log(`📧 Queuing notification for ${regn_no} (${student_name}): "${courseName}"`);

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

      queued.push({
        jobId: job.id,
        regnNo: regn_no,
        email,
        name: student_name,
        venue: venueData.venueName,
        courses: courseName
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
    console.error("❌ Teams Notification Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================================
   POST /api/notifications/exam-announcement
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

    const queued = [];
    const skipped = [];

    for (const email in studentMap) {
      const student = studentMap[email];
      if (student.courses.length === 0) {
        skipped.push({ email, reason: "No courses" });
        continue;
      }

      const courseList = student.courses
        .map(c => `📘 ${c.code} - ${c.name || c.code}`)
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