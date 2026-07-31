const Api = require("../utils/apiResponse");

function notFoundHandler(req, res) {
  return Api.fail(res, 404, "NOT_FOUND", "Not Found", req.path);
}

function errorHandler(err, req, res, _next) {
  if (res.headersSent) return;
  if (err?.message === "Not allowed by CORS") {
    return Api.forbidden(res, "Not allowed by CORS");
  }
  if (err?.code === "EBADCSRFTOKEN") {
    return Api.forbidden(res, "Invalid request token");
  }
  return Api.fromError(res, err);
}

module.exports = { notFoundHandler, errorHandler };
