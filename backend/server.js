require("./instrument.js");

const Sentry = require("@sentry/node");
const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const ensureHodSchema = require("./utils/ensureHodSchema");
const ensureAttendanceSchema = require("./utils/ensureAttendanceSchema");
const ensureAttendanceLifecycleSchema = require("./utils/ensureAttendanceLifecycleSchema");
const ensureUuidSchema = require("./utils/ensureUuidSchema");
const SessionStore = require("./utils/sessionStore");
const sessionAuth = require("./middleware/sessionAuth");
const checkRole = require("./middleware/checkRole");
const { apiLimiter } = require("./middleware/rateLimiters");
const { registerBodyParsers } = require("./middleware/requestBody");
const { createCorsMiddleware, logCorsConfig } = require("./middleware/corsConfig");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const fs = require("fs");

const formatDir = fs.existsSync(path.join(__dirname, "format"))
  ? path.join(__dirname, "format")
  : path.join(__dirname, "..", "format");

const venueRoutes = require("./routes/venueRoutes");
const seatingRoutes = require("./routes/seatingRoutes");
const examRoutes = require("./routes/examRoutes");
const studentRoutes = require("./routes/studentRoutes");
const importRouter = require("./routes/import");
const authRoutes = require("./routes/authRoutes");
const microsoftAuthRoutes = require("./routes/microsoftAuthRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const facultyRoutes = require("./routes/facultyRoutes");
const userManagementRoutes = require("./routes/userManagementRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const ineligibilityRoutes = require("./routes/ineligibilityRoutes");
const timetableRoutes = require("./routes/timetableRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const facultyAttendanceRoutes = require("./routes/facultyAttendanceRoutes");
const facultyTransferRoutes = require("./routes/facultyTransferRoutes");
const academicRoutes = require("./routes/academicRoutes");
const mentorRoutes = require("./routes/mentorRoutes");
const mentorAuthRoutes = require("./routes/mentorAuthRoutes");
const mentorPortalRoutes = require("./routes/mentorPortalRoutes");
const ensureAcademicSchema = require("./utils/ensureAcademicSchema");
const ensureTransferSchema = require("./utils/ensureTransferSchema");
const ensureEnterpriseSchema = require("./utils/ensureEnterpriseSchema");
const ensureBatchSchema = require("./utils/ensureBatchSchema");
const ensureMentorSchema = require("./utils/ensureMentorSchema");
const ensureMentorAuthSchema = require("./utils/ensureMentorAuthSchema");
const ensureStudentIndexes = require("./utils/ensureStudentIndexes");

const app = express();
const PORT = process.env.PORT || 5000;

app.set("trust proxy", 1);

// CORS must run before body parsers, routes, and auth (see middleware/corsConfig.js)
app.use(createCorsMiddleware());

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cookieParser());

// Body parsers MUST run before /api routes and rate limiters (see middleware/requestBody.js)
registerBodyParsers(app);

app.use("/api", apiLimiter);

app.use(
  "/format",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  express.static(formatDir)
);

app.get("/health", (_req, res) => {
  res.json({ status: "OK" });
});

app.use("/api/venues", venueRoutes);
app.use("/api/seating", seatingRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/academic", academicRoutes);
app.use("/api/import", importRouter);
app.use("/api/faculty", facultyRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth/microsoft", microsoftAuthRoutes);
app.use("/api/users", userManagementRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/ineligibility", ineligibilityRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/faculty-attendance", facultyAttendanceRoutes);
app.use("/api/faculty-transfers", facultyTransferRoutes);
app.use("/api/mentors", mentorRoutes);
app.use("/api/auth/mentor", mentorAuthRoutes);
app.use("/api/mentor-portal", mentorPortalRoutes);

Sentry.setupExpressErrorHandler(app);
app.use(notFoundHandler);
app.use(errorHandler);

const { connectWithRetry } = require("./config/db");

const STARTUP_MAX_ATTEMPTS = 20;
const STARTUP_RETRY_DELAY_MS = 3000;

async function start() {
  for (let attempt = 1; attempt <= STARTUP_MAX_ATTEMPTS; attempt++) {
    try {
      await connectWithRetry();
      await SessionStore.connect();
      await ensureHodSchema();
      await ensureAttendanceSchema();
      await ensureAttendanceLifecycleSchema();
      await ensureTransferSchema();
      await ensureAcademicSchema();
      await ensureEnterpriseSchema();
      await ensureBatchSchema();
      await ensureMentorSchema();
      await ensureMentorAuthSchema();
      await ensureStudentIndexes();
      await ensureUuidSchema();
      break;
    } catch (e) {
      const isLast = attempt === STARTUP_MAX_ATTEMPTS;
      console.error(
        `Startup attempt ${attempt}/${STARTUP_MAX_ATTEMPTS} failed:`,
        e.message
      );
      if (isLast) {
        console.error(
          "Fatal: startup failed. Ensure db and redis containers are running."
        );
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, STARTUP_RETRY_DELAY_MS));
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    logCorsConfig();
    console.log(
      `Server listening on 0.0.0.0:${PORT} (${process.env.NODE_ENV || "development"})`
    );
  });
}

start();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
