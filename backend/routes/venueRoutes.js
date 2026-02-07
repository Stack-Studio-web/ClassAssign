//venueRoutes.js
const express = require("express");
const router = express.Router();
const Venue = require("../models/venue");

/* ================================
   GET VENUE STATS
================================ */
router.get("/stats", async (req, res) => {
  try {
    const stats = await Venue.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

/* ================================
   GET ALL VENUES
================================ */
router.get("/", async (req, res) => {
  try {
    const venues = await Venue.getAll();
    res.json(venues);
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

/* ================================
   GET VENUE BY ID
================================ */
router.get("/:id", async (req, res) => {
  try {
    const venue = await Venue.getById(req.params.id);
    if (!venue) {
      return res.status(404).json({ error: "Venue not found" });
    }
    res.json(venue);
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

/* ================================
   ADD NEW VENUE
================================ */
router.post("/", async (req, res) => {
  try {
    const { name, type, venueMode = "standard", benchesRow, benchesCol, rows, capacity } = req.body;

    // Validation
    if (!name || !type) {
      return res.status(400).json({
        error: "Validation error",
        details: "Venue name and type are required.",
      });
    }

    // Mode-specific validation
    if (venueMode === "standard") {
      if (benchesRow === undefined || benchesCol === undefined) {
        return res.status(400).json({
          error: "Validation error",
          details: "Standard mode requires benchesRow and benchesCol.",
        });
      }
    } else if (venueMode === "custom") {
      if (!rows || rows.length === 0) {
        return res.status(400).json({
          error: "Validation error",
          details: "Custom mode requires at least one row configuration.",
        });
      }
      // Validate each row
      for (const row of rows) {
        if (!row.label || !row.benches || !row.columns) {
          return res.status(400).json({
            error: "Validation error",
            details: "Each row must have label, benches, and columns.",
          });
        }
      }
    }

    // Check for duplicate
    const exists = await Venue.existsByNameAndType(name.trim(), type.trim());
    if (exists) {
      return res.status(400).json({
        error: "Duplicate venue",
        details: "Venue with this name and type already exists.",
      });
    }

    const venueId = await Venue.create({
      name: name.trim(),
      type: type.trim(),
      capacity,
      venueMode,
      benchesRow: venueMode === "standard" ? benchesRow : null,
      benchesCol: venueMode === "standard" ? benchesCol : null,
      rows: venueMode === "custom" ? rows : null,
    });

    res.status(201).json({
      message: "Venue created successfully",
      venueId,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        error: "Duplicate venue",
        details: "Venue with this name and type already exists.",
      });
    }

    res.status(400).json({
      error: "Validation error",
      details: err.message,
    });
  }
});

/* ================================
   UPDATE VENUE
================================ */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, venueMode = "standard", benchesRow, benchesCol, rows, capacity } = req.body;

    // Validation
    if (!name || !type) {
      return res.status(400).json({
        error: "Validation error",
        details: "Venue name and type are required.",
      });
    }

    // Mode-specific validation
    if (venueMode === "standard") {
      if (benchesRow === undefined || benchesCol === undefined) {
        return res.status(400).json({
          error: "Validation error",
          details: "Standard mode requires benchesRow and benchesCol.",
        });
      }
    } else if (venueMode === "custom") {
      if (!rows || rows.length === 0) {
        return res.status(400).json({
          error: "Validation error",
          details: "Custom mode requires at least one row configuration.",
        });
      }
      // Validate each row
      for (const row of rows) {
        if (!row.label || !row.benches || !row.columns) {
          return res.status(400).json({
            error: "Validation error",
            details: "Each row must have label, benches, and columns.",
          });
        }
      }
    }

    // Check duplicate (excluding current venue)
    const exists = await Venue.existsByNameAndTypeExceptId(name.trim(), type.trim(), id);
    if (exists) {
      return res.status(400).json({
        error: "Duplicate venue",
        details: "Another venue with this name and type already exists.",
      });
    }

    await Venue.update(id, {
      name: name.trim(),
      type: type.trim(),
      capacity,
      venueMode,
      benchesRow: venueMode === "standard" ? benchesRow : null,
      benchesCol: venueMode === "standard" ? benchesCol : null,
      rows: venueMode === "custom" ? rows : null,
    });

    res.json({ message: "Venue updated successfully" });
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

/* ================================
   DELETE VENUE
================================ */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Venue.delete(id);
    res.json({ message: "Venue deleted successfully" });
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

/* ================================
   CHECK VENUE AVAILABILITY
================================ */
router.post("/:id/check-availability", async (req, res) => {
  try {
    const { date, startTime, endTime } = req.body;
    const isAvailable = await Venue.isAvailable(
      req.params.id,
      date,
      startTime,
      endTime
    );
    res.json({ isAvailable });
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

/* ================================
   ADD SESSION TO VENUE
================================ */
router.post("/:id/sessions", async (req, res) => {
  try {
    const { id } = req.params;
    const { date, startTime, endTime } = req.body;

    if (!date || !startTime || !endTime) {
      return res
        .status(400)
        .json({ error: "All session fields are required." });
    }

    // Check conflicts
    const available = await Venue.isAvailable(
      id,
      date,
      startTime,
      endTime
    );

    if (!available) {
      return res.status(400).json({
        error: "Venue already booked for this time slot",
      });
    }

    await Venue.addSession(id, date, startTime, endTime);

    res.json({ message: "Session added successfully" });
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

/* ================================
   REMOVE SESSION FROM VENUE
================================ */
router.delete("/:id/sessions", async (req, res) => {
  try {
    const { date, startTime, endTime } = req.body;
    await Venue.removeSession(req.params.id, date, startTime, endTime);
    res.json({ message: "Session removed successfully" });
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

module.exports = router;