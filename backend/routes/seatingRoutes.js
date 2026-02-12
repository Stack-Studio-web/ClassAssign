// Class/backend/routes/seatingRoutes.js - FIXED ROUTE ORDER
const express = require("express");
const router = express.Router();
const SeatingPlan = require("../models/SeatingPlan");
const Venue = require("../models/venue");
const Faculty = require("../models/Faculty");
const db = require("../config/db");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");

/* =====================================================
    POST: SAVE SEATING PLAN
    Roles: admin, faculty_incharge
===================================================== */
router.post(
  "/save-plan",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  auditLogger("CREATE_SEATING_PLAN", "SeatingPlan"),
  async (req, res) => {
    const connection = await db.getConnection();
    try {
      const {
        examDate,
        examStartTime,
        examEndTime,
        examSession,
        examType,
        selectedCourses,
        venuesUsed,
        students,
        facultyMode
      } = req.body;

      await connection.beginTransaction();

      if (!examDate || !examStartTime || !examEndTime || !examType) {
        await connection.rollback();
        return res.status(400).json({
          error: "Missing required fields",
          details: "Exam date, start time, end time, and type are required"
        });
      }

      if (!venuesUsed || venuesUsed.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          error: "No venues selected",
          details: "At least one venue must be selected for the seating plan"
        });
      }

      const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;

      const venueCheckPromises = venuesUsed.map(async (v) => {
        const isAvailable = await Venue.isAvailable(
          v.venueId,
          dateOnly,
          examStartTime,
          examEndTime
        );
        if (!isAvailable) {
          return {
            venueId: v.venueId,
            venueName: v.venueName,
            available: false
          };
        }
        return { venueId: v.venueId, available: true };
      });

      const availabilityResults = await Promise.all(venueCheckPromises);
      const unavailableVenues = availabilityResults.filter(r => !r.available);

      if (unavailableVenues.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          error: "Venue conflict",
          details: `The following venues are already booked: ${unavailableVenues.map(v => v.venueName).join(", ")}`,
          unavailableVenues
        });
      }

      if (facultyMode === "MANUAL") {
        const facultyIds = venuesUsed
          .map(v => v.facultyId)
          .filter(id => id != null);

        for (const fId of facultyIds) {
          const [allocCheck] = await connection.query(
            `SELECT 
              f.id,
              COALESCE(f.max_classrooms, 1) AS max_classrooms,
              COUNT(spv.id) AS current_allocation
             FROM faculty f
             LEFT JOIN seating_plan_venues spv ON spv.faculty_id = f.id
             WHERE f.id = ?
             GROUP BY f.id, f.max_classrooms`,
            [fId]
          );

          if (!allocCheck.length) {
            await connection.rollback();
            return res.status(400).json({
              error: "Faculty not found",
              details: `Faculty ID ${fId} does not exist`
            });
          }

          const { max_classrooms, current_allocation } = allocCheck[0];
          const remaining = max_classrooms - current_allocation;

          if (remaining <= 0) {
            await connection.rollback();
            return res.status(400).json({
              error: "Faculty unavailable",
              details: `Faculty ID ${fId} has reached allocation limit (${current_allocation}/${max_classrooms})`
            });
          }

          const [conflictCheck] = await connection.query(
            `SELECT 1
             FROM seating_plan_venues spv
             JOIN seating_plans sp ON spv.seating_plan_id = sp.id
             WHERE spv.faculty_id = ?
               AND sp.exam_date = ?
               AND NOT (sp.exam_end_time <= ? OR sp.exam_start_time >= ?)
             LIMIT 1`,
            [fId, dateOnly, examStartTime, examEndTime]
          );

          if (conflictCheck.length > 0) {
            await connection.rollback();
            return res.status(409).json({
              error: "Faculty time conflict",
              details: `Faculty ID ${fId} is already assigned during this time slot`
            });
          }
        }
      }

      const seatingPlanId = await SeatingPlan.createPlan({
        examDate: dateOnly,
        examSession,
        examType,
        examStartTime,
        examEndTime,
        selectedCourses,
        students,
        venuesUsed,
        facultyMode
      });

      for (const v of venuesUsed) {
        await Venue.addSession(v.venueId, dateOnly, examStartTime, examEndTime);
      }

      await connection.commit();

      res.status(201).json({
        message: "Seating plan created successfully",
        seatingPlanId,
        id: seatingPlanId,
        examDate: dateOnly,
        examType,
        venuesCount: venuesUsed.length,
        studentsCount: students?.length || 0
      });

    } catch (err) {
      await connection.rollback();
      console.error("SAVE PLAN ERROR:", err);
      res.status(500).json({
        error: "Failed to save seating plan",
        details: err.message
      });
    } finally {
      connection.release();
    }
  }
);

