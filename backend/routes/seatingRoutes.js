// Class/backend/routes/seatingRoutes.js - FIXED ROUTE ORDER
const express = require("express");
const { resolveOwnerOpts } = require("../utils/rbac");
const router = express.Router();
const SeatingPlan = require("../models/SeatingPlan");
const AttendanceService = require("../services/attendanceService");
const HallNotificationService = require("../services/hallNotificationService");
const Venue = require("../models/venue");
const Faculty = require("../models/Faculty");
const db = require("../config/db");
const DependencyChecks = require("../utils/dependencyChecks");
const Api = require("../utils/apiResponse");
const { andClause, whereClause } = require("../utils/ownerFilter");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");
const { resolveEntity } = require("../middleware/resolvePublicId");
const { TABLE, getPublicUuid, resolveInternalId } = require("../utils/publicId");
const { ACTIVE_ALLOCATION_SQL } = require("../utils/facultyAllocationStatus");
const { resolveOccupancyWindow } = require("../utils/facultyTimeConflict");

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

    const rawIds = Array.isArray(v.facultyIds)
      ? v.facultyIds
      : v.facultyId != null && v.facultyId !== ""
        ? [v.facultyId]
        : [];

    const facultyIds = [];
    for (const rawFacultyId of rawIds) {
      if (rawFacultyId == null || rawFacultyId === "") continue;
      const facultyId = await resolveInternalId(TABLE.faculty, rawFacultyId, {
        allowLegacyNumeric: true,
      });
      if (!facultyId) {
        const err = new Error(`Unknown faculty: ${rawFacultyId}`);
        err.statusCode = 404;
        throw err;
      }
      if (!facultyIds.includes(facultyId)) {
        facultyIds.push(facultyId);
      }
    }

    resolved.push({
      ...v,
      venueId,
      facultyId: facultyIds[0] ?? null,
      facultyIds,
    });
  }
  return resolved;
}

function collectFacultySlotsFromVenues(resolvedVenues) {
  const slotsByFaculty = new Map();
  const venuesByFaculty = new Map();

  for (const venue of resolvedVenues || []) {
    const ids =
      venue.facultyIds?.length > 0
        ? venue.facultyIds
        : venue.facultyId != null
          ? [venue.facultyId]
          : [];

    for (const fId of ids) {
      slotsByFaculty.set(fId, (slotsByFaculty.get(fId) || 0) + 1);
      if (!venuesByFaculty.has(fId)) venuesByFaculty.set(fId, new Set());
      venuesByFaculty.get(fId).add(venue.venueId);
    }
  }

  return { slotsByFaculty, venuesByFaculty };
}

function normalizeTimeParam(value) {
  if (!value) return "";
  const match = String(value).trim().match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  return String(value).substring(0, 5);
}

