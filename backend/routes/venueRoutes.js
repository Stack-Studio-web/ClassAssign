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
    let { name, type, benchesRow, benchesCol, benchConfig } = req.body;

    if (
      !name ||
      !type ||
      benchesRow === undefined ||
      benchesCol === undefined ||
      !benchConfig ||
      !Array.isArray(benchConfig)
    ) {
      return res.status(400).json({
        error: "Validation error",
        details: "Venue name, type, rows, columns, and bench configuration are required.",
      });
    }

    if (benchConfig.length !== benchesCol) {
      return res.status(400).json({
        error: "Validation error",
        details: "Bench configuration length must match number of columns.",
      });
    }

    name = name.trim();
    type = type.trim();

    const venueId = await Venue.create({
      name,
      type,
      benchesRow,
      benchesCol,
      benchConfig,
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
    let { name, type, benchesRow, benchesCol, benchConfig } = req.body;

    if (!name || !type || benchesRow === undefined || benchesCol === undefined || !benchConfig) {
      return res.status(400).json({
        error: "All fields are required for update.",
      });
    }

    name = name.trim();
    type = type.trim();

    // Check duplicate
    const exists = await Venue.existsByNameAndTypeExceptId(name, type, id);
    if (exists) {
      return res.status(400).json({
        error: "Duplicate venue",
        details: "Another venue with this name and type already exists.",
      });
    }

    // Calculate capacity
    const capacity = benchesRow * benchConfig.reduce((sum, seats) => sum + seats, 0);

    const conn = await require("../config/db").getConnection();
    try {
      await conn.beginTransaction();

      // Update venue
      const [result] = await conn.query(
        `UPDATE venues
         SET name = ?, type = ?, benches_row = ?, benches_col = ?, capacity = ?
         WHERE id = ?`,
        [name, type, benchesRow, benchesCol, capacity, id]
      );

      if (result.affectedRows === 0) {
        await conn.rollback();
        return res.status(404).json({ error: "Venue not found" });
      }

      // Delete old bench config
      await conn.query(
        `DELETE FROM venue_bench_config WHERE venue_id = ?`,
        [id]
      );

      // Insert new bench config
      for (let colIndex = 0; colIndex < benchConfig.length; colIndex++) {
        await conn.query(
          `INSERT INTO venue_bench_config
           (venue_id, column_index, seats_per_bench)
           VALUES (?, ?, ?)`,
          [id, colIndex, benchConfig[colIndex]]
        );
      }

      await conn.commit();
      res.json({ message: "Venue updated successfully" });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
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