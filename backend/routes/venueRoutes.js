/**
 * Venue + Block routes — Phase 1 global Block → Venue management.
 * Visibility: global for admin / faculty_incharge.
 * Mutations: creator (owner_user_id) or admin only. 403 otherwise.
 */
const express = require("express");
const router = express.Router();
const Venue = require("../models/venue");
const Block = require("../models/Block");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");
const { resolveOwnerOpts } = require("../utils/rbac");
const { resolveEntity } = require("../middleware/resolvePublicId");
const { TABLE, getPublicUuid, resolveInternalId } = require("../utils/publicId");

const VENUE_ROLES = ["admin", "faculty_incharge"];
const BLOCK_STATUSES = ["ACTIVE", "INACTIVE", "MAINTENANCE"];

function currentUser(req) {
  return {
    id: req.user?.id,
    role: req.user?.role,
    department: req.user?.department ?? null,
    username: req.user?.username ?? null,
  };
}

function assertCanManageBlock(user, row) {
  if (!Block.canManageBlock(user, row)) {
    const err = new Error("Only the creator can modify this block");
    err.statusCode = 403;
    throw err;
  }
}

async function resolveBlockId(blockUuid) {
  if (!blockUuid) return null;
  return resolveInternalId(TABLE.blocks, blockUuid);
}

/* =====================================================
   BLOCKS — global list, creator mutate
===================================================== */