/* =====================================================
    DELETE: SEATING PLAN
    Roles: admin, faculty_incharge
===================================================== */
router.delete(
  "/delete-plan/:id",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  auditLogger("DELETE_SEATING_PLAN", "SeatingPlan"),
  async (req, res) => {
    const planId = req.params.id;
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const plan = await SeatingPlan.getPlanById(planId);
      if (!plan) {
        await connection.rollback();
        return res.status(404).json({ 
          error: "Seating plan not found" 
        });
      }

      const [venues] = await connection.query(
        `SELECT venue_id, faculty_id
         FROM seating_plan_venues
         WHERE seating_plan_id = ?`,
        [planId]
      );

      const [examDetails] = await connection.query(
        `SELECT exam_date, exam_start_time, exam_end_time, faculty_mode
         FROM seating_plans
         WHERE id = ?`,
        [planId]
      );

      if (examDetails.length > 0) {
        const { exam_date, exam_start_time, exam_end_time } = examDetails[0];

        for (const v of venues) {
          await Venue.removeSession(
            v.venue_id,
            exam_date,
            exam_start_time,
            exam_end_time
          );
        }
      }

      await SeatingPlan.deletePlan(planId);

      await connection.commit();

      res.status(200).json({
        message: "Seating plan deleted successfully",
        id: planId,
        deletedPlan: {
          examDate: plan.examDate,
          examType: plan.examType,
          examSession: plan.examSession,
          venuesCount: venues.length
        }
      });

    } catch (err) {
      await connection.rollback();
      console.error("DELETE SEATING PLAN ERROR:", err);
      res.status(500).json({
        error: "Failed to delete seating plan",
        details: err.message
      });
    } finally {
      connection.release();
    }
  }
);

/* =====================================================
    GET: ALL SEATING PLANS
    Roles: admin, faculty_incharge, coe
===================================================== */
router.get("/",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge', 'coe']),
  async (req, res) => {
    try {
      const plans = await SeatingPlan.getAllPlans();
      res.status(200).json(plans);
    } catch (err) {
      console.error("FETCH PLANS ERROR:", err);
      res.status(500).json({
        error: "Failed to fetch seating plans",
        message: err.message
      });
    }
  }
);

