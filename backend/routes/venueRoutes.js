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
  auditLogger("UPDATE_VENUE_AVAILABILITY", "Venue"),
  async (req, res) => {
    try {
      const { isAvailable } = req.body || {};
      if (typeof isAvailable !== "boolean") {
        return res.status(400).json({ error: "isAvailable (boolean) is required" });
      }
      const user = currentUser(req);
      await Venue.setAvailability(req.internalId, isAvailable, user);
      res.json({ message: "Availability updated", uuid: req.publicUuid, isAvailable });
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
  auditLogger("UPDATE_VENUE_AVAILABILITY", "Venue"),
  async (req, res) => {
    try {
      const { isAvailable } = req.body || {};
      if (typeof isAvailable !== "boolean") {
        return res.status(400).json({ error: "isAvailable (boolean) is required" });
      }
      const user = currentUser(req);
      await Venue.setAvailability(req.internalId, isAvailable, user);
      res.json({ message: "Availability updated", uuid: req.publicUuid, isAvailable });
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
