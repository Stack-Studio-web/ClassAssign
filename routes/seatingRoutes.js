//seatingRoutes.js
const express = require("express");
const router = express.Router();
const SeatingPlan = require("../models/SeatingPlan");
const Venue = require("../models/venue");
const Faculty = require("../models/Faculty");
const db = require("../config/db");

/* =====================================================
    POST: SAVE SEATING PLAN
===================================================== */
router.post("/save-plan", async (req, res) => {
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

    const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;

    // 1️ Check venue conflicts
    for (const v of venuesUsed) {
      const available = await Venue.isAvailable(
        v.venueId,
        dateOnly,
        examStartTime,
        examEndTime
      );
      if (!available) {
        return res.status(400).json({
          error: `Venue ${v.venueName} already booked`
        });
      }
    }

    let finalVenues = venuesUsed;

    // 2️ Auto Faculty Assignment
    if (facultyMode === "AUTO") {
      const result = await autoAssignFaculty(venuesUsed, dateOnly, examSession, examStartTime, examEndTime);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      finalVenues = result.venues;
    }

    await connection.beginTransaction();

    // 3️Check faculty allocation limits AND time conflicts
    const assignedFacultyInThisRequest = new Set();
    
    for (const v of finalVenues) {
      if (v.facultyId) {
        //  CHECK: Faculty already used in THIS request
        if (assignedFacultyInThisRequest.has(v.facultyId)) {
          await connection.rollback();
          const [faculty] = await db.query("SELECT name FROM faculty WHERE id = ?", [v.facultyId]);
          const facultyName = faculty[0]?.name || "Unknown";
          return res.status(400).json({
            error: `Cannot assign ${facultyName} to multiple venues in the same exam session`
          });
        }
        
        // Check allocation limit
        const canAllocate = await Faculty.canAllocate(v.facultyId);
        if (!canAllocate) {
          await connection.rollback();
          return res.status(400).json({
            error: "Faculty allocation limit reached. Cannot assign this faculty."
          });
        }

        //  CHECK: Time conflict with existing assignments
        const hasConflict = await checkFacultyTimeConflict(
          v.facultyId,
          dateOnly,
          examStartTime,
          examEndTime
        );
        
        if (hasConflict) {
          await connection.rollback();
          const [faculty] = await db.query("SELECT name FROM faculty WHERE id = ?", [v.facultyId]);
          const facultyName = faculty[0]?.name || "Unknown";
          return res.status(400).json({
            error: `Faculty ${facultyName} is already assigned to another venue at this time (${examStartTime} - ${examEndTime} on ${dateOnly})`
          });
        }
        
        //  Track this faculty as assigned in this request
        assignedFacultyInThisRequest.add(v.facultyId);
      }
    }

    // 4Save seating plan
    const seatingPlanId = await SeatingPlan.createPlan({
      examDate: dateOnly,
      examSession,
      examType,
      examStartTime,
      examEndTime,
      selectedCourses,
      students,
      venuesUsed: finalVenues,
      facultyMode
    });

    // 5 Mark venues as booked
    for (const v of finalVenues) {
      await Venue.addSession(
        v.venueId,
        dateOnly,
        examStartTime,
        examEndTime
      );
    }

    await connection.commit();
    res.status(201).json({
      message: "Seating plan saved successfully",
      seatingPlanId
    });

  } catch (err) {
    await connection.rollback();
    console.error("SAVE PLAN ERROR:", err);
    res.status(500).json({
      error: "Failed to save plan",
      message: err.message
    });
  } finally {
    connection.release();
  }
});

