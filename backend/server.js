// IMPORTANT: instrument.js must be the very first import
require("./instrument.js");

const Sentry = require("@sentry/node");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const db = require("./config/db");

// --- Route Imports ---
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

const app = express();
const PORT = process.env.PORT || 5000;

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// --- Health Check ---
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// --- Debug Sentry (remove after testing) ---
app.get("/debug-sentry", function (req, res) {
  throw new Error("Sentry test error from ClassAssign!");
});

// --- Mount Routes ---
app.use("/api/venues", venueRoutes);
app.use("/api/seating", seatingRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/import", importRouter);
app.use("/api/faculty", facultyRoutes);

// AUTH ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/auth/microsoft", microsoftAuthRoutes);

// USER MANAGEMENT (ADMIN ONLY)
app.use("/api/users", userManagementRoutes);

// AUDIT LOGS (ADMIN ONLY)
app.use("/api/audit-logs", auditLogRoutes);

// INELIGIBILITY
app.use("/api/ineligibility", ineligibilityRoutes);

// TIMETABLE
app.use("/api/timetable", timetableRoutes);

// NOTIFICATIONS
app.use("/api/notifications", notificationRoutes);

// --- Sentry Error Handler ---
// IMPORTANT: Must be after all routes and before other error middleware
Sentry.setupExpressErrorHandler(app);

// --- Error Handler ---
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// --- 404 Handler ---
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    path: req.path
  });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║                                                ║
║   🚀 KCT Exam Seating System Server           ║
║                                                ║
║   Port: ${PORT}                                    ║
║   Environment: ${process.env.NODE_ENV || 'development'}                    ║
║   Time: ${new Date().toLocaleString()}         ║
║                                                ║
║   Routes:                                      ║
║   - /api/auth (Login & SSO)                    ║
║   - /api/users (User Management - Admin)       ║
║   - /api/audit-logs (Audit Logs - Admin)       ║
║   - /api/timetable (Timetable Management)      ║
║   - /api/venues                                ║
║   - /api/seating                               ║
║   - /api/faculty                               ║
║                                                ║
╚════════════════════════════════════════════════╝
  `);
});

// --- Graceful Shutdown ---
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 SIGINT received, shutting down gracefully...');
  process.exit(0);
});