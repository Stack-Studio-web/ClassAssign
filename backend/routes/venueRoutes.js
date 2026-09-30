/**
 * Venue + Block routes — block-wise venue management for Faculty In-Charge / Admin.
 * Department is NEVER exposed in list responses; used only for authorization.
 */
const express = require("express");
const router = express.Router();
const Venue = require("../models/venue");
const Block = require("../models/Block");
const AllotmentVenueSelection = require("../models/AllotmentVenueSelection");
const db = require("../config/db");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");
const { resolveOwnerOpts } = require("../utils/rbac");
const { resolveEntity } = require("../middleware/resolvePublicId");
const { TABLE, getPublicUuid, resolveInternalId } = require("../utils/publicId");

const VENUE_ROLES = ["admin", "faculty_incharge"];
const VENUE_TYPES = ["classroom", "lab", "hall", "seminar_hall", "auditorium", "other"];
const VENUE_STATUSES = ["ACTIVE", "INACTIVE", "MAINTENANCE"];
const BLOCK_STATUSES = ["ACTIVE", "INACTIVE", "MAINTENANCE"];

function currentUser(req) {
  return {
    id: req.user?.id,
    role: req.user?.role,
    department: req.user?.department ?? null,
  };
}

function assertCanManageBlockOrThrow(user, owningDepartment) {
  if (!Block.canManageBlock(user, owningDepartment)) {
    const err = new Error("You do not have permission to modify this block or its venues");
    err.statusCode = 403;
    throw err;
  }
}

async function resolveBlockId(blockUuid) {
  if (!blockUuid) return null;
  return resolveInternalId(TABLE.blocks, blockUuid);
}

/* =====================================================
   BLOCKS
===================================================== */