/* =====================================================
    ✅ GET ATTENDANCE SHEET DATA V2 - MOVED BEFORE /:id
    Roles: admin, faculty_incharge, coe
===================================================== */
router.get("/attendance", 
  sessionAuth, 
  checkRole(['admin', 'faculty_incharge', 'coe']),
  async (req, res) => {
    try {
        const { date, session, startTime, endTime, venue } = req.query;

        console.log("\n📋 ========== ATTENDANCE REQUEST ==========");
        console.log("Query params:", { date, session, startTime, endTime, venue });

        if (!date || !session || !startTime || !endTime || !venue) {
            return res.status(400).json({ 
              error: "Missing required parameters",
              received: { date, session, startTime, endTime, venue }
            });
        }

        const dateOnly = date.includes("T") ? date.split("T")[0] : date;
        console.log("🗓️  Normalized date:", dateOnly);

        // ✅ Step 1: Find ALL plans for this date and session
        const [plans] = await db.query(
            `SELECT id, exam_type, exam_date, exam_session, exam_start_time, exam_end_time 
             FROM seating_plans 
             WHERE exam_date = ? AND exam_session = ?`,
            [dateOnly, session]
        );

        console.log(`🔍 Found ${plans.length} plans for date=${dateOnly}, session=${session}`);
        
        if (plans.length > 0) {
            console.log("📊 Available plans:");
            plans.forEach(p => {
                console.log(`  - Plan ID ${p.id}: ${p.exam_start_time} to ${p.exam_end_time}`);
            });
        }

        if (plans.length === 0) {
            const [allPlans] = await db.query(
                `SELECT DISTINCT exam_date, exam_session 
                 FROM seating_plans 
                 ORDER BY exam_date DESC, exam_session`
            );
            
            console.log("❌ No plans found. Available dates/sessions in database:");
            allPlans.forEach(p => {
                console.log(`  - ${p.exam_date} / ${p.exam_session}`);
            });

            return res.status(404).json({ 
              error: "Seating plan not found",
              searchedFor: { date: dateOnly, session },
              availableDatesAndSessions: allPlans.map(p => ({
                  date: p.exam_date,
                  session: p.exam_session
              }))
            });
        }

        // ✅ Step 2: Find plan matching the time slot
        console.log(`🕐 Looking for time match: ${startTime} - ${endTime}`);
        
        const plan = plans.find(p => {
          const planStart = p.exam_start_time.substring(0, 5);
          const planEnd = p.exam_end_time.substring(0, 5);
          const reqStart = startTime.substring(0, 5);
          const reqEnd = endTime.substring(0, 5);
          
          console.log(`  Comparing: Plan(${planStart}-${planEnd}) vs Request(${reqStart}-${reqEnd})`);
          
          return planStart === reqStart && planEnd === reqEnd;
        });

        if (!plan) {
            console.log("❌ No time match found!");
            return res.status(404).json({ 
              error: "No matching time slot found",
              requestedTime: `${startTime} - ${endTime}`,
              availableTimes: plans.map(p => ({
                planId: p.id,
                start: p.exam_start_time,
                end: p.exam_end_time
              }))
            });
        }

        console.log(`✅ Matched plan ID: ${plan.id}`);

        // ✅ Step 3: Get selected courses for this plan
        const [planDetails] = await db.query(
            `SELECT selected_courses FROM seating_plans WHERE id = ?`,
            [plan.id]
        );

        let selectedCourses = [];
        if (planDetails.length > 0 && planDetails[0].selected_courses) {
            try {
                selectedCourses = typeof planDetails[0].selected_courses === 'string' 
                    ? JSON.parse(planDetails[0].selected_courses) 
                    : planDetails[0].selected_courses;
            } catch (e) {
                console.error("Error parsing selected_courses:", e);
            }
        }

        console.log(`📚 Selected courses for this plan:`, selectedCourses.map(c => c.courseDescription || c));

        // ✅ Step 4: Find the specific venue
        const [venues] = await db.query(
            `SELECT id, venue_name FROM seating_plan_venues 
             WHERE seating_plan_id = ?`,
            [plan.id]
        );

        console.log(`🏢 Found ${venues.length} venues for plan ${plan.id}:`);
        venues.forEach(v => console.log(`  - ${v.venue_name}`));

        const matchedVenue = venues.find(v => v.venue_name === venue);

        if (!matchedVenue) {
            console.log(`❌ Venue "${venue}" not found in plan`);
            return res.status(404).json({ 
              error: "Venue not found in plan",
              requestedVenue: venue,
              availableVenues: venues.map(v => v.venue_name)
            });
        }

        console.log(`✅ Matched venue: ${matchedVenue.venue_name} (ID: ${matchedVenue.id})`);
        
        const venueId = matchedVenue.id;

        // ✅ Step 5: Get students with course info from seating_plan_students (not master students table)
        const [studentList] = await db.query(
            `SELECT 
               sps.regn_no as regNo, 
               sps.student_name as name, 
               sps.course_description as courseCode
             FROM seating_plan_students sps
             WHERE sps.seating_plan_id = ?
             ORDER BY sps.course_description, sps.regn_no`,
            [plan.id]
        );

        console.log(`👥 Found ${studentList.length} students for this plan`);

        if (studentList.length === 0) {
            console.log("⚠️  Warning: No students found for this plan!");
        }

        // ✅ Step 6: Filter students who are seated in this specific venue
        const [seatedInVenue] = await db.query(
            `SELECT DISTINCT regn_no FROM seating_arrangements WHERE seating_plan_venue_id = ?`,
            [venueId]
        );

        const seatedRegNos = new Set(seatedInVenue.map(s => s.regn_no));
        const venueStudents = studentList.filter(s => seatedRegNos.has(s.regNo));

        console.log(`🪑 ${venueStudents.length} students are seated in venue ${venue}`);

        // ✅ Step 7: Create a map of courseCode -> courseName from selected courses
        const courseNameMap = {};
        selectedCourses.forEach(course => {
            const courseCode = course.courseDescription || course;
            const courseName = course.courseName || course.courseDescription || course;
            courseNameMap[courseCode] = courseName;
        });

        // ✅ Step 8: Group by SELECTED courses only
        const courseMap = {};
        venueStudents.forEach(s => {
            // Only include if this course is in selected courses
            const isSelected = selectedCourses.some(c => 
                (c.courseDescription || c) === s.courseCode
            );

            if (isSelected) {
                if (!courseMap[s.courseCode]) {
                    courseMap[s.courseCode] = { 
                        courseCode: s.courseCode, 
                        courseName: courseNameMap[s.courseCode] || s.courseCode,
                        students: [] 
                    };
                }
                courseMap[s.courseCode].students.push({ 
                  regNo: s.regNo, 
                  name: s.name 
                });
            }
        });

        console.log(`📋 Filtered to ${Object.keys(courseMap).length} selected courses`);

        const result = {
            examDate: plan.exam_date,
            examSession: plan.exam_session,
            hallNo: venue,
            courses: Object.values(courseMap)
        };

        console.log("✅ SUCCESS! Sending attendance data:");
        console.log(`  - ${result.courses.length} selected courses`);
        console.log(`  - ${venueStudents.length} total students in venue`);
        console.log("==========================================\n");

        res.json(result);

    } catch (err) {
        console.error("❌ Attendance API Error:", err);
        res.status(500).json({ 
          error: "Server error", 
          details: err.message,
          stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

/* =====================================================
    POST: CHECK FACULTY AVAILABILITY
    Roles: admin, faculty_incharge
===================================================== */
router.post("/check-faculty-availability",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  async (req, res) => {
    try {
      const { examDate, examSession, examStartTime, examEndTime, venueCount } = req.body;

      if (!examDate || !examStartTime || !examEndTime) {
        return res.status(400).json({
          error: "Missing required parameters",
          details: "examDate, examStartTime, and examEndTime are required"
        });
      }

      const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;

      const [allFaculty] = await db.query(
        `SELECT 
          f.id,
          f.name,
          f.department,
          COALESCE(f.max_classrooms, 1) AS max_classrooms,
          COUNT(spv.id) AS current_allocation
         FROM faculty f
         LEFT JOIN seating_plan_venues spv ON spv.faculty_id = f.id
         GROUP BY f.id, f.name, f.department, f.max_classrooms`
      );

      const facultyStatus = await Promise.all(
        allFaculty.map(async (f) => {
          const [conflicts] = await db.query(
            `SELECT 1
             FROM seating_plan_venues spv
             JOIN seating_plans sp ON spv.seating_plan_id = sp.id
             WHERE spv.faculty_id = ?
               AND sp.exam_date = ?
               AND NOT (sp.exam_end_time <= ? OR sp.exam_start_time >= ?)
             LIMIT 1`,
            [f.id, dateOnly, examStartTime, examEndTime]
          );

          const remaining = f.max_classrooms - f.current_allocation;

          return {
            id: f.id,
            name: f.name,
            department: f.department,
            canAllocate: remaining > 0,
            hasTimeConflict: conflicts.length > 0,
            allocationsRemaining: remaining,
            maxClassrooms: f.max_classrooms,
            currentAllocation: f.current_allocation
          };
        })
      );

      const availableFaculty = facultyStatus.filter(
        f => f.canAllocate && !f.hasTimeConflict
      );

      res.json({
        totalFaculty: allFaculty.length,
        availableFaculty: availableFaculty.length,
        requiredFaculty: venueCount || 0,
        sufficient: availableFaculty.length >= (venueCount || 0),
        facultyStatus
      });

    } catch (err) {
      console.error("CHECK AVAILABILITY ERROR:", err);
      res.status(500).json({
        error: "Failed to check availability",
        message: err.message
      });
    }
  }
);

/* =====================================================
    GET: SINGLE SEATING PLAN - NOW AFTER /attendance
    Roles: admin, faculty_incharge, coe
    ⚠️ IMPORTANT: This MUST come AFTER /attendance route!
===================================================== */
router.get("/:id",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge', 'coe']),
  async (req, res) => {
    try {
      const plan = await SeatingPlan.getPlanById(req.params.id);
      if (!plan) {
        return res.status(404).json({ error: "Seating plan not found" });
      }
      res.status(200).json(plan);
    } catch (err) {
      console.error("FETCH PLAN ERROR:", err);
      res.status(500).json({
        error: "Failed to fetch seating plan",
        message: err.message
      });
    }
  }
);

module.exports = router;