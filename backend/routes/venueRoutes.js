//venueRoutes.js
const express = require("express");
const router = express.Router();
const Venue = require("../models/venue");

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
   GET VENUE STATS
================================ */
router.get("/stats", async (req, res) => {
  try {
    const venues = await Venue.getAll();

    const totalVenues = venues.length;
    const totalCapacity = venues.reduce(
      (sum, v) => sum + (v.capacity || 0),
      0
    );

    res.json({
      totalVenues,
      totalCapacity,
    });
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
    let { name, type, benchesRow, benchesCol, capacity } = req.body;

    if (
      !name ||
      !type ||
      benchesRow === undefined ||
      benchesCol === undefined
    ) {
      return res.status(400).json({
        error: "Validation error",
        details: "Venue name, type, rows, and columns are required.",
      });
    }

    name = name.trim();
    type = type.trim();

    // MySQL unique constraint will handle duplicates
    const venueId = await Venue.create({
      name,
      type,
      benchesRow,
      benchesCol,
      capacity,
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
    let { name, type, benchesRow, benchesCol, capacity } = req.body;

    if (!name || !type || benchesRow === undefined || benchesCol === undefined) {
      return res.status(400).json({
        error: "All fields are required for update.",
      });
    }

    name = name.trim();
    type = type.trim();

    // ✅ CHECK DUPLICATE (EXCLUDING CURRENT ID)
    const exists = await Venue.existsByNameAndTypeExceptId(name, type, id);
    if (exists) {
      return res.status(400).json({
        error: "Duplicate venue",
        details: "Another venue with this name and type already exists.",
      });
    }

    const [result] = await require("../config/db").query(
      `UPDATE venues
       SET name = ?, type = ?, benches_row = ?, benches_col = ?, capacity = ?
       WHERE id = ?`,
      [name, type, benchesRow, benchesCol, capacity, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Venue not found" });
    }

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

    const [result] = await require("../config/db").query(
      "DELETE FROM venues WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Venue not found" });
    }

    res.json({ message: "Venue deleted successfully" });
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

module.exports = router;