async function buildOwnerFilterForAttendance(req) {
  const user = req.user;
  if (user?.role === "faculty") {
    // Invigilators don't own seating plans — lookup by date/session/time only.
    return { ownerSql: "", ownerParams: [], isFacultyInvigilator: true };
  }
  const opts = await resolveOwnerOpts(req);
  const clause = andClause(opts.role, opts.ownerUserId, "", opts.ownerIds);
  return {
    ownerSql: clause.sql,
    ownerParams: clause.params,
    isFacultyInvigilator: false,
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

      // Atomic venue eligibility + time-slot conflict check (FOR UPDATE per venue)
      const unavailableVenues = [];
      for (const v of resolvedVenues) {
        const check = await Venue.checkAllotmentSlot(
          v.venueId,
          dateOnly,
          examStartTime,
          examEndTime,
          connection,
          { lock: true }
        );
        if (!check.ok) {
          unavailableVenues.push({
            venueId: v.venueId,
            venueName: v.venueName || check.venueName,
            available: false,
            status: check.status,
            message: check.message,
            conflicts: check.conflicts,
          });
        }
      }

      if (unavailableVenues.length > 0) {
        await connection.rollback();
        const first = unavailableVenues[0];
        const isOccupied = first.status === "OCCUPIED";
        return res.status(409).json({
          error: isOccupied ? "Venue conflict" : "Venue not available",
          details:
            first.message ||
            `The following venues are not available: ${unavailableVenues
              .map((x) => x.venueName)
              .join(", ")}`,
          message:
            isOccupied
              ? `${first.venueName} is no longer available for the selected time period.`
              : first.message,
          unavailableVenues,
        });
      }

      // Validate faculty allocation for BOTH AUTO and MANUAL modes.
      const { slotsByFaculty, venuesByFaculty } =
        collectFacultySlotsFromVenues(resolvedVenues);

      if (String(facultyMode || "").toUpperCase() === "MANUAL") {
        const missingFaculty = resolvedVenues.filter((venue) => {
          const ids =
            venue.facultyIds?.length > 0
              ? venue.facultyIds
              : venue.facultyId
                ? [venue.facultyId]
                : [];
          return ids.length === 0;
        });
        if (missingFaculty.length > 0) {
          await connection.rollback();
          return res.status(400).json({
            error: "Faculty required",
            details: "Assign at least one faculty member to each room.",
            message: "Assign at least one faculty member to each room.",
          });
        }
      }

      for (const [, venueSet] of venuesByFaculty.entries()) {
        if (venueSet.size > 1) {
          await connection.rollback();
          return res.status(400).json({
            error: "Duplicate faculty allocation",
            details:
              "The same faculty cannot be assigned to more than one venue on the same seating plan.",
            message:
              "The same faculty cannot be assigned to more than one venue on the same seating plan.",
          });
        }
      }

      for (const [fId, slotsOnThisPlan] of slotsByFaculty.entries()) {
        const validation = await Faculty.validateFacultyForAllocation(
          fId,
          {
            examDate: dateOnly,
            examStartTime,
            examEndTime,
            additionalSlots: slotsOnThisPlan,
          },
          connection
        );

        if (!validation.allowed) {
          await connection.rollback();
          const statusCode =
            validation.code === "TIME_CONFLICT" ? 409 : 400;
          return res.status(statusCode).json({
            error:
              validation.code === "TIME_CONFLICT"
                ? "Faculty time conflict"
                : validation.code === "CAPACITY"
                  ? "Faculty allocation limit reached"
                  : "Faculty unavailable",
            details: validation.message,
            message: validation.message,
            code: validation.code,
            conflict: validation.conflict || null,
            currentAllocation: validation.currentAllocation,
            maxClassrooms: validation.maxClassrooms,
            remaining: validation.remaining,
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
      }, await resolveOwnerOpts(req), connection);

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

      let opts = await resolveOwnerOpts(req);
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
      let opts = await resolveOwnerOpts(req);
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

      const updated = await SeatingPlan.markCompletedByIds(internalIds, await resolveOwnerOpts(req));

      // Recalculate affected faculty counts from allocation status (idempotent).
      const planPlaceholders = internalIds.map(() => "?").join(", ");
      const [facultyRows] = await db.query(
        `SELECT DISTINCT faculty_id
         FROM seating_plan_venues
         WHERE seating_plan_id IN (${planPlaceholders})
           AND faculty_id IS NOT NULL`,
        internalIds
      );
      const facultyIds = (facultyRows || [])
        .map((r) => r.faculty_id ?? r.facultyid)
        .filter((id) => id != null);
      const facultySummaries = await Faculty.getAllocationSummariesByIds(facultyIds);

      return Api.success(res, `Marked ${updated} report(s) as completed.`, {
        updated,
        requested: uuids.length,
        facultySummaries,
      });
    } catch (err) {
      console.error("MARK COMPLETED ERROR:", err);
      return Api.fromError(res, err, "Failed to mark reports as completed.");
    }
  }
);

/* =====================================================
    ✅ GET ATTENDANCE SHEET DATA — single venue
    Roles: admin, faculty_incharge, hod, faculty
===================================================== */
router.get("/attendance", 
  sessionAuth, 
  checkRole(['admin', 'faculty_incharge', 'hod', 'faculty']),
  async (req, res) => {
    try {
        const { date, session, startTime, endTime, venue, examType } = req.query;

        console.log("\n📋 ========== ATTENDANCE REQUEST ==========");
        console.log("Query params:", { date, session, startTime, endTime, venue, examType });

        if (!date || !session || !startTime || !endTime || !venue) {
            return res.status(400).json({ 
              error: "Missing required parameters",
              received: { date, session, startTime, endTime, venue }
            });
        }

        const {
          findAttendancePlan,
          buildAttendanceSheetForVenue,
        } = require("../utils/buildAttendanceSheet");

        const ownerFilter = await buildOwnerFilterForAttendance(req);
        const found = await findAttendancePlan({
          date,
          session,
          startTime,
          endTime,
          examType: examType || null,
          ownerSql: ownerFilter.ownerSql,
          ownerParams: ownerFilter.ownerParams,
        });

        if (found.error) {
          return res.status(found.statusCode || 404).json(found.payload);
        }

        const { plan, planId, venues } = found;
        const matchedVenue = (venues || []).find(
          (v) => (v.venue_name ?? v.venuename) === venue
        );

        if (!matchedVenue) {
            return res.status(404).json({ 
              error: "Venue not found in plan",
              requestedVenue: venue,
              availableVenues: (venues || []).map(v => v.venue_name ?? v.venuename ?? "")
            });
        }

        if (ownerFilter.isFacultyInvigilator) {
          const facultyProfile = await AttendanceService.findFacultyByUserEmail(req.user.email);
          if (!facultyProfile) {
            return res.status(403).json({
              error: "No faculty profile linked to your account",
            });
          }

          const [spvRows] = await db.query(
            `SELECT spv.id, spv.faculty_id
             FROM seating_plan_venues spv
             WHERE spv.id = ?`,
            [matchedVenue.id]
          );
          const spvRow = spvRows[0];
          const [assignedFacultyRows] = await db.query(
            `SELECT faculty_id FROM seating_plan_venue_faculty
             WHERE seating_plan_venue_id = ?
             ORDER BY display_order, id`,
            [matchedVenue.id]
          );
          const assignedFacultyIds = (assignedFacultyRows || [])
            .map((r) => Number(r.faculty_id ?? r.facultyid))
            .filter((id) => id > 0);
          if (assignedFacultyIds.length === 0 && spvRow) {
            const legacyId = Number(spvRow.faculty_id ?? spvRow.facultyid);
            if (legacyId > 0) assignedFacultyIds.push(legacyId);
          }
          if (!assignedFacultyIds.includes(Number(facultyProfile.id))) {
            return res.status(403).json({
              error: "You are not assigned as invigilator for this hall",
            });
          }
        }

        const result = await buildAttendanceSheetForVenue({
          plan,
          planId,
          venueName: venue,
          venueRow: matchedVenue,
        });

        // Preserve existing single-venue response shape
        res.json({
          examDate: result.examDate,
          examSession: result.examSession,
          hallNo: result.hallNo,
          courses: result.courses,
        });

    } catch (err) {
        console.error("❌ Attendance API Error:", err);
        res.status(err.statusCode || 500).json({ 
          error: err.message || "Server error", 
          details: err.message
        });
    }
});

/* =====================================================
    GET ATTENDANCE SHEETS FOR ALL VENUES ON AN EXAM SLOT
    Reuses the same per-venue builder as GET /attendance.
===================================================== */
router.get(
  "/attendance/bulk",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const { date, session, startTime, endTime, examType } = req.query;
      if (!date || !session || !startTime || !endTime) {
        return res.status(400).json({
          error: "Missing required parameters",
          details: "date, session, startTime, and endTime are required",
        });
      }

      const { buildAttendanceSheetsForSlot } = require("../utils/buildAttendanceSheet");
      const ownerFilter = await buildOwnerFilterForAttendance(req);
      const result = await buildAttendanceSheetsForSlot({
        date,
        session,
        startTime,
        endTime,
        examType: examType || null,
        ownerSql: ownerFilter.ownerSql,
        ownerParams: ownerFilter.ownerParams,
      });

      if (result.error) {
        return res.status(result.statusCode || 404).json(result.payload);
      }

      if (!result.sheets.length) {
        return res.status(404).json({
          error:
            result.failures?.[0]?.error ||
            "No venues with assigned students found for this allotment.",
          failures: result.failures || [],
        });
      }

      return res.json({
        examDate: result.examDate,
        examSession: result.examSession,
        examType: result.examType,
        startTime: result.startTime,
        endTime: result.endTime,
        venueCount: result.sheets.length,
        studentTotal: result.studentTotal,
        sheets: result.sheets.map((s) => ({
          examDate: s.examDate,
          examSession: s.examSession,
          examType: s.examType,
          hallNo: s.hallNo,
          courses: s.courses,
          studentCount: s.studentCount,
        })),
        failures: result.failures || [],
      });
    } catch (err) {
      console.error("ATTENDANCE BULK ERROR:", err);
      return res.status(500).json({
        error: "Failed to load attendance sheets",
        details: err.message,
      });
    }
  }
);

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
      const occupancy = await resolveOccupancyWindow(db, {
        examDate: dateOnly,
        examStartTime,
        examEndTime,
      });

      // Active faculty only — soft-deleted faculty stay in DB for history but cannot be assigned.
      const [allFaculty] = await db.query(
        `SELECT 
          f.id,
          f.public_uuid,
          f.name,
          f.department,
          COALESCE(f.max_classrooms, 1) AS max_classrooms,
          COALESCE(f.is_available, true) AS is_available,
          (
            SELECT COUNT(spvf.id)
            FROM seating_plan_venue_faculty spvf
            JOIN seating_plan_venues spv ON spv.id = spvf.seating_plan_venue_id
            JOIN seating_plans sp ON sp.id = spv.seating_plan_id
            WHERE spvf.faculty_id = f.id
              AND (${ACTIVE_ALLOCATION_SQL})
          ) AS current_allocation
         FROM faculty f
         WHERE COALESCE(f.is_active, TRUE) = TRUE`
      );

      const facultyStatus = await Promise.all(
        allFaculty.map(async (f) => {
          const conflict = await Faculty.findActiveTimeConflict({
            facultyId: f.id,
            examDate: dateOnly,
            examStartTime,
            examEndTime,
          });

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
            hasTimeConflict: !!conflict,
            conflictInfo: conflict,
            conflictMessage: conflict?.message || null,
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
        occupancyEndTime: occupancy.occupancyEndTime,
        examStartTime: occupancy.examStartTime,
        examEndTime: occupancy.examEndTime,
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
      const plan = await SeatingPlan.getPlanById(req.internalId, await resolveOwnerOpts(req));
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