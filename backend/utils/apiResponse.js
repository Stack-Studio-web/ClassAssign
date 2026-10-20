function success(res, message, data = {}, status = 200) {
  return res.status(status).json({ success: true, message, data });
}

function fail(res, status, code, message, details) {
  const body = { success: false, code, message };
  if (details) body.details = details;
  return res.status(status).json(body);
}

function validationError(res, message, details, code = "VALIDATION_ERROR") {
  return fail(res, 400, code, message, details);
}

function notFound(res, message = "Resource not found", code = "NOT_FOUND") {
  return fail(res, 404, code, message);
}

function conflict(res, code, message, details) {
  return fail(res, 409, code, message, details);
}

function forbidden(res, message, details) {
  return fail(res, 403, "FORBIDDEN", message, details);
}

function serverError(res, err, logLabel = "Server error") {
  const { isProductionMode } = require("./logger");
  console.error(logLabel + ":", err?.message || err);
  if (!isProductionMode() && err?.stack) {
    console.error(err.stack);
  }
  return fail(res, 500, "SERVER_ERROR", "Unexpected error occurred.");
}

function pgErrorCode(err) {
  return err?.code || err?.parent?.code || err?.original?.code || null;
}

function isForeignKeyViolation(err) {
  const code = pgErrorCode(err);
  if (code === "23503") return true;
  if (err?.name === "SequelizeForeignKeyConstraintError") return true;
  return false;
}

function fromError(res, err, fallbackMessage = "Request failed") {
  if (err?.statusCode || err?.status) {
    const status = err.statusCode || err.status;
    return fail(res, status, err.code || "REQUEST_FAILED", err.message || fallbackMessage, err.details);
  }
  const pgCode = pgErrorCode(err);
  const msg = String(err?.message || "");
  // Explicit LAB schema gate
  if (err?.code === "SCHEMA_NOT_READY") {
    return fail(res, err.statusCode || 503, "SCHEMA_NOT_READY", err.message, err.details);
  }
  // Missing LAB relations only (not arbitrary SQL bugs like venues.department)
  if (
    pgCode === "42P01" ||
    (/relation .* does not exist/i.test(msg) &&
      /lab_exam|lab_slot/i.test(msg))
  ) {
    return fail(
      res,
      503,
      "SCHEMA_NOT_READY",
      `LAB schema error: ${msg}. Restart the API so ensureLabExamSchema can create missing tables, then retry.`,
      err.details
    );
  }
  if (pgCode === "42703" || /column .* does not exist/i.test(msg)) {
    if (/plan_kind/i.test(msg)) {
      return fail(
        res,
        503,
        "SCHEMA_NOT_READY",
        `LAB schema error: ${msg}. Restart the API so ensureLabExamSchema can add seating_plans.plan_kind, then retry.`,
        err.details
      );
    }
    // Surface real SQL column bugs instead of a generic 500.
    return fail(res, 500, "UNDEFINED_COLUMN", msg);
  }
  if (isForeignKeyViolation(err)) {
    return conflict(
      res,
      "DEPENDENCY_CONFLICT",
      "Cannot complete operation due to existing references.",
      "Remove or reassign dependent records first."
    );
  }
  if (pgErrorCode(err) === "23505") {
    return conflict(res, "DUPLICATE_RECORD", "A record with this value already exists.");
  }
  // value_too_long — e.g. seating_plans.exam_type VARCHAR limit
  if (pgCode === "22001" || /value too long for type character varying/i.test(msg)) {
    return fail(
      res,
      400,
      "VALUE_TOO_LONG",
      err.message || "A saved value exceeds the database column length."
    );
  }
  if (err?.code === "DUPLICATE_BATCH") {
    return conflict(res, err.code, err.message);
  }
  if (err?.name === "SequelizeUniqueConstraintError") {
    const detail =
      err?.parent?.detail ||
      err?.original?.detail ||
      "This record already exists.";
    return conflict(res, "DUPLICATE_RECORD", detail);
  }
  return serverError(res, err);
}

module.exports = {
  success,
  fail,
  validationError,
  notFound,
  conflict,
  forbidden,
  serverError,
  fromError,
};
