const cors = require("cors");

/** Local dev + Hostinger VPS defaults. Override via ALLOWED_ORIGINS in .env */
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://213.210.37.189:3002",
  "http://213.210.37.189:5002",
];

const ENV_ORIGIN_KEYS = ["ALLOWED_ORIGINS", "CORS_ORIGINS", "FRONTEND_URL"];

function parseOriginList(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function buildAllowedOrigins() {
  const set = new Set(DEFAULT_ORIGINS);

  for (const key of ENV_ORIGIN_KEYS) {
    for (const origin of parseOriginList(process.env[key])) {
      set.add(origin);
    }
  }

  return Array.from(set);
}

const allowedOrigins = buildAllowedOrigins();

function isOriginAllowed(origin) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

function createCorsMiddleware() {
  return cors({
    origin(origin, callback) {
      // Mobile apps, Postman, curl, same-origin server calls — no Origin header
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[CORS] Rejected origin: ${origin}`,
          `\n       Allowed origins: ${allowedOrigins.join(", ")}`
        );
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Client-Type",
      "X-Requested-With",
      "Accept",
    ],
    optionsSuccessStatus: 204,
  });
}

function logCorsConfig() {
  console.log(`[CORS] ${allowedOrigins.length} allowed origin(s): ${allowedOrigins.join(", ")}`);
}

module.exports = {
  DEFAULT_ORIGINS,
  buildAllowedOrigins,
  allowedOrigins,
  isOriginAllowed,
  createCorsMiddleware,
  logCorsConfig,
};
