//venueRoutes.js - Routes for managing venues (CRUD operations, stats, etc.)
const express = require("express");
const router = express.Router();
const Venue = require("../models/venue");
const db = require("../config/db");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole"); // New flexible middleware
const auditLogger = require("../middleware/auditLogger");

/* ================================
   GET ALL VENUES
   Roles: admin, faculty_incharge, coe (CEO)
================================ */
router.get("/", 
  sessionAuth, 
  checkRole(['admin', 'faculty_incharge', 'coe']), 
  async (req, res) => {
    try {
      const venues = await Venue.getAll();
      res.json(venues);
    } catch (err) {
      res.status(500).json({ error: "Server error", details: err.message });
    }
});

/* ================================
   GET VENUE STATS
   Roles: admin, faculty_incharge, coe (CEO)
================================ */
router.get("/stats", 
  sessionAuth, 
  checkRole(['admin', 'faculty_incharge', 'coe']), 
  async (req, res) => {
    try {
      const venues = await Venue.getAll();
      const totalVenues = venues.length;
      const totalCapacity = venues.reduce((sum, v) => sum + (v.capacity || 0), 0);
      res.json({ totalVenues, totalCapacity });
    } catch (err) {
      res.status(500).json({ error: "Server error", details: err.message });
    }
});

/* ================================
   ADD NEW VENUE
   Roles: admin, faculty_incharge
================================ */
router.post("/",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  auditLogger("CREATE_VENUE", "Venue"),
  async (req, res) => {
    try {
      let { name, type, benchesRow, benchesCol, benchConfig } = req.body;

      if (!name || !type || benchesRow === undefined || benchesCol === undefined || !Array.isArray(benchConfig)) {
        return res.status(400).json({ error: "Validation error", details: "All fields are required." });
      }

      if (benchConfig.length !== benchesCol) {
        return res.status(400).json({ error: "Validation error", details: "Bench configuration mismatch." });
      }

      const venueId = await Venue.create({
        name: name.trim(),
        type: type.trim(),
        benchesRow,
        benchesCol,
        benchConfig,
      });

      res.status(201).json({ message: "Venue created successfully", venueId, id: venueId });
    } catch (err) {
      res.status(err.code === "ER_DUP_ENTRY" ? 400 : 500).json({ error: err.message });
    }
});

/* ================================
   UPDATE VENUE
   Roles: admin, faculty_incharge
================================ */
router.put("/:id",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  auditLogger("UPDATE_VENUE", "Venue"),
  async (req, res) => {
    const { id } = req.params;
    let { name, type, benchesRow, benchesCol, benchConfig } = req.body;

    try {
      if (!name || !type || benchesRow === undefined || benchesCol === undefined || !benchConfig) {
        return res.status(400).json({ error: "All fields are required." });
      }

      const exists = await Venue.existsByNameAndTypeExceptId(name.trim(), type.trim(), id);
      if (exists) return res.status(400).json({ error: "Duplicate venue" });

      const capacity = benchesRow * benchConfig.reduce((sum, seats) => sum + seats, 0);
      const conn = await db.getConnection();

      try {
        await conn.beginTransaction();
        const [result] = await conn.query(
          "UPDATE venues SET name=?, type=?, benches_row=?, benches_col=?, capacity=? WHERE id=?",
          [name.trim(), type.trim(), benchesRow, benchesCol, capacity, id]
        );

        if (result.affectedRows === 0) throw new Error("Venue not found");

        await conn.query("DELETE FROM venue_bench_config WHERE venue_id = ?", [id]);
        for (let i = 0; i < benchConfig.length; i++) {
          await conn.query(
            "INSERT INTO venue_bench_config (venue_id, column_index, seats_per_bench) VALUES (?, ?, ?)",
            [id, i, benchConfig[i]]
          );
        }

        await conn.commit();
        res.json({ message: "Venue updated successfully", id });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      res.status(500).json({ error: "Server error", details: err.message });
    }
});

/* ================================
   DELETE VENUE (With Foreign Key Checks)
   Roles: admin, faculty_incharge
================================ */
router.delete("/:id",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  auditLogger("DELETE_VENUE", "Venue"),
  async (req, res) => {
    const conn = await db.getConnection();
    try {
      const { id } = req.params;
      await conn.beginTransaction();

      // Check if venue is linked to any active seating plans
      const [usage] = await conn.query(
        "SELECT COUNT(*) as count FROM seating_plan_venues WHERE venue_id = ?", 
        [id]
      );
      
      if (usage[0].count > 0) {
        await conn.rollback();
        return res.status(400).json({ 
          error: "Cannot delete venue", 
          details: `This venue is linked to ${usage[0].count} seating plan(s).` 
        });
      }

      // Cleanup child tables
      await conn.query("DELETE FROM venue_bench_config WHERE venue_id = ?", [id]);
      await conn.query("DELETE FROM venue_sessions WHERE venue_id = ?", [id]);
      
      // Delete parent record
      const [result] = await conn.query("DELETE FROM venues WHERE id = ?", [id]);

      await conn.commit();
      res.json({ message: "Venue deleted successfully", id });
    } catch (err) {
      await conn.rollback();
      res.status(500).json({ error: "Server error", details: err.message });
    } finally {
      conn.release();
    }
});

module.exports = router;