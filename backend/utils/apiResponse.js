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
  console.error(logLabel + ":", err?.message || err);
  if (process.env.NODE_ENV !== "production" && err?.stack) {
    console.error(err.stack);
  }
  return fail(res, 500, "SERVER_ERROR", "Unexpected error occurred.");
}

function fromError(res, err, fallbackMessage = "Request failed") {
  if (err?.statusCode || err?.status) {
    const status = err.statusCode || err.status;
    return fail(res, status, err.code || "REQUEST_FAILED", err.message || fallbackMessage, err.details);
  }
  if (err?.code === "23503") {
    return conflict(res, "DEPENDENCY_CONFLICT", "Cannot complete operation due to existing references.", "Remove dependent records first.");
  }
  if (err?.code === "23505") {
    return conflict(res, "DUPLICATE_RECORD", "A record with this value already exists.");
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
