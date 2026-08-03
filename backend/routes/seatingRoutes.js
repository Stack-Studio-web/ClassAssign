// Class/backend/routes/seatingRoutes.js - FIXED ROUTE ORDER
const express = require("express");
const router = express.Router();
const SeatingPlan = require("../models/SeatingPlan");
const AttendanceService = require("../services/attendanceService");
const HallNotificationService = require("../services/hallNotificationService");
const Venue = require("../models/venue");
const Faculty = require("../models/Faculty");
const User = require("../models/User");
const db = require("../config/db");
const DependencyChecks = require("../utils/dependencyChecks");
const Api = require("../utils/apiResponse");
const { andClause, whereClause } = require("../utils/ownerFilter");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");
const { resolveEntity } = require("../middleware/resolvePublicId");
const { TABLE, getPublicUuid, resolveInternalId } = require("../utils/publicId");

const ownerOpts = (req) => ({ ownerUserId: req.user?.id, role: req.user?.role });

async function resolveVenuesUsedIds(venuesUsed) {
  const resolved = [];
  for (const v of venuesUsed || []) {
    const venueId = await resolveInternalId(TABLE.venues, v.venueId, {
      allowLegacyNumeric: true,
    });
    if (!venueId) {
      const err = new Error(`Unknown venue: ${v.venueId}`);
      err.statusCode = 404;
      throw err;
    }
    let facultyId = null;
    if (v.facultyId != null && v.facultyId !== "") {
      facultyId = await resolveInternalId(TABLE.faculty, v.facultyId, {
        allowLegacyNumeric: true,
      });
      if (!facultyId) {
        const err = new Error(`Unknown faculty: ${v.facultyId}`);
        err.statusCode = 404;
        throw err;
      }
    }
    resolved.push({ ...v, venueId, facultyId });
  }
  return resolved;
}

function normalizeTimeParam(value) {
  if (!value) return "";
  const match = String(value).trim().match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  return String(value).substring(0, 5);
}

