const express = require("express");
const router = express.Router();
const Faculty = require("../models/Faculty");

const SeatingPlan = require("../models/SeatingPlan");
const Venue = require("../models/venue");

/* =====================================================
   POST: SAVE SEATING PLAN
===================================================== */
router.post("/save-plan", async (req, res) => {
  try {
    const {
      examDate,
      examStartTime,
      examEndTime,
      examSession,
      examType,
      selectedCourses,
      venuesUsed,
      students = [],
      facultyMode = "AUTO",   // ✅ NEW
    } = req.body;

    /* ---------- SAFE DATE HANDLING ---------- */
    if (!examDate) {
      return res.status(400).json({ error: "Exam date is required" });
    }

    const dateOnly = examDate.includes("T")
      ? examDate.split("T")[0]
      : examDate;

    /* ---------- SAFE VALIDATION ---------- */
    if (
      !dateOnly ||
      !examStartTime?.trim() ||
      !examEndTime?.trim() ||
      !examSession ||
      !examType ||
      !Array.isArray(selectedCourses) ||
      selectedCourses.length === 0 ||
      !Array.isArray(venuesUsed) ||
      venuesUsed.length === 0
    ) {
      return res.status(400).json({
        error: "Invalid or missing required fields",
      });
    }

    /* ---------- VENUE CONFLICT CHECK ---------- */
    for (const v of venuesUsed) {
      if (!v.venueId) {
        return res.status(400).json({
          error: "Invalid venue data",
        });
      }

      const available = await Venue.isAvailable(
        v.venueId,
        dateOnly,
        examStartTime,
        examEndTime
      );

      if (!available) {
        return res.status(400).json({
          error: `Venue ${v.venueName || v.venueId} already booked`,
        });
      }
    }

    let finalVenues = venuesUsed;

    /* ---------- AUTO FACULTY ASSIGN ---------- */
    if (facultyMode === "AUTO") {
      finalVenues = await autoAssignFaculty(venuesUsed);
    }

    /* ---------- SAVE PLAN ---------- */
    const seatingPlanId = await SeatingPlan.createPlan({
      examDate: dateOnly,
      examSession,
      examType,
      examStartTime,
      examEndTime,
      selectedCourses,
      students,
      venuesUsed: finalVenues,   // ✅ facultyId now included
      facultyMode,               // ✅ save mode
    });

    /* ---------- ADD VENUE SESSIONS ---------- */
    for (const v of venuesUsed) {
      await Venue.addSession(
        v.venueId,
        dateOnly,
        examStartTime,
        examEndTime
      );
    }

    res.status(201).json({
      message: "Seating plan saved with faculty assignment",
      seatingPlanId,
    });
  } catch (err) {
    console.error("🔥 SAVE PLAN ERROR:", err);
    res.status(500).json({
      error: "Failed to save seating plan",
      message: err.message,
    });
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
    console.error("🔥 FETCH PLANS ERROR:", err);
    res.status(500).json({
      error: "Failed to fetch seating plans",
      message: err.message,
    });
  }
});

/* =====================================================
   GET: BOOKED VENUES
===================================================== */
router.get("/booked-venues", async (req, res) => {
  try {
    const { date, session } = req.query;

    if (!date || !session) {
      return res.status(400).json({
        error: "Date and session are required",
      });
    }

    const dateOnly = date.includes("T")
      ? date.split("T")[0]
      : date;

    const bookedVenues = await SeatingPlan.getBookedVenues(
      dateOnly,
      session
    );

    res.status(200).json(bookedVenues);
  } catch (err) {
    console.error("🔥 BOOKED VENUES ERROR:", err);
    res.status(500).json({
      error: "Failed to fetch booked venues",
      message: err.message,
    });
  }
});

/* =====================================================
   DELETE: SEATING PLAN
===================================================== */
router.delete("/delete-plan/:id", async (req, res) => {
  try {
    const planId = req.params.id;

    const plan = await SeatingPlan.getPlanById(planId);
    if (!plan) {
      return res.status(404).json({
        error: "Seating plan not found",
      });
    }

    const examDateRaw = plan.exam_date || plan.examDate;
    const dateOnly =
      typeof examDateRaw === "string" && examDateRaw.includes("T")
        ? examDateRaw.split("T")[0]
        : examDateRaw;

    /* ---------- REMOVE VENUE SESSIONS ---------- */
    for (const v of plan.venuesUsed) {
      await Venue.removeSession(
        v.venueId,
        dateOnly,
        plan.exam_start_time || plan.examStartTime,
        plan.exam_end_time || plan.examEndTime
      );
    }

    await SeatingPlan.deletePlan(planId);

    res.status(200).json({
      message: "Seating plan deleted successfully",
    });
  } catch (err) {
    console.error("🔥 DELETE PLAN ERROR:", err);
    res.status(500).json({
      error: "Failed to delete seating plan",
      message: err.message,
    });
  }
});

async function autoAssignFaculty(venuesUsed) {
  const db = require("../config/db");

  // 1️⃣ Fetch all faculty
  const [facultyList] = await db.query(
    "SELECT id, name, department FROM faculty"
  );

  if (facultyList.length === 0) {
    throw new Error("No faculty available for auto assignment");
  }

  // 2️⃣ Assign faculty using round-robin
  return venuesUsed.map((venue, index) => {
    const faculty = facultyList[index % facultyList.length];
    return {
      ...venue,
      facultyId: faculty.id,
      facultyName: faculty.name,
      facultyDepartment: faculty.department,
    };
  });
}

module.exports = router;
