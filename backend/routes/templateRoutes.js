// templateRoutes.js - Serve Excel template downloads from /format folder
const express = require("express");
const path = require("path");
const fs = require("fs");
const sessionAuth = require("../middleware/sessionAuth");

const router = express.Router();

// Format folder: ../format when Docker-mounted at /app/format, else ../../format (project root)
const formatInApp = path.join(__dirname, "../format");
const formatInProject = path.join(__dirname, "../../format");
const FORMAT_DIR = fs.existsSync(formatInApp) ? formatInApp : formatInProject;

const TEMPLATES = {
  venue: { file: "venue_import.xlsx", name: "Venue Import" },
  faculty: { file: "faculty_import_template_CORRECT.xlsx", name: "Faculty Import" },
  student: { file: "student_import_template_CORRECT.xlsx", name: "Student Import" },
  timetable: { file: "Timetable_Bulk_Import_Template.xlsx", name: "Timetable Bulk Import" },
};

router.get("/:type", sessionAuth, (req, res) => {
  const { type } = req.params;
  const template = TEMPLATES[type];
  if (!template) {
    return res.status(404).json({ error: "Template not found", validTypes: Object.keys(TEMPLATES) });
  }

  const filePath = path.join(FORMAT_DIR, template.file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `Template file not found: ${template.file}` });
  }

  res.download(filePath, template.file, (err) => {
    if (err && !res.headersSent) {
      console.error("Template download error:", err);
      res.status(500).json({ error: "Failed to download template" });
    }
  });
});

module.exports = router;
