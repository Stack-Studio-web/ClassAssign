const express = require("express");
const router = express.Router();
const SeatingPlan = require("../models/SeatingPlan");
const Venue = require("../models/venue");
const db = require("../config/db");

/* =====================================================
    POST: SAVE SEATING PLAN
===================================================== */
router.post("/save-plan", async (req, res) => {
  try {
    const { examDate, examStartTime, examEndTime, examSession, examType, selectedCourses, venuesUsed, students, facultyMode } = req.body;

    const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;

    // 1. Venue Conflict Check
    for (const v of venuesUsed) {
      const available = await Venue.isAvailable(v.venueId, dateOnly, examStartTime, examEndTime);
      if (!available) return res.status(400).json({ error: `Venue ${v.venueName} already booked` });
    }

    let finalVenues = venuesUsed;

    // 2. Handle Auto Faculty Assignment
    if (facultyMode === "AUTO") {
      const result = await autoAssignFaculty(venuesUsed, dateOnly, examSession);
      if (!result.success) return res.status(400).json({ error: result.error });
      finalVenues = result.venues;
    }

    // 3. Save Plan
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

    // 4. Mark Venues as Booked
    for (const v of finalVenues) {
      await Venue.addSession(v.venueId, dateOnly, examStartTime, examEndTime);
    }

    res.status(201).json({ message: "Seating plan saved successfully", seatingPlanId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save plan", message: err.message });
  }
});

/* =====================================================
    POST: CHECK FACULTY AVAILABILITY
===================================================== */
router.post("/check-faculty-availability", async (req, res) => {
  try {
    const { examDate, examSession, venueCount } = req.body;
    const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;

    const [facultyList] = await db.query("SELECT id, name, department, max_classrooms FROM faculty");
    const [existing] = await db.query(
      `SELECT spv.faculty_id, COUNT(*) as count FROM seating_plan_venues spv 
       JOIN seating_plans sp ON spv.seating_plan_id = sp.id 
       WHERE sp.exam_date = ? AND sp.exam_session = ? GROUP BY spv.faculty_id`, [dateOnly, examSession]
    );

    const assignmentMap = new Map(existing.map(row => [row.faculty_id, row.count]));
    let totalAvailableSlots = 0;
    
    const facultyStatus = facultyList.map(f => {
      const current = assignmentMap.get(f.id) || 0;
      const available = Math.max(0, (f.max_classrooms || 1) - current);
      totalAvailableSlots += available;
      return { ...f, currentAssignments: current, availableSlots: available, status: available > 0 ? 'available' : 'full' };
    });

    res.json({
      available: totalAvailableSlots >= venueCount,
      message: totalAvailableSlots >= venueCount ? "Sufficient faculty available" : "Faculty shortage",
      facultyStatus
    });
  } catch (err) {
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
      message: err.message,
    });
  }
});


/* =====================================================
    DELETE: SEATING PLAN
===================================================== */
router.delete("/delete-plan/:id", async (req, res) => {
  const planId = req.params.id;

  try {
    // Get plan details first
    const plan = await SeatingPlan.getPlanById(planId);
    if (!plan) {
      return res.status(404).json({ error: "Seating plan not found" });
    }

    const examDateRaw = plan.exam_date || plan.examDate;
    const dateOnly = typeof examDateRaw === "string" && examDateRaw.includes("T")
      ? examDateRaw.split("T")[0]
      : examDateRaw;

    // 1️⃣ Remove venue sessions (free the halls)
    for (const v of plan.venuesUsed) {
      await Venue.removeSession(
        v.venueId,
        dateOnly,
        plan.exam_start_time || plan.examStartTime,
        plan.exam_end_time || plan.examEndTime
      );
    }

    // 2️⃣ Delete the plan and all related records
    await SeatingPlan.deletePlan(planId);

    res.status(200).json({ message: "Seating plan deleted successfully" });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({
      error: "Failed to delete seating plan",
      message: err.message,
    });
  }
});

/* Helper Function for Auto Assignment */
async function autoAssignFaculty(venuesUsed, examDate, examSession) {
  const [facultyList] = await db.query("SELECT id, name, department, max_classrooms FROM faculty");
  const [existing] = await db.query(`SELECT faculty_id, COUNT(*) as count FROM seating_plan_venues spv JOIN seating_plans sp ON spv.seating_plan_id = sp.id WHERE sp.exam_date = ? AND sp.exam_session = ? GROUP BY faculty_id`, [examDate, examSession]);
  
  const counts = new Map(existing.map(r => [r.faculty_id, r.count]));
  let available = facultyList.filter(f => (counts.get(f.id) || 0) < (f.max_classrooms || 1));

  const assigned = [];
  for (const v of venuesUsed) {
    if (available.length === 0) return { success: false, error: "Insufficient faculty capacity" };
    const f = available[0];
    assigned.push({ ...v, facultyId: f.id });
    
    const newCount = (counts.get(f.id) || 0) + 1;
    counts.set(f.id, newCount);
    if (newCount >= (f.max_classrooms || 1)) available.shift();
  }
  return { success: true, venues: assigned };
}

module.exports = router;