router.get("/blocks", sessionAuth, checkRole(VENUE_ROLES), async (req, res) => {
  try {
    const user = currentUser(req);
    const status = req.query.status || null;
    const rows = await Block.list({ status });
    res.json(rows.map((r) => Block.toPublic(r, user)));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
});

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
      const opts = await resolveOwnerOpts(req);
      // createdBy ALWAYS from session via insertOwnership — ignore client createdBy
      const created = await Block.create(
        {
          name: req.body.name,
          code: req.body.code,
          description: req.body.description,
          status: req.body.status || "ACTIVE",
        },
        { ...opts, department: currentUser(req).department }
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

router.patch(
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
      assertCanManageBlock(user, row);

      if (req.body.status != null) {
        const status = String(req.body.status).toUpperCase();
        if (!BLOCK_STATUSES.includes(status)) {
          return res.status(400).json({
            error: `status must be one of: ${BLOCK_STATUSES.join(", ")}`,
          });
        }
      }

      await Block.update(req.internalId, {
        name: req.body.name,
        code: req.body.code,
        description: req.body.description,
        status: req.body.status,
      });
      res.json({ message: "Block updated successfully", uuid: req.publicUuid });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

// Keep PUT as alias for clients that still use it
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
      assertCanManageBlock(user, row);
      await Block.update(req.internalId, {
        name: req.body.name,
        code: req.body.code,
        description: req.body.description,
        status: req.body.status,
      });
      res.json({ message: "Block updated successfully", uuid: req.publicUuid });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.delete(
  "/blocks/:uuid",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.blocks),
  auditLogger("DELETE_BLOCK", "Block"),
  async (req, res) => {
    try {
      const user = currentUser(req);
      const row = await Block.findById(req.internalId);
      if (!row) return res.status(404).json({ error: "Block not found" });
      assertCanManageBlock(user, row);
      await Block.delete(req.internalId);
      res.json({ message: "Block deleted successfully", uuid: req.publicUuid });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

/* =====================================================
   VENUES — global list, creator mutate
===================================================== */

router.get("/", sessionAuth, checkRole(VENUE_ROLES), async (req, res) => {
  try {
    const user = currentUser(req);
    let blockId = null;
    let unassignedOnly = false;

    if (req.query.unassigned === "true" || req.query.blockUuid === "__none__") {
      unassignedOnly = true;
    } else if (req.query.blockUuid) {
      blockId = await resolveBlockId(req.query.blockUuid);
      if (!blockId) {
        return res.status(400).json({ error: "Invalid blockUuid" });
      }
    } else if (req.query.blockId) {
      blockId = Number(req.query.blockId) || null;
    }

    const venues = await Venue.getAll({
      blockId,
      unassignedOnly,
      type: req.query.type || null,
      search: req.query.search || null,
      user,
      role: user.role,
    });
    res.json(venues);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
});

router.get("/stats", sessionAuth, checkRole(VENUE_ROLES), async (req, res) => {
  try {
    const user = currentUser(req);
    const [venues, blocks] = await Promise.all([
      Venue.getAll({ user, role: user.role }),
      Block.list({}),
    ]);
    const totalVenues = venues.length;
    const totalCapacity = venues.reduce((sum, v) => sum + (v.capacity || 0), 0);
    const totalBlocks = blocks.length;
    const unassignedCount = venues.filter((v) => !v.blockUuid).length;
    res.json({ totalVenues, totalCapacity, totalBlocks, unassignedCount });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
});

router.post(
  "/",
  sessionAuth,
  checkRole(VENUE_ROLES),
  auditLogger("CREATE_VENUE", "Venue"),
  async (req, res) => {
    try {
      let { name, type, benchesRow, benchesCol, benchConfig, blockUuid, isAvailable } =
        req.body;

      if (
        !name ||
        !type ||
        benchesRow === undefined ||
        benchesCol === undefined ||
        !Array.isArray(benchConfig)
      ) {
        return res.status(400).json({
          error: "Validation error",
          details: "All fields are required.",
        });
      }

      if (!blockUuid) {
        return res.status(400).json({
          error: "Validation error",
          details: "Block is required.",
        });
      }

      if (benchConfig.length !== benchesCol) {
        return res.status(400).json({
          error: "Validation error",
          details: "Bench configuration mismatch.",
        });
      }

      const blockId = await resolveBlockId(blockUuid);
      if (!blockId) {
        return res.status(400).json({ error: "Invalid blockUuid" });
      }

      const opts = await resolveOwnerOpts(req);
      // createdBy from session only — ignore body.createdBy
      const venueId = await Venue.create(
        {
          name: name.trim(),
          type: type.trim(),
          benchesRow,
          benchesCol,
          benchConfig,
          blockId,
          code: req.body.code || name.trim(),
          isAvailable: isAvailable !== false,
        },
        opts
      );

      const uuid = await getPublicUuid(TABLE.venues, venueId);
      res.status(201).json({ message: "Venue created successfully", uuid });
    } catch (err) {
      const isDuplicate = err.code === "ER_DUP_ENTRY" || err.code === "23505";
      res.status(isDuplicate ? 400 : err.statusCode || 500).json({
        error: err.message,
        details: isDuplicate
          ? "A venue with this name and type already exists."
          : undefined,
      });
    }
  }
);

router.put(
  "/:uuid/availability",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.venues),
  auditLogger("UPDATE_VENUE_USE_IT", "Venue"),
  async (req, res) => {
    try {
      const { isAvailable, isActive } = req.body || {};
      const value =
        typeof isAvailable === "boolean"
          ? isAvailable
          : typeof isActive === "boolean"
            ? isActive
            : null;
      if (typeof value !== "boolean") {
        return res.status(400).json({ error: "isAvailable (boolean) is required" });
      }
      const user = currentUser(req);
      await Venue.setAvailability(req.internalId, value, user);
      res.json({
        message: "Use It updated",
        uuid: req.publicUuid,
        isAvailable: value,
        isActive: value,
      });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.patch(
  "/:uuid/availability",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.venues),
  auditLogger("UPDATE_VENUE_USE_IT", "Venue"),
  async (req, res) => {
    try {
      const { isAvailable, isActive } = req.body || {};
      const value =
        typeof isAvailable === "boolean"
          ? isAvailable
          : typeof isActive === "boolean"
            ? isActive
            : null;
      if (typeof value !== "boolean") {
        return res.status(400).json({ error: "isAvailable (boolean) is required" });
      }
      const user = currentUser(req);
      await Venue.setAvailability(req.internalId, value, user);
      res.json({
        message: "Use It updated",
        uuid: req.publicUuid,
        isAvailable: value,
        isActive: value,
      });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

/** Use for Allotment eligibility (does not reserve a time slot). */
router.put(
  "/:uuid/use-for-allotment",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.venues),
  auditLogger("UPDATE_VENUE_USE_FOR_ALLOTMENT", "Venue"),
  async (req, res) => {
    try {
      const { useForAllotment } = req.body || {};
      if (typeof useForAllotment !== "boolean") {
        return res.status(400).json({ error: "useForAllotment (boolean) is required" });
      }
      const user = currentUser(req);
      await Venue.setUseForAllotment(req.internalId, useForAllotment, user);
      res.json({
        message: "Use for Allotment updated",
        uuid: req.publicUuid,
        useForAllotment,
      });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.patch(
  "/:uuid/use-for-allotment",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.venues),
  auditLogger("UPDATE_VENUE_USE_FOR_ALLOTMENT", "Venue"),
  async (req, res) => {
    try {
      const { useForAllotment } = req.body || {};
      if (typeof useForAllotment !== "boolean") {
        return res.status(400).json({ error: "useForAllotment (boolean) is required" });
      }
      const user = currentUser(req);
      await Venue.setUseForAllotment(req.internalId, useForAllotment, user);
      res.json({
        message: "Use for Allotment updated",
        uuid: req.publicUuid,
        useForAllotment,
      });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

/**
 * Batch time-slot availability for Allotment venue list.
 * Body: { date, startTime, endTime, venueUuids?: string[] }
 * Occupied only when an existing saved allotment overlaps the requested interval.
 */
router.post(
  "/check-slot-availability",
  sessionAuth,
  checkRole(VENUE_ROLES),
  async (req, res) => {
    try {
      const { date, startTime, endTime, venueUuids } = req.body || {};
      if (!date || !startTime || !endTime) {
        return res.status(400).json({
          error: "date, startTime, and endTime are required",
        });
      }

      const dateOnly = String(date).includes("T") ? String(date).split("T")[0] : String(date);
      const allVenues = await Venue.getAll({ user: currentUser(req) });
      const wanted =
        Array.isArray(venueUuids) && venueUuids.length > 0
          ? new Set(venueUuids.map((u) => String(u)))
          : null;

      const results = [];
      for (const v of allVenues) {
        if (wanted && !wanted.has(String(v.uuid))) continue;
        if (v.isAvailable === false) continue;
        if (v.useForAllotment === false) continue;

        const venueId = await resolveInternalId(TABLE.venues, v.uuid);
        if (venueId == null) continue;

        const check = await Venue.checkAllotmentSlot(
          venueId,
          dateOnly,
          startTime,
          endTime
        );
        results.push({
          uuid: v.uuid,
          name: v.name,
          capacity: v.capacity,
          useIt: v.isAvailable !== false,
          useForAllotment: v.useForAllotment !== false,
          status: check.status,
          available: check.ok,
          conflicts: check.conflicts,
          message: check.message,
        });
      }

      res.json({ date: dateOnly, startTime, endTime, venues: results });
    } catch (err) {
      console.error("CHECK SLOT AVAILABILITY ERROR:", err);
      res.status(500).json({
        error: "Failed to check venue slot availability",
        details: err.message,
      });
    }
  }
);

/** Date/time schedule availability (reads seating plans + venue_sessions). */
router.get(
  "/:uuid/availability",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.venues),
  async (req, res) => {
    try {
      const date = req.query.date;
      if (!date) {
        return res.status(400).json({ error: "date query parameter is required (YYYY-MM-DD)" });
      }
      const startTime = req.query.startTime || req.query.start_time || null;
      const endTime = req.query.endTime || req.query.end_time || null;
      if ((startTime && !endTime) || (!startTime && endTime)) {
        return res.status(400).json({
          error: "Provide both startTime and endTime, or neither",
        });
      }
      const result = await Venue.getScheduleAvailability(req.internalId, {
        date,
        startTime,
        endTime,
      });
      if (!result) return res.status(404).json({ error: "Venue not found" });
      res.json(result);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

async function handleVenueUpdate(req, res) {
  const id = req.internalId;
  let { name, type, benchesRow, benchesCol, benchConfig, blockUuid, isAvailable } =
    req.body;

  if (!name || !type || benchesRow === undefined || benchesCol === undefined || !benchConfig) {
    return res.status(400).json({ error: "All fields are required." });
  }

  if (!blockUuid) {
    return res.status(400).json({ error: "Block is required." });
  }

  const exists = await Venue.existsByNameAndTypeExceptId(name.trim(), type.trim(), id);
  if (exists) return res.status(400).json({ error: "Duplicate venue" });

  const blockId = await resolveBlockId(blockUuid);
  if (!blockId) {
    return res.status(400).json({ error: "Invalid blockUuid" });
  }

  const user = currentUser(req);
  await Venue.updateDetails(
    id,
    {
      name,
      type,
      benchesRow,
      benchesCol,
      benchConfig,
      blockId,
      code: req.body.code || name.trim(),
      isAvailable,
    },
    user
  );
  res.json({ message: "Venue updated successfully", uuid: req.publicUuid });
}

router.put(
  "/:uuid",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.venues),
  auditLogger("UPDATE_VENUE", "Venue"),
  async (req, res) => {
    try {
      await handleVenueUpdate(req, res);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

router.patch(
  "/:uuid",
  sessionAuth,
  checkRole(VENUE_ROLES),
  resolveEntity(TABLE.venues),
  auditLogger("UPDATE_VENUE", "Venue"),
  async (req, res) => {
    try {
      await handleVenueUpdate(req, res);
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
    try {
      const user = currentUser(req);
      await Venue.deleteById(req.internalId, user);
      res.json({ message: "Venue deleted successfully", uuid: req.publicUuid });
    } catch (err) {
      if (err.code === "VENUE_IN_USE") {
        return res.status(400).json({
          error: "Cannot delete venue",
          details: err.message,
        });
      }
      res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
    }
  }
);

module.exports = router;