function buildOwnerFilterForAttendance(user) {
  if (user?.role === "faculty") {
    // Invigilators don't own seating plans — lookup by date/session/time only.
    return { ownerSql: "", ownerParams: [], isFacultyInvigilator: true };
  }
  if (user?.role === "hod") {
    return { ownerSql: "", ownerParams: [], isFacultyInvigilator: false, isHod: true };
  }
  const clause = andClause(user?.role, user?.id);
  return {
    ownerSql: clause.sql,
    ownerParams: clause.params,
    isFacultyInvigilator: false,
    isHod: false,
  };
}

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

      const resolvedVenues = await resolveVenuesUsedIds(venuesUsed);

      const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;

      const venueCheckPromises = resolvedVenues.map(async (v) => {
        const isAvailable = await Venue.isAvailable(
          v.venueId,
          dateOnly,
          examStartTime,
          examEndTime,
          connection
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

      // Validate faculty allocation for BOTH AUTO and MANUAL modes
      const facultyIds = resolvedVenues
        .map(v => v.facultyId)
        .filter(id => id != null);

      for (const fId of facultyIds) {
          const [allocCheck] = await connection.query(
            `SELECT 
              f.id,
              COALESCE(f.max_classrooms, 1) AS max_classrooms,
              COALESCE((
                SELECT COUNT(spv.id)
                FROM seating_plan_venues spv
                JOIN seating_plans sp ON sp.id = spv.seating_plan_id
                WHERE spv.faculty_id = f.id
                  AND sp.exam_date = ?
                  AND NOT (sp.exam_end_time <= ? OR sp.exam_start_time >= ?)
              ), 0) AS current_allocation
             FROM faculty f
             WHERE f.id = ?
             GROUP BY f.id, f.max_classrooms`,
            [dateOnly, examStartTime, examEndTime, fId]
          );

          if (!allocCheck.length) {
            await connection.rollback();
            return res.status(400).json({
              error: "Faculty not found",
              details: `Faculty ID ${fId} does not exist`
            });
          }

          const r = allocCheck[0];
          const maxClassrooms = Number(r.max_classrooms ?? r.maxclassrooms ?? 1) || 1;
          const currentAlloc = Number(r.current_allocation ?? r.currentallocation ?? 0) || 0;
          const remaining = maxClassrooms - currentAlloc;

          if (remaining <= 0) {
            await connection.rollback();
            return res.status(400).json({
              error: "Faculty unavailable",
              details: `Faculty ID ${fId} has reached allocation limit (${currentAlloc}/${maxClassrooms})`
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

      const seatingPlanId = await SeatingPlan.createPlan({
        examDate: dateOnly,
        examSession,
        examType,
        examStartTime,
        examEndTime,
        selectedCourses,
        students,
        venuesUsed: resolvedVenues,
        facultyMode
      }, ownerOpts(req), connection);

      const attendanceSync = await AttendanceService.syncAssignmentsFromSeatingPlan(seatingPlanId, connection);

      for (const v of resolvedVenues) {
        await Venue.addSession(v.venueId, dateOnly, examStartTime, examEndTime, connection);
      }

      await connection.commit();

      const uuid = await getPublicUuid(TABLE.seatingPlans, seatingPlanId);

      let notificationSchedule = { scheduled: 0, skipped: 0 };
      try {
        notificationSchedule = await HallNotificationService.scheduleForSeatingPlan(seatingPlanId);
        await HallNotificationService.processDueNotifications();
      } catch (schedErr) {
        console.error("Hall notification schedule error:", schedErr.message);
      }

      res.status(201).json({
        message: "Seating plan created successfully",
        uuid,
        examDate: dateOnly,
        examType,
        venuesCount: resolvedVenues.length,
        studentsCount: students?.length || 0,
        attendanceAssignmentsSynced: attendanceSync.synced,
        notificationsScheduled: notificationSchedule.scheduled,
        notificationsSkipped: notificationSchedule.skipped,
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
    Roles: admin, faculty_incharge, hod (hod: only plans owned by self or their faculty incharge)
===================================================== */
router.delete(
  "/delete-plan/:uuid",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge', 'hod']),
  resolveEntity(TABLE.seatingPlans),
  auditLogger("DELETE_SEATING_PLAN", "SeatingPlan"),
  async (req, res) => {
    const planId = req.internalId;
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const blockers = await DependencyChecks.seatingPlanDeleteBlockers(planId);
      if (blockers.blocked) {
        await connection.rollback();
        return Api.conflict(res, blockers.code, blockers.message, blockers.details);
      }
      if (blockers.notFound) {
        await connection.rollback();
        return Api.notFound(res, "Seating plan not found");
      }

      let opts = ownerOpts(req);
      if (req.user?.role === "hod") {
        const hodAllowedOwnerIds = await User.getOwnerIdsForHod(req.user.id);
        opts = { ...opts, hodAllowedOwnerIds };
      }
      const plan = await SeatingPlan.getPlanById(planId, opts);
      if (!plan) {
        await connection.rollback();
        return Api.notFound(res, "Seating plan not found");
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
        const r = examDetails[0];
        const examDate = r.exam_date ?? r.examdate;
        const examStartTime = r.exam_start_time ?? r.examstarttime;
        const examEndTime = r.exam_end_time ?? r.examendtime;

        for (const v of venues || []) {
          const venueId = v.venue_id ?? v.venueid;
          if (venueId != null) {
            await Venue.removeSession(venueId, examDate, examStartTime, examEndTime);
          }
        }
      }

      const cleanup = await AttendanceService.removeAssignmentsForSeatingPlan(planId, connection);

      await SeatingPlan.deletePlan(planId, opts, connection);

      await connection.commit();

      return Api.success(res, "Seating plan deleted successfully", {
        uuid: req.publicUuid,
        attendanceRecordsRemoved: cleanup.attendanceRemoved ?? 0,
        facultyAssignmentsRemoved: cleanup.removed ?? 0,
        deletedPlan: {
          examDate: plan.examDate,
          examType: plan.examType,
          examSession: plan.examSession,
          venuesCount: venues.length,
        },
      });

    } catch (err) {
      await connection.rollback();
      console.error("DELETE SEATING PLAN ERROR:", err);
      return Api.serverError(res, err, "DELETE seating plan");
    } finally {
      connection.release();
    }
  }
);

/* =====================================================
    GET: ALL SEATING PLANS
    Roles: admin, faculty_incharge, hod (hod sees plans owned by self or their faculty incharge)
===================================================== */
router.get("/",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge', 'hod']),
  async (req, res) => {
    try {
      let opts = ownerOpts(req);
      if (req.user?.role === "hod") {
        const hodAllowedOwnerIds = await User.getOwnerIdsForHod(req.user.id);
        opts = { ...opts, hodAllowedOwnerIds };
      }
      const status = String(req.query.status || "all").toLowerCase();
      if (["active", "completed", "all"].includes(status)) {
        opts.status = status;
      }
      const plans = await SeatingPlan.getAllPlans(opts);
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
    POST: MARK SELECTED REPORTS AS COMPLETED
    Roles: admin, faculty_incharge
===================================================== */
router.post(
  "/mark-completed",
  sessionAuth,
  checkRole(["admin", "faculty_incharge"]),
  async (req, res) => {
    try {
      const uuids = Array.isArray(req.body?.uuids) ? req.body.uuids : [];
      if (uuids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Select at least one seating plan to mark as completed.",
        });
      }

      const internalIds = [];
      for (const uuid of uuids) {
        const id = await resolveInternalId(TABLE.seatingPlans, uuid, {
          allowLegacyNumeric: true,
        });
        if (id) internalIds.push(id);
      }

      if (internalIds.length === 0) {
        return Api.notFound(res, "No matching seating plans found.");
      }

      const updated = await SeatingPlan.markCompletedByIds(internalIds, ownerOpts(req));
      return Api.success(res, `Marked ${updated} report(s) as completed.`, {
        updated,
        requested: uuids.length,
      });
    } catch (err) {
      console.error("MARK COMPLETED ERROR:", err);
      return Api.fromError(res, err, "Failed to mark reports as completed.");
    }
  }
);

/* =====================================================
    ✅ GET ATTENDANCE SHEET DATA V4 - FIXED WITH TIMETABLE JOIN
    Roles: admin, faculty_incharge, hod (hod sees own department plans only)
===================================================== */
router.get("/attendance", 
  sessionAuth, 
  checkRole(['admin', 'faculty_incharge', 'hod', 'faculty']),
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
        const reqStart = normalizeTimeParam(startTime);
        const reqEnd = normalizeTimeParam(endTime);
        console.log("🗓️  Normalized date:", dateOnly);

        const ownerFilter = buildOwnerFilterForAttendance(req.user);
        let ownerSql = ownerFilter.ownerSql;
        let ownerParams = ownerFilter.ownerParams;

        if (ownerFilter.isHod) {
          const hodAllowedOwnerIds = await User.getOwnerIdsForHod(req.user.id);
          if (hodAllowedOwnerIds.length > 0) {
            const placeholders = hodAllowedOwnerIds.map(() => "?").join(",");
            ownerSql = ` AND owner_user_id IN (${placeholders})`;
            ownerParams = hodAllowedOwnerIds;
          }
        }

        const [plans] = await db.query(
            `SELECT id, exam_type, exam_date, exam_session, exam_start_time, exam_end_time 
             FROM seating_plans 
             WHERE exam_date = ? AND exam_session = ?${ownerSql}`,
            [dateOnly, session, ...ownerParams]
        );

        console.log(`🔍 Found ${plans.length} plans for date=${dateOnly}, session=${session}`);
        
        if (plans.length > 0) {
            console.log("📊 Available plans:");
            plans.forEach(p => {
                console.log(`  - Plan ID ${p.id}: ${p.exam_start_time} to ${p.exam_end_time}`);
            });
        }

        if (plans.length === 0) {
            let fallbackWhere = "";
            let fallbackParams = [];
            if (ownerFilter.isHod) {
              const hodAllowedOwnerIds = await User.getOwnerIdsForHod(req.user.id);
              if (hodAllowedOwnerIds.length > 0) {
                const placeholders = hodAllowedOwnerIds.map(() => "?").join(",");
                fallbackWhere = ` WHERE owner_user_id IN (${placeholders})`;
                fallbackParams = hodAllowedOwnerIds;
              }
            } else if (!ownerFilter.isFacultyInvigilator) {
              const clause = whereClause(req.user?.role, req.user?.id);
              fallbackWhere = clause.sql;
              fallbackParams = clause.params;
            }
            const [allPlans] = await db.query(
                `SELECT DISTINCT exam_date, exam_session 
                 FROM seating_plans${fallbackWhere || " WHERE 1=1"}
                 ORDER BY exam_date DESC, exam_session`,
                fallbackParams
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
        console.log(`🕐 Looking for time match: ${reqStart} - ${reqEnd}`);
        
        const plan = plans.find(p => {
          const planStart = normalizeTimeParam(p.exam_start_time ?? p.examstarttime ?? "");
          const planEnd = normalizeTimeParam(p.exam_end_time ?? p.examendtime ?? "");
          
          console.log(`  Comparing: Plan(${planStart}-${planEnd}) vs Request(${reqStart}-${reqEnd})`);
          
          return planStart === reqStart && planEnd === reqEnd;
        });

        if (!plan) {
            console.log("❌ No time match found!");
            return res.status(404).json({ 
              error: "No matching time slot found",
              requestedTime: `${reqStart} - ${reqEnd}`,
              availableTimes: plans.map(p => ({
                planId: p.id,
                start: p.exam_start_time,
                end: p.exam_end_time
              }))
            });
        }

        const planId = plan.id ?? plan._id;
        console.log(`✅ Matched plan ID: ${planId}`);

        // ✅ Step 3: Get selected courses for this plan
        const [planDetails] = await db.query(
            `SELECT selected_courses FROM seating_plans WHERE id = ?`,
            [planId]
        );

        let selectedCourses = [];
        const scRaw = planDetails?.[0]?.selected_courses ?? planDetails?.[0]?.selectedcourses;
        if (scRaw) {
            try {
                selectedCourses = typeof scRaw === 'string' ? JSON.parse(scRaw) : scRaw;
            } catch (e) {
                console.error("Error parsing selected_courses:", e);
            }
        }
        // Normalize: selectedCourses can be ["CS101"] or [{courseCode:"CS101"}] 
        const selectedCourseCodes = new Set(
            (selectedCourses || []).flatMap(c => 
                typeof c === 'string' ? [c] : [c?.courseCode ?? c?.courseDescription ?? c].filter(Boolean)
            )
        );
        console.log(`📚 Selected courses for this plan:`, [...selectedCourseCodes]);

        // ✅ Step 4: Find the specific venue
        const [venues] = await db.query(
            `SELECT id, venue_name FROM seating_plan_venues 
             WHERE seating_plan_id = ?`,
            [planId]
        );

        console.log(`🏢 Found ${(venues || []).length} venues for plan ${planId}:`);
        (venues || []).forEach(v => console.log(`  - ${v.venue_name ?? v.venuename}`));

        const matchedVenue = (venues || []).find(v => (v.venue_name ?? v.venuename) === venue);

        if (!matchedVenue) {
            console.log(`❌ Venue "${venue}" not found in plan`);
            return res.status(404).json({ 
              error: "Venue not found in plan",
              requestedVenue: venue,
              availableVenues: (venues || []).map(v => v.venue_name ?? v.venuename ?? "")
            });
        }

        console.log(`✅ Matched venue: ${matchedVenue.venue_name ?? matchedVenue.venuename} (ID: ${matchedVenue.id})`);

        if (ownerFilter.isFacultyInvigilator) {
          const facultyProfile = await AttendanceService.findFacultyByUserEmail(req.user.email);
          if (!facultyProfile) {
            return res.status(403).json({
              error: "No faculty profile linked to your account",
            });
          }

          const [spvRows] = await db.query(
            `SELECT faculty_id FROM seating_plan_venues WHERE id = ?`,
            [matchedVenue.id]
          );
          const assignedFacultyId = spvRows[0]?.faculty_id ?? spvRows[0]?.facultyid;
          if (Number(assignedFacultyId) !== Number(facultyProfile.id)) {
            return res.status(403).json({
              error: "You are not assigned as invigilator for this hall",
            });
          }
        }
        
        const venueId = matchedVenue.id;

        // ✅ Step 5+6: Single query - get students directly from seating_arrangements for this venue
        // JOIN with seating_plan_students (same plan) - avoids dual-query regn_no matching issues
        const [venueStudentsRaw] = await db.query(
            `SELECT DISTINCT
               sps.regn_no, 
               sps.student_name, 
               sps.course_description,
               COALESCE(t.course_name, sps.course_description) as course_name
             FROM seating_arrangements sa
             INNER JOIN seating_plan_students sps 
               ON sps.seating_plan_id = ? AND sps.regn_no = sa.regn_no
             LEFT JOIN timetable t ON t.course_code = sps.course_description
             WHERE sa.seating_plan_venue_id = ?
             ORDER BY sps.course_description, sps.regn_no`,
            [planId, venueId]
        );

        // Normalize to camelCase (PostgreSQL returns lowercase)
        const venueStudents = (venueStudentsRaw || []).map(r => ({
            regNo: r.regn_no ?? r.regnno ?? "",
            name: r.student_name ?? r.studentname ?? "",
            courseCode: r.course_description ?? r.coursedescription ?? "",
            courseName: r.course_name ?? r.coursename ?? ""
        }));

        console.log(`🪑 Found ${venueStudents.length} students seated in venue ${venue}`);

        // ✅ Step 7: Create a map of courseCode -> courseName from actual student data
        const courseNameMap = {};
        venueStudents.forEach(s => {
            const cc = s.courseCode ?? s.coursecode;
            const cn = s.courseName ?? s.coursename;
            if (cc && cn) courseNameMap[cc] = cn;
        });

        // Fallback to selectedCourses if courseName not in student records
        selectedCourseCodes.forEach(cc => {
            if (!courseNameMap[cc]) courseNameMap[cc] = cc;
        });

        console.log("📚 Course name mapping:", courseNameMap);

        // ✅ Step 8: Group by courses (use selectedCourseCodes if non-empty, else ALL venue students)
        const courseMap = {};
        venueStudents.forEach(s => {
            const courseCode = (s.courseCode ?? s.coursecode ?? "").trim();
            const regNo = String(s.regNo ?? s.regnno ?? s.regn_no ?? "").trim();
            const name = (s.name ?? s.student_name ?? "").trim();
            if (!courseCode || !regNo) return;

            // Include if: selectedCourseCodes is empty (show all) OR course is in selected
            const isSelected = selectedCourseCodes.size === 0 || 
                selectedCourseCodes.has(courseCode) ||
                [...selectedCourseCodes].some(cc => String(cc || "").trim().toUpperCase() === courseCode.toUpperCase());

            if (isSelected) {
                if (!courseMap[courseCode]) {
                    courseMap[courseCode] = { 
                        courseCode, 
                        courseName: courseNameMap[courseCode] || courseCode,
                        students: [],
                        studentRegNos: new Set()
                    };
                }
                if (!courseMap[courseCode].studentRegNos.has(regNo)) {
                    courseMap[courseCode].students.push({ regNo, name });
                    courseMap[courseCode].studentRegNos.add(regNo);
                }
            }
        });

        console.log(`📋 Filtered to ${Object.keys(courseMap).length} selected courses`);

        // ✅ Remove the studentRegNos Set before sending to client
        const result = {
            examDate: plan.exam_date,
            examSession: plan.exam_session,
            hallNo: venue,
            courses: Object.values(courseMap).map(course => ({
                courseCode: course.courseCode,
                courseName: course.courseName,
                students: course.students
            }))
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
          f.public_uuid,
          f.name,
          f.department,
          COALESCE(f.max_classrooms, 1) AS max_classrooms,
          COALESCE(f.is_available, true) AS is_available,
          (SELECT COUNT(*) FROM seating_plan_venues spv WHERE spv.faculty_id = f.id) AS current_allocation
         FROM faculty f`
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

          const maxClassrooms = Number(f.max_classrooms ?? f.maxclassrooms ?? 1) || 1;
          const currentAlloc = Number(f.current_allocation ?? f.currentallocation ?? 0) || 0;
          const remaining = maxClassrooms - currentAlloc;
          const facultyMarkedAvailable =
            f.is_available !== false && f.isavailable !== false;

          return {
            uuid: f.public_uuid,
            name: f.name,
            department: f.department,
            canAllocate: remaining > 0 && facultyMarkedAvailable,
            hasTimeConflict: conflicts.length > 0,
            allocationsRemaining: remaining,
            maxClassrooms,
            currentAllocation: currentAlloc
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
    Roles: admin, faculty_incharge
    ⚠️ IMPORTANT: This MUST come AFTER /attendance route!
===================================================== */
router.get("/:uuid",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  resolveEntity(TABLE.seatingPlans, { allowLegacyNumeric: true }),
  async (req, res) => {
    try {
      const plan = await SeatingPlan.getPlanById(req.internalId, ownerOpts(req));
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