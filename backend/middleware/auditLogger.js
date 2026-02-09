// Class/backend/middleware/auditLogger.js
const AuditLog = require("../models/AuditLog");

/**
 * Middleware to log all administrative actions
 * IMPORTANT: Must be used AFTER sessionAuth middleware
 */
const auditLogger = (action, entityType) => {
  return async (req, res, next) => {
    // Store original res.json
    const originalJson = res.json.bind(res);

    // Override res.json to capture response
    res.json = function (data) {
      // Log only successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (req.user) {
          // Determine entity ID
          const entityId =
            req.params?.id ||
            req.body?.id ||
            data?.id ||
            data?.userId ||
            null;

          // Prepare changes object
          const changes = {
            method: req.method,
            path: req.path,
            body: sanitizeBody(req.body),
            params: req.params,
            query: req.query,
            response: sanitizeResponse(data),
          };

          // Save audit log (async, non-blocking)
          AuditLog.create({
            userId: req.user.id,
            action,
            entityType,
            entityId,
            changes,
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
          }).catch((err) => {
            console.error("Failed to create audit log:", err);
          });
        }
      }

      // Return original response
      return originalJson(data);
    };

    next();
  };
};

/* ===============================
    HELPERS
=============================== */

function sanitizeBody(body) {
  if (!body) return {};

  const sanitized = { ...body };
  const sensitiveFields = [
    "password",
    "currentPassword",
    "newPassword",
    "token",
    "secret",
  ];

  sensitiveFields.forEach((field) => {
    if (sanitized[field]) {
      sanitized[field] = "[REDACTED]";
    }
  });

  return sanitized;
}

function sanitizeResponse(data) {
  if (!data) return {};

  if (Array.isArray(data) && data.length > 10) {
    return {
      type: "array",
      count: data.length,
      sample: data.slice(0, 2),
    };
  }

  if (typeof data === "object") {
    const sanitized = { ...data };
    const sensitiveFields = ["password", "token", "secret"];

    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = "[REDACTED]";
      }
    });

    return sanitized;
  }

  return data;
}

module.exports = auditLogger;