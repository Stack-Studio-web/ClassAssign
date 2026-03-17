const express = require("express");
const router = express.Router();
const AuditLog = require("../models/AuditLog");

// ✅ COMMON AUTH MIDDLEWARE (SESSION-BASED)
const sessionAuth = require("../middleware/sessionAuth");
const requireAdmin = require("../middleware/requireAdmin");

const requireAdminOrHod = (req, res, next) => {
  if (req.user?.role !== "admin" && req.user?.role !== "hod") {
    return res.status(403).json({ error: "Admin or HoD access required" });
  }
  next();
};

/* ===============================
    GET /api/audit-logs
    Admin: all logs. HoD: logs from users in their department only.
=============================== */
router.get("/", sessionAuth, requireAdminOrHod, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const opts = req.user?.role === "hod" && req.user?.department
      ? { department: req.user.department }
      : {};
    const logs = await AuditLog.getAll(limit, offset, opts);

    res.json({
      logs,
      pagination: {
        limit,
        offset,
        hasMore: logs.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

/* ===============================
    GET /api/audit-logs/stats
    Admin: all. HoD: stats for their department only.
=============================== */
router.get("/stats", sessionAuth, requireAdminOrHod, async (req, res) => {
  try {
    const opts = req.user?.role === "hod" && req.user?.department
      ? { department: req.user.department }
      : {};
    const stats = await AuditLog.getStats(opts);
    res.json(stats);
  } catch (error) {
    console.error("Error fetching audit log stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

/* ===============================
    POST /api/audit-logs/search
=============================== */
router.post("/search", sessionAuth, requireAdmin, async (req, res) => {
  try {
    const filters = {
      userId: req.body.userId,
      action: req.body.action,
      entityType: req.body.entityType,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      limit: parseInt(req.body.limit) || 100,
    };

    const logs = await AuditLog.search(filters);
    res.json(logs);
  } catch (error) {
    console.error("Error searching audit logs:", error);
    res.status(500).json({ error: "Failed to search logs" });
  }
});

/* ===============================
    GET /api/audit-logs/user/:userId
=============================== */
router.get("/user/:userId", sessionAuth, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await AuditLog.getByUser(req.params.userId, limit);
    res.json(logs);
  } catch (error) {
    console.error("Error fetching user logs:", error);
    res.status(500).json({ error: "Failed to fetch user logs" });
  }
});

/* ===============================
    GET /api/audit-logs/entity/:type/:id
=============================== */
router.get(
  "/entity/:type/:id",
  sessionAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const logs = await AuditLog.getByEntity(
        req.params.type,
        req.params.id
      );
      res.json(logs);
    } catch (error) {
      console.error("Error fetching entity logs:", error);
      res.status(500).json({ error: "Failed to fetch entity logs" });
    }
  }
);

/* ===============================
    GET /api/audit-logs/action/:action
=============================== */
router.get(
  "/action/:action",
  sessionAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const logs = await AuditLog.getByAction(req.params.action, limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching action logs:", error);
      res.status(500).json({ error: "Failed to fetch action logs" });
    }
  }
);

/* ===============================
    DELETE /api/audit-logs/cleanup
=============================== */
router.delete("/cleanup", sessionAuth, requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.body.days) || 90;

    if (days < 30) {
      return res
        .status(400)
        .json({ error: "Cannot delete logs newer than 30 days" });
    }

    const deletedCount = await AuditLog.deleteOlderThan(days);

    res.json({
      message: `Deleted ${deletedCount} log entries older than ${days} days`,
      deletedCount,
    });
  } catch (error) {
    console.error("Error cleaning up logs:", error);
    res.status(500).json({ error: "Failed to cleanup logs" });
  }
});

module.exports = router;