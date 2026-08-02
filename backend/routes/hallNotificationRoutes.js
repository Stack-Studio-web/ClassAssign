const express = require("express");
const router = express.Router();
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");
const Api = require("../utils/apiResponse");
const HallNotificationService = require("../services/hallNotificationService");
const bullQueue = require("../config/bullQueue");
const { OFFSET_PRESETS } = require("../services/hallNotificationMessage");

const ADMIN_ROLES = ["admin", "faculty_incharge"];

router.get("/settings", sessionAuth, checkRole(ADMIN_ROLES), async (req, res) => {
  try {
    const settings = await HallNotificationService.getSettings();
    return res.json({
      success: true,
      settings,
      presets: Object.keys(OFFSET_PRESETS).filter((k) => k !== "custom"),
    });
  } catch (err) {
    return Api.fromError(res, err, "Failed to load settings");
  }
});

router.put(
  "/settings",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  auditLogger("UPDATE_NOTIFICATION_SETTINGS", "NotificationSettings"),
  async (req, res) => {
    try {
      const { offsetPreset, customOffsetMinutes, portalUrl } = req.body;
      const settings = await HallNotificationService.updateSettings({
        offsetPreset,
        customOffsetMinutes,
        portalUrl,
        userId: req.user?.id,
      });
      return res.json({ success: true, settings });
    } catch (err) {
      return Api.fromError(res, err, "Failed to update settings");
    }
  }
);

router.post(
  "/pause",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  auditLogger("PAUSE_NOTIFICATIONS", "NotificationSettings"),
  async (req, res) => {
    try {
      const settings = await HallNotificationService.setPaused(true, req.user?.id);
      return res.json({ success: true, settings, message: "Notifications paused" });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.post(
  "/resume",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  auditLogger("RESUME_NOTIFICATIONS", "NotificationSettings"),
  async (req, res) => {
    try {
      const settings = await HallNotificationService.setPaused(false, req.user?.id);
      return res.json({ success: true, settings, message: "Notifications resumed" });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.get("/stats", sessionAuth, checkRole(ADMIN_ROLES), async (req, res) => {
  try {
    const [stats, settings, waiting, active, completed, failed, delayed] = await Promise.all([
      HallNotificationService.getStats(),
      HallNotificationService.getSettings(),
      bullQueue.getWaitingCount(),
      bullQueue.getActiveCount(),
      bullQueue.getCompletedCount(),
      bullQueue.getFailedCount(),
      bullQueue.getDelayedCount(),
    ]);
    return res.json({
      success: true,
      stats,
      settings,
      queue: { waiting, active, completed, failed, delayed },
    });
  } catch (err) {
    return Api.fromError(res, err);
  }
});

router.get("/history", sessionAuth, checkRole(ADMIN_ROLES), async (req, res) => {
  try {
    const data = await HallNotificationService.listNotifications(req.query);
    return res.json({ success: true, ...data });
  } catch (err) {
    return Api.fromError(res, err);
  }
});

router.post(
  "/bulk-resend",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  auditLogger("BULK_RESEND_HALL_NOTIFICATIONS", "HallNotification"),
  async (req, res) => {
    try {
      const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : [];
      const result = await HallNotificationService.bulkResend(ids);
      return res.json({ success: true, ...result });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.get("/:id/events", sessionAuth, checkRole(ADMIN_ROLES), async (req, res) => {
  try {
    const events = await HallNotificationService.getEvents(Number(req.params.id));
    return res.json({ success: true, events });
  } catch (err) {
    return Api.fromError(res, err);
  }
});

router.post(
  "/:id/cancel",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  auditLogger("CANCEL_HALL_NOTIFICATION", "HallNotification"),
  async (req, res) => {
    try {
      const ok = await HallNotificationService.cancelNotification(Number(req.params.id));
      if (!ok) return Api.validationError(res, "Cannot cancel this notification");
      return res.json({ success: true, message: "Notification cancelled" });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.post(
  "/:id/resend",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  auditLogger("RESEND_HALL_NOTIFICATION", "HallNotification"),
  async (req, res) => {
    try {
      const job = await HallNotificationService.resendNotification(Number(req.params.id));
      if (!job) return Api.validationError(res, "Cannot resend this notification");
      return res.json({ success: true, message: "Notification queued for resend", jobId: job.id });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.post(
  "/:id/send-now",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  auditLogger("SEND_NOW_HALL_NOTIFICATION", "HallNotification"),
  async (req, res) => {
    try {
      const job = await HallNotificationService.sendNow(Number(req.params.id));
      if (!job) return Api.validationError(res, "Cannot send this notification now");
      return res.json({ success: true, message: "Notification sent to queue", jobId: job.id });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

module.exports = router;
