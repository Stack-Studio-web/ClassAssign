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


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// --- Mount Routes ---
app.use("/api/venues", venueRoutes);
app.use("/api/seating", seatingRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/import", importRouter);
app.use("/api/faculty", facultyRoutes);

// AUTH
app.use("/api/auth", authRoutes);
app.use("/api/auth/microsoft", microsoftAuthRoutes);

// NOTIFICATIONS
app.use("/api/notifications", notificationRoutes);

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
