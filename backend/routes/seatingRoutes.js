// Class/backend/routes/seatingRoutes.js - WITH ROLE-BASED ACCESS & AUDIT LOGGING
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
    ✅ WITH AUDIT LOGGING
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

      // Validation
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

      // Check venue availability
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

      // ✅ FIXED: Check faculty availability if manual mode
      if (facultyMode === "MANUAL") {
        const facultyIds = venuesUsed
          .map(v => v.facultyId)
          .filter(id => id != null);

        for (const fId of facultyIds) {
          // ✅ Use correct column structure
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

      // Create seating plan
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

      // Book venues (add sessions)
      for (const v of venuesUsed) {
        await Venue.addSession(v.venueId, dateOnly, examStartTime, examEndTime);
      }

      await connection.commit();

      res.status(201).json({
        message: "Seating plan created successfully",
        seatingPlanId,
        id: seatingPlanId, // ✅ CRITICAL: For audit logger to capture entity ID
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
    ✅ WITH AUDIT LOGGING
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

      // Get plan details before deletion (for audit log)
      const plan = await SeatingPlan.getPlanById(planId);
      if (!plan) {
        await connection.rollback();
        return res.status(404).json({ 
          error: "Seating plan not found" 
        });
      }

      // Get venue details for releasing sessions
      const [venues] = await connection.query(
        `SELECT venue_id, faculty_id
         FROM seating_plan_venues
         WHERE seating_plan_id = ?`,
        [planId]
      );

      // Get exam details for releasing venue sessions
      const [examDetails] = await connection.query(
        `SELECT exam_date, exam_start_time, exam_end_time, faculty_mode
         FROM seating_plans
         WHERE id = ?`,
        [planId]
      );

      if (examDetails.length > 0) {
        const { exam_date, exam_start_time, exam_end_time } = examDetails[0];

        // Release venue sessions
        for (const v of venues) {
          await Venue.removeSession(
            v.venue_id,
            exam_date,
            exam_start_time,
            exam_end_time
          );
        }
      }

      // Delete the seating plan (cascade delete handled by foreign keys or model)
      await SeatingPlan.deletePlan(planId);

      await connection.commit();

      res.status(200).json({
        message: "Seating plan deleted successfully",
        id: planId, // ✅ CRITICAL: For audit logger
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
    (NO AUDIT LOG - READ ONLY)
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
    GET: SINGLE SEATING PLAN
    Roles: admin, faculty_incharge, coe
    (NO AUDIT LOG - READ ONLY)
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

/* =====================================================
    POST: CHECK FACULTY AVAILABILITY
    Roles: admin, faculty_incharge
    (NO AUDIT LOG - HELPER ENDPOINT)
    ✅ FIXED: Use correct database schema
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

      // ✅ FIXED: Get all faculty with current allocation count (matching Faculty model)
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

      // Check time conflicts for each faculty
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

module.exports = router;