/* =====================================================
    POST: CHECK FACULTY AVAILABILITY
===================================================== */
router.post("/check-faculty-availability", async (req, res) => {
  try {
    const { examDate, examSession, venueCount, examStartTime, examEndTime } = req.body;
    const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;

    const [facultyList] = await db.query(
      "SELECT id, name, department, max_classrooms FROM faculty"
    );

    const [existing] = await db.query(
      `SELECT spv.faculty_id, COUNT(*) as count 
       FROM seating_plan_venues spv
       JOIN seating_plans sp ON spv.seating_plan_id = sp.id
       WHERE sp.exam_date = ? AND sp.exam_session = ?
       GROUP BY spv.faculty_id`,
      [dateOnly, examSession]
    );

    const assignmentMap = new Map(existing.map(row => [row.faculty_id, row.count]));

    let totalAvailableSlots = 0;

    const facultyStatus = await Promise.all(facultyList.map(async (f) => {
      const current = assignmentMap.get(f.id) || 0;
      const available = Math.max(0, (f.max_classrooms || 1) - current);
      
      //  Check time conflict if examStartTime and examEndTime are provided
      let hasTimeConflict = false;
      if (examStartTime && examEndTime) {
        hasTimeConflict = await checkFacultyTimeConflict(
          f.id,
          dateOnly,
          examStartTime,
          examEndTime
        );
      }
      
      const isAvailable = available > 0 && !hasTimeConflict;
      if (isAvailable) {
        totalAvailableSlots += available;
      }

      return {
        ...f,
        currentAssignments: current,
        availableSlots: available,
        hasTimeConflict,
        status: isAvailable ? "available" : (hasTimeConflict ? "time-conflict" : "full")
      };
    }));

    res.json({
      available: totalAvailableSlots >= venueCount,
      message:
        totalAvailableSlots >= venueCount
          ? "Sufficient faculty available"
          : "Faculty shortage",
      facultyStatus
    });
  } catch (err) {
    console.error("FACULTY AVAILABILITY ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
    GET: ALL SEATING PLANS
===================================================== */
router.get("/", async (req, res) => {
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
});

/* =====================================================
    DELETE: SEATING PLAN
===================================================== */
router.delete("/delete-plan/:id", async (req, res) => {
  const planId = req.params.id;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const plan = await SeatingPlan.getPlanById(planId);
    if (!plan) {
      await connection.rollback();
      return res.status(404).json({ error: "Seating plan not found" });
    }

    // Extract venues
    const venues = plan.venuesUsed || plan.venues_used;
    const venueList = typeof venues === 'string' ? JSON.parse(venues) : venues;

    if (venueList && Array.isArray(venueList)) {
      for (const v of venueList) {
        // Remove venue sessions
        const examDateRaw = plan.exam_date || plan.examDate;
        const dateOnly = typeof examDateRaw === "string" && examDateRaw.includes("T")
          ? examDateRaw.split("T")[0]
          : examDateRaw;

        await Venue.removeSession(
          v.venueId || v.venue_id,
          dateOnly,
          plan.exam_start_time || plan.examStartTime,
          plan.exam_end_time || plan.examEndTime
        );
      }
    }

    // Delete the seating plan (this should cascade to seating_plan_venues)
    await SeatingPlan.deletePlan(planId);

    await connection.commit();
    res.status(200).json({ message: "Plan deleted successfully." });

  } catch (err) {
    await connection.rollback();
    console.error("DELETE ERROR:", err);
    res.status(500).json({ error: "Failed to delete", message: err.message });
  } finally {
    connection.release();
  }
});

/* =====================================================
    CHECK FACULTY TIME CONFLICT
===================================================== */
async function checkFacultyTimeConflict(facultyId, examDate, startTime, endTime) {
  try {
    const [conflicts] = await db.query(
      `SELECT COUNT(*) as conflictCount
       FROM seating_plan_venues spv
       JOIN seating_plans sp ON spv.seating_plan_id = sp.id
       WHERE spv.faculty_id = ?
         AND sp.exam_date = ?
         AND (
           (sp.exam_start_time < ? AND sp.exam_end_time > ?) OR
           (sp.exam_start_time < ? AND sp.exam_end_time > ?) OR
           (sp.exam_start_time >= ? AND sp.exam_end_time <= ?)
         )`,
      [
        facultyId,
        examDate,
        endTime, startTime,
        endTime, startTime,
        startTime, endTime
      ]
    );
    
    return conflicts[0].conflictCount > 0;
  } catch (err) {
    console.error("TIME CONFLICT CHECK ERROR:", err);
    throw err;
  }
}

/* =====================================================
    FIXED: AUTO ASSIGN FACULTY (WITH PROPER TRACKING)
===================================================== */
async function autoAssignFaculty(venuesUsed, examDate, examSession, examStartTime, examEndTime) {
  const [facultyList] = await db.query(
    "SELECT id, name, department, max_classrooms FROM faculty"
  );

  const [existing] = await db.query(
    `SELECT faculty_id, COUNT(*) as count 
     FROM seating_plan_venues spv
     JOIN seating_plans sp ON spv.seating_plan_id = sp.id
     WHERE sp.exam_date = ? AND sp.exam_session = ?
     GROUP BY faculty_id`,
    [examDate, examSession]
  );

  const counts = new Map(existing.map(r => [r.faculty_id, r.count]));

  //  Filter faculty: must have capacity AND no time conflict
  let available = [];
  for (const f of facultyList) {
    const used = counts.get(f.id) || 0;
    const hasCapacity = used < (f.max_classrooms || 1);
    
    if (hasCapacity) {
      const hasConflict = await checkFacultyTimeConflict(
        f.id,
        examDate,
        examStartTime,
        examEndTime
      );
      
      if (!hasConflict) {
        available.push(f);
      }
    }
  }

  const assigned = [];
  const usedInThisSession = new Set(); //  TRACK USAGE IN THIS REQUEST

  for (const v of venuesUsed) {
    if (available.length === 0) {
      return { 
        success: false, 
        error: "Insufficient faculty capacity (considering time conflicts and session limits)" 
      };
    }

    //  Find first faculty not yet used in THIS session
    let selectedFaculty = null;
    let selectedIndex = -1;

    for (let i = 0; i < available.length; i++) {
      const f = available[i];
      if (!usedInThisSession.has(f.id)) {
        selectedFaculty = f;
        selectedIndex = i;
        break;
      }
    }

    //  If all available faculty already used in this session, we need MORE faculty
    if (!selectedFaculty) {
      return {
        success: false,
        error: `Cannot assign same faculty to multiple venues in one exam session. Need ${venuesUsed.length} faculty but only ${usedInThisSession.size} available without conflicts.`
      };
    }

    //  Assign this faculty
    assigned.push({ ...v, facultyId: selectedFaculty.id });
    usedInThisSession.add(selectedFaculty.id);

    // Update count for this faculty
    const newCount = (counts.get(selectedFaculty.id) || 0) + 1;
    counts.set(selectedFaculty.id, newCount);

    // 🔴 Remove from available if they've hit their max
    if (newCount >= (selectedFaculty.max_classrooms || 1)) {
      available.splice(selectedIndex, 1);
    }
  }

  return { success: true, venues: assigned };
}

module.exports = router;
