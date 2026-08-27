/**
 * Central JSON / urlencoded body parsing with dev diagnostics.
 * Ensures req.body is populated for API POST/PUT/PATCH when clients send JSON.
 */

const express = require("express");
const { isProductionMode, logger, redactValue } = require("../utils/logger");

const BODY_DEBUG =
  process.env.BODY_PARSER_DEBUG === "true" && !isProductionMode();

function logBodyDebug(phase, req) {
  if (!BODY_DEBUG) return;
  const ct = req.headers["content-type"] || "(none)";
  const len = req.headers["content-length"] || "0";
  logger.debug(
    `[BODY_DEBUG:${phase}] ${req.method} ${req.originalUrl || req.url} ` +
      `ct=${ct} len=${len} body=${JSON.stringify(redactValue(req.body))}`
  );
}

/** Accept JSON when Content-Type is json, or when API client omits Content-Type but sends a body. */
function shouldParseAsJson(req) {
  const ct = String(req.headers["content-type"] || "").toLowerCase();
  if (ct.includes("application/json") || ct.includes("+json")) return true;
  if (ct.includes("multipart/form-data")) return false;
  if (ct.includes("application/x-www-form-urlencoded")) return false;

  const rawPath = req.originalUrl || req.url || req.path || "";
  const path = rawPath.split("?")[0];
  const hasBody =
    req.method === "POST" || req.method === "PUT" || req.method === "PATCH";

  // Mobile/proxy clients sometimes POST JSON without Content-Type
  if (hasBody && path.startsWith("/api") && !ct) {
    return true;
  }

  return false;
}

function preParseDebug(req, _res, next) {
  logBodyDebug("pre-parse", { ...req, body: undefined });
  if (BODY_DEBUG) {
    console.log(
      `[BODY_DEBUG:headers] ${req.method} ${req.originalUrl || req.url} ` +
        `content-type=${req.headers["content-type"] || "(none)"} ` +
        `content-length=${req.headers["content-length"] || "0"}`
    );
  }
  next();
}

function postParseDebug(req, _res, next) {
  logBodyDebug("post-parse", req);
  next();
}

function jsonSyntaxErrorHandler(err, req, res, next) {
  if (
    err instanceof SyntaxError &&
    (err.status === 400 || err.statusCode === 400) &&
    "body" in err
  ) {
    if (BODY_DEBUG) {
      console.error(
        `[BODY_DEBUG:json-error] ${req.method} ${req.originalUrl || req.url}:`,
        err.message
      );
    }
    return res.status(400).json({
      success: false,
      code: "INVALID_JSON",
      message: "Request body must be valid JSON with Content-Type: application/json",
    });
  }
  return next(err);
}

/** Normalize req.body to an object after parsers run (never undefined). */
function ensureBodyObject(req, _res, next) {
  if (req.body === undefined || req.body === null) {
    req.body = {};
  }
  next();
}

function registerBodyParsers(app) {
  app.use(preParseDebug);

  app.use(
    express.json({
      limit: "5mb",
      type: shouldParseAsJson,
    })
  );

  app.use(
    express.urlencoded({
      limit: "5mb",
      extended: true,
      type(req) {
        const ct = String(req.headers["content-type"] || "").toLowerCase();
        return ct.includes("application/x-www-form-urlencoded");
      },
    })
  );

  app.use(jsonSyntaxErrorHandler);
  app.use(postParseDebug);
  app.use(ensureBodyObject);
}

module.exports = {
  registerBodyParsers,
  preParseDebug,
  postParseDebug,
  jsonSyntaxErrorHandler,
  ensureBodyObject,
  shouldParseAsJson,
  BODY_DEBUG,
};