router.get(
  "/blocks",
  sessionAuth,
  checkRole(VENUE_ROLES),
  async (req, res) => {
    try {
      const user = currentUser(req);
      const mine = String(req.query.mine || "").toLowerCase() === "true";
      const status = req.query.status || null;
      const rows = await Block.list({
        mine,
        department: user.department,
        status,
      });
      res.json(rows.map((r) => Block.toPublic(r, user)));
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.get(
  "/blocks/my",
  sessionAuth,
  checkRole(VENUE_ROLES),
  async (req, res) => {
    try {
      const user = currentUser(req);
      const rows = await Block.list({
        mine: user.role !== "admin",
        department: user.department,
      });
      // Admin: all blocks; FI: own department blocks
      res.json(rows.map((r) => Block.toPublic(r, user)));
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.get(
  "/blocks/:uuid",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.blocks),
  async (req, res) => {
    try {
      const row = await Block.findById(req.internalId);
      if (!row) return res.status(404).json({ error: "Block not found" });
      const user = currentUser(req);
      const venues = await Venue.getAll({
        blockId: req.internalId,
        user,
        role: user.role,
        department: user.department,
      });
      res.json({ ...Block.toPublic(row, user), venues });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.post(
  "/blocks",
  sessionAuth,
  checkRole(VENUE_ROLES),
  auditLogger("CREATE_BLOCK", "Block"),
  async (req, res) => {
    try {
      const user = currentUser(req);
      const opts = await resolveOwnerOpts(req);
      let owningDepartment = req.body.owningDepartment;

      if (user.role === "faculty_incharge") {
        if (!user.department) {
          return res.status(400).json({ error: "Your account has no department assigned" });
        }
        owningDepartment = user.department;
      } else if (!owningDepartment) {
        return res.status(400).json({ error: "owningDepartment is required" });
      }

      const created = await Block.create(
        {
          name: req.body.name,
          code: req.body.code,
          description: req.body.description,
          owningDepartment,
          status: req.body.status || "ACTIVE",
        },
        { ...opts, department: owningDepartment }
      );

      const uuid = created.uuid || (await getPublicUuid(TABLE.blocks, created.id));
      res.status(201).json({ message: "Block created successfully", uuid });
    } catch (err) {
      const isDuplicate = err.code === "23505" || err.code === "ER_DUP_ENTRY";
      res.status(err.statusCode || (isDuplicate ? 400 : 500)).json({
        error: isDuplicate ? "A block with this code already exists" : err.message,
      });
    }
  }
);

router.put(
  "/blocks/:uuid",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.blocks),
  auditLogger("UPDATE_BLOCK", "Block"),
  async (req, res) => {
    try {
      const user = currentUser(req);
      const row = await Block.findById(req.internalId);
      if (!row) return res.status(404).json({ error: "Block not found" });
      assertCanManageBlockOrThrow(user, row.owning_department);

      const patch = {
        name: req.body.name,
        code: req.body.code,
        description: req.body.description,
        status: req.body.status,
      };
      if (user.role === "admin" && req.body.owningDepartment != null) {
        patch.owningDepartment = req.body.owningDepartment;
      }
      await Block.update(req.internalId, patch);
      res.json({ message: "Block updated successfully", uuid: req.publicUuid });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.patch(
  "/blocks/:uuid/status",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.blocks),
  auditLogger("UPDATE_BLOCK_STATUS", "Block"),
  async (req, res) => {
    try {
      const user = currentUser(req);
      const row = await Block.findById(req.internalId);
      if (!row) return res.status(404).json({ error: "Block not found" });
      assertCanManageBlockOrThrow(user, row.owning_department);

      const status = String(req.body.status || "").toUpperCase();
      if (!BLOCK_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${BLOCK_STATUSES.join(", ")}` });
      }
      await Block.setStatus(req.internalId, status);
      res.json({ message: "Block status updated", uuid: req.publicUuid, status });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

/* =====================================================
   SELECTIONS (allotment venue pool)
===================================================== */

router.get(
  "/selection",
  sessionAuth,
  checkRole(VENUE_ROLES),
  async (req, res) => {
    try {
      const { examDate, examSession } = req.query;
      if (!examDate || !examSession) {
        return res.status(400).json({ error: "examDate and examSession are required" });
      }
      const opts = await resolveOwnerOpts(req);
      const rows = await AllotmentVenueSelection.list({
        examDate,
        examSession,
        ownerUserId: opts.ownerUserId,
        ownerIds: opts.ownerIds,
      });
      res.json(rows);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.post(
  "/selection",
  sessionAuth,
  checkRole(VENUE_ROLES),
  auditLogger("SELECT_VENUES_FOR_ALLOTMENT", "VenueSelection"),
  async (req, res) => {
    try {
      const { venueUuids, examDate, examSession, startTime, endTime } = req.body || {};
      if (!Array.isArray(venueUuids) || venueUuids.length === 0) {
        return res.status(400).json({ error: "venueUuids array is required" });
      }
      if (!examDate || !examSession || !startTime || !endTime) {
        return res.status(400).json({
          error: "examDate, examSession, startTime, and endTime are required",
        });
      }
      if (startTime >= endTime) {
        return res.status(400).json({ error: "endTime must be after startTime" });
      }

      const opts = await resolveOwnerOpts(req);
      const venueIds = [];
      const rejected = [];

      for (const vuuid of venueUuids) {
        const id = await resolveInternalId(TABLE.venues, vuuid);
        if (!id) {
          rejected.push({ uuid: vuuid, reason: "Venue not found" });
          continue;
        }
        const venue = await Venue.getById(id, currentUser(req));
        if (!venue) {
          rejected.push({ uuid: vuuid, reason: "Venue not found" });
          continue;
        }
        if (venue.status && venue.status !== "ACTIVE") {
          rejected.push({ uuid: vuuid, reason: "Venue is not active", name: venue.name });
          continue;
        }
        const avail = await Venue.getAvailabilityForWindow(id, examDate, startTime, endTime);
        if (!avail.available) {
          rejected.push({
            uuid: vuuid,
            name: venue.name,
            reason: "Venue already reserved for this time",
            conflicts: avail.conflicts,
          });
          continue;
        }
        venueIds.push(id);
      }

      if (venueIds.length === 0) {
        return res.status(409).json({
          error: "No venues could be selected",
          rejected,
        });
      }

      await AllotmentVenueSelection.addMany({
        venueIds,
        examDate,
        examSession,
        startTime,
        endTime,
        ownerUserId: opts.ownerUserId,
        academicContextId: opts.academicContextId,
      });

      const selected = await AllotmentVenueSelection.list({
        examDate,
        examSession,
        ownerUserId: opts.ownerUserId,
        ownerIds: opts.ownerIds,
      });

      res.status(201).json({
        message: `${venueIds.length} venue(s) added to allotment pool`,
        selected,
        rejected,
        totalCapacity: selected.reduce((s, v) => s + (v.capacity || 0), 0),
      });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.delete(
  "/selection/:uuid",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.allotmentVenueSelections),
  auditLogger("REMOVE_VENUE_SELECTION", "VenueSelection"),
  async (req, res) => {
    try {
      const opts = await resolveOwnerOpts(req);
      const removed = await AllotmentVenueSelection.remove(req.internalId, opts.ownerUserId, {
        isAdmin: opts.role === "admin",
        ownerIds: opts.ownerIds,
      });
      if (!removed) return res.status(404).json({ error: "Selection not found" });
      res.json({ message: "Venue removed from allotment pool", uuid: req.publicUuid });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

/* =====================================================
   VENUE LIST / STATS / CRUD
===================================================== */

router.get("/", sessionAuth, checkRole(VENUE_ROLES), async (req, res) => {
  try {
    const user = currentUser(req);
    const blockId = req.query.blockUuid
      ? await resolveBlockId(req.query.blockUuid)
      : null;
    if (req.query.blockUuid && !blockId) {
      return res.status(404).json({ error: "Block not found" });
    }

    const venues = await Venue.getAll({
      user,
      role: user.role,
      department: user.department,
      blockId,
      type: req.query.type || null,
      status: req.query.status || null,
      mine: String(req.query.mine || "").toLowerCase() === "true",
    });

    // Attach availability for requested window
    const { date, startTime, endTime, session } = req.query;
    if (date && startTime && endTime) {
      for (const v of venues) {
        const internalId = await resolveInternalId(TABLE.venues, v.uuid);
        const avail = await Venue.getAvailabilityForWindow(
          internalId,
          date,
          startTime,
          endTime
        );
        v.availability = {
          date,
          startTime,
          endTime,
          session: session || null,
          available: avail.available && v.status === "ACTIVE",
          conflicts: avail.conflicts,
        };
      }
    }

    res.json(venues);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.get("/stats", sessionAuth, checkRole(VENUE_ROLES), async (req, res) => {
  try {
    const user = currentUser(req);
    const venues = await Venue.getAll({
      user,
      role: user.role,
      department: user.department,
      mine: String(req.query.mine || "").toLowerCase() === "true",
    });
    const totalVenues = venues.length;
    const totalCapacity = venues.reduce((sum, v) => sum + (v.capacity || 0), 0);
    res.json({ totalVenues, totalCapacity });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.post(
  "/",
  sessionAuth,
  checkRole(VENUE_ROLES),
  auditLogger("CREATE_VENUE", "Venue"),
  async (req, res) => {
    try {
      let {
        name,
        type,
        benchesRow,
        benchesCol,
        benchConfig,
        blockUuid,
        code,
        floor,
        description,
        status,
      } = req.body;

      if (
        !name ||
        !type ||
        benchesRow === undefined ||
        benchesCol === undefined ||
        !Array.isArray(benchConfig)
      ) {
        return res
          .status(400)
          .json({ error: "Validation error", details: "All fields are required." });
      }
      if (!blockUuid) {
        return res.status(400).json({ error: "blockUuid is required" });
      }
      if (benchConfig.length !== benchesCol) {
        return res
          .status(400)
          .json({ error: "Validation error", details: "Bench configuration mismatch." });
      }
      if (!VENUE_TYPES.includes(String(type).toLowerCase())) {
        return res.status(400).json({
          error: `type must be one of: ${VENUE_TYPES.join(", ")}`,
        });
      }

      const blockId = await resolveBlockId(blockUuid);
      if (!blockId) return res.status(404).json({ error: "Block not found" });

      const block = await Block.findById(blockId);
      if (!block) return res.status(404).json({ error: "Block not found" });
      if (block.status && block.status !== "ACTIVE") {
        return res.status(400).json({ error: "Cannot add venues to a disabled block" });
      }

      const user = currentUser(req);
      assertCanManageBlockOrThrow(user, block.owning_department);

      const venueStatus = (status || "ACTIVE").toUpperCase();
      if (!VENUE_STATUSES.includes(venueStatus)) {
        return res.status(400).json({
          error: `status must be one of: ${VENUE_STATUSES.join(", ")}`,
        });
      }

      const venueId = await Venue.create(
        {
          name: name.trim(),
          type: type.trim().toLowerCase(),
          benchesRow,
          benchesCol,
          benchConfig,
          blockId,
          code: (code || name).trim(),
          floor: floor || null,
          description: description || null,
          status: venueStatus,
        },
        await resolveOwnerOpts(req)
      );

      const uuid = await getPublicUuid(TABLE.venues, venueId);
      res.status(201).json({ message: "Venue created successfully", uuid });
    } catch (err) {
      const isDuplicate = err.code === "ER_DUP_ENTRY" || err.code === "23505";
      res.status(err.statusCode || (isDuplicate ? 400 : 500)).json({
        error: err.message,
        details: isDuplicate
          ? "A venue with this name and type already exists."
          : undefined,
      });
    }
  }
);

/* Schedule + availability — before /:uuid generic routes */

router.get(
  "/:uuid/schedule",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.venues),
  async (req, res) => {
    try {
      const user = currentUser(req);
      const venue = await Venue.getById(req.internalId, user);
      if (!venue) return res.status(404).json({ error: "Venue not found" });
      const schedule = await Venue.getSchedule(req.internalId, {
        fromDate: req.query.from || null,
        toDate: req.query.to || null,
      });
      res.json({
        venue: {
          uuid: venue.uuid,
          name: venue.name,
          code: venue.code,
          capacity: venue.capacity,
          type: venue.type,
          blockName: venue.blockName,
          blockUuid: venue.blockUuid,
          status: venue.status,
        },
        schedule,
      });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.get(
  "/:uuid/availability",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.venues),
  async (req, res) => {
    try {
      const { date, startTime, endTime } = req.query;
      if (!date || !startTime || !endTime) {
        return res
          .status(400)
          .json({ error: "date, startTime, and endTime query params are required" });
      }
      const user = currentUser(req);
      const venue = await Venue.getById(req.internalId, user);
      if (!venue) return res.status(404).json({ error: "Venue not found" });

      if (venue.status !== "ACTIVE") {
        return res.json({
          available: false,
          reason: `Venue status is ${venue.status}`,
          conflicts: [],
          venue: { uuid: venue.uuid, name: venue.name, status: venue.status },
        });
      }

      const avail = await Venue.getAvailabilityForWindow(
        req.internalId,
        date,
        startTime,
        endTime
      );
      res.json({
        available: avail.available,
        conflicts: avail.conflicts,
        venue: {
          uuid: venue.uuid,
          name: venue.name,
          capacity: venue.capacity,
          blockName: venue.blockName,
        },
      });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.put(
  "/:uuid/availability",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.venues),
  auditLogger("UPDATE_VENUE_AVAILABILITY", "Venue"),
  async (req, res) => {
    try {
      const user = currentUser(req);
      await Venue.assertCanManage(req.internalId, user);
      const { isAvailable } = req.body || {};
      if (typeof isAvailable !== "boolean") {
        return res.status(400).json({ error: "isAvailable (boolean) is required" });
      }
      await Venue.setAvailability(req.internalId, isAvailable);
      res.json({ message: "Availability updated", uuid: req.publicUuid, isAvailable });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.patch(
  "/:uuid/status",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.venues),
  auditLogger("UPDATE_VENUE_STATUS", "Venue"),
  async (req, res) => {
    try {
      const user = currentUser(req);
      await Venue.assertCanManage(req.internalId, user);
      const status = String(req.body.status || "").toUpperCase();
      if (!VENUE_STATUSES.includes(status)) {
        return res
          .status(400)
          .json({ error: `status must be one of: ${VENUE_STATUSES.join(", ")}` });
      }
      await Venue.setStatus(req.internalId, status);
      res.json({ message: "Venue status updated", uuid: req.publicUuid, status });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.put(
  "/:uuid",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.venues),
  auditLogger("UPDATE_VENUE", "Venue"),
  async (req, res) => {
    try {
      const user = currentUser(req);
      await Venue.assertCanManage(req.internalId, user);

      let {
        name,
        type,
        benchesRow,
        benchesCol,
        benchConfig,
        blockUuid,
        code,
        floor,
        description,
        status,
      } = req.body;

      if (
        !name ||
        !type ||
        benchesRow === undefined ||
        benchesCol === undefined ||
        !benchConfig
      ) {
        return res.status(400).json({ error: "All fields are required." });
      }

      const exists = await Venue.existsByNameAndTypeExceptId(
        name.trim(),
        type.trim(),
        req.internalId
      );
      if (exists) return res.status(400).json({ error: "Duplicate venue" });

      let blockId = null;
      if (blockUuid) {
        blockId = await resolveBlockId(blockUuid);
        if (!blockId) return res.status(404).json({ error: "Block not found" });
        const block = await Block.findById(blockId);
        assertCanManageBlockOrThrow(user, block.owning_department);
      }

      await Venue.update(req.internalId, {
        name,
        type: String(type).toLowerCase(),
        benchesRow,
        benchesCol,
        benchConfig,
        blockId,
        code,
        floor,
        description,
        status: status ? String(status).toUpperCase() : undefined,
      });
      res.json({ message: "Venue updated successfully", uuid: req.publicUuid });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.delete(
  "/:uuid",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.venues),
  auditLogger("DELETE_VENUE", "Venue"),
  async (req, res) => {
    const conn = await db.getConnection();
    try {
      const user = currentUser(req);
      await Venue.assertCanManage(req.internalId, user);

      const id = req.internalId;
      await conn.beginTransaction();

      const [usage] = await conn.query(
        "SELECT COUNT(*) as count FROM seating_plan_venues WHERE venue_id = ?",
        [id]
      );
      const usageCount = Number(usage?.[0]?.count ?? usage?.[0]?.COUNT ?? 0);
      if (usageCount > 0) {
        await conn.rollback();
        return res.status(400).json({
          error: "Cannot delete venue",
          details: `This venue is linked to ${usageCount} seating plan(s).`,
        });
      }

      await conn.query("DELETE FROM venue_bench_config WHERE venue_id = ?", [id]);
      await conn.query("DELETE FROM venue_sessions WHERE venue_id = ?", [id]);
      await conn.query("DELETE FROM venues WHERE id = ?", [id]);

      await conn.commit();
      res.json({ message: "Venue deleted successfully", uuid: req.publicUuid });
    } catch (err) {
      await conn.rollback();
      res.status(err.statusCode || 500).json({
        error: err.message || "Server error",
        details: err.message,
      });
    } finally {
      conn.release();
    }
  }
);

module.exports = router;
