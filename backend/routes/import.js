//import.js
const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");

const Student = require("../models/Student");
const Faculty = require("../models/Faculty");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

let lastFacultyImport = {
  insertedIds: [],
  skippedEmails: []
};

let lastStudentImport = {
  insertedIds: []
};


/* =====================================================
   DELETE ALL STUDENTS
===================================================== */
router.delete("/delete-all-students", async (req, res) => {
  try {
    await Student.deleteAll();
    res.json({ message: "Successfully deleted all student records." });
  } catch (error) {
    res.status(500).json({
      message: "Server error during student deletion.",
      error: error.message
    });
  }
});

/* =====================================================
   IMPORT STUDENTS FROM EXCEL
===================================================== */
router.post("/import-students", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    const formattedData = data
      .map(row => ({
        regnNo: row["Regn. No."]?.trim(),
        studentName: row["Student Name"]?.trim(),
        courseDescription: row["Course Description"]?.trim(),
        courseName: row["Course Name"]?.trim(),
        email: row["Email"]?.trim() || null
      }))
      .filter(row => {
        const desc = row.courseDescription;
        return (
          row.regnNo &&
          desc &&
          !desc.endsWith("L") &&
          !desc.includes("L-R21") &&
          !desc.includes("MENTOR")
        );
      });

    if (!formattedData.length) {
      return res.status(400).json({
        message: "No valid student records found."
      });
    }

    // ✅ RESET undo tracker
    lastStudentImport = { insertedIds: [] };

    // ✅ INSERT ONE-BY-ONE (UNDO SAFE)
    for (const s of formattedData) {
      const insertId = await Student.insertOne(s);
      lastStudentImport.insertedIds.push(insertId);
    }

    res.json({
      message: "Students imported successfully",
      inserted: lastStudentImport.insertedIds.length
    });

  } catch (error) {
    console.error("STUDENT IMPORT ERROR:", error);
    res.status(500).json({
      message: "Server error during student import.",
      error: error.message
    });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});


/* =====================================================
   DELETE ALL FACULTY
===================================================== */
router.delete("/delete-all-faculty", async (req, res) => {
  try {
    await Faculty.deleteAll();
    res.json({ message: "Successfully deleted all faculty records." });
  } catch (error) {
    res.status(500).json({
      message: "Server error during faculty deletion.",
      error: error.message
    });
  }
});

/* =====================================================
   IMPORT FACULTY FROM EXCEL (DUPLICATE SAFE)
===================================================== */
router.post("/import-faculty", upload.single("file"), async (req, res) => {
  try {
    lastFacultyImport = { insertedIds: [], skippedEmails: [] };

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    const formattedData = data
      .map(row => ({
        name: row["NAME"]?.trim(),
        department: row["DEPT"]?.trim(),
        email: row["MAIL"]?.trim()
      }))
      .filter(f => f.name && f.email && f.email.endsWith("@kct.ac.in"));

    if (formattedData.length === 0) {
      return res.status(400).json({
        message: "No valid faculty records found in Excel."
      });
    }

    for (const f of formattedData) {
      try {
        const [result] = await Faculty.create(f);
        lastFacultyImport.insertedIds.push(result.insertId);
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
          lastFacultyImport.skippedEmails.push(f.email);
        } else {
          throw err;
        }
      }
    }

    res.json({
      message: "Faculty import completed",
      inserted: lastFacultyImport.insertedIds.length,
      skipped: lastFacultyImport.skippedEmails.length,
      skippedEmails: lastFacultyImport.skippedEmails
    });

  } catch (error) {
    console.error("FACULTY IMPORT ERROR:", error);
    res.status(500).json({
      message: "Faculty import failed",
      error: error.message
    });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

router.get("/last-faculty-import", (req, res) => {
  res.json(lastFacultyImport);
});

router.post("/undo-faculty-import", async (req, res) => {
  try {
    if (lastFacultyImport.insertedIds.length === 0) {
      return res.status(400).json({
        message: "No import to undo"
      });
    }

    await Faculty.deleteByIds(lastFacultyImport.insertedIds);

    const deletedCount = lastFacultyImport.insertedIds.length;

    lastFacultyImport = { insertedIds: [], skippedEmails: [] };

    res.json({
      message: `Undo successful. Removed ${deletedCount} faculty records.`
    });
  } catch (error) {
    res.status(500).json({
      message: "Undo failed",
      error: error.message
    });
  }
});

router.get("/last-student-import", (req, res) => {
  res.json(lastStudentImport);
});


router.post("/undo-student-import", async (req, res) => {
  try {
    if (!lastStudentImport.insertedIds.length) {
      return res.status(400).json({
        message: "No student import to undo"
      });
    }

    await Student.deleteByIds(lastStudentImport.insertedIds);

    const count = lastStudentImport.insertedIds.length;
    lastStudentImport = { insertedIds: [] };

    res.json({
      message: `Undo successful. Removed ${count} students.`
    });
  } catch (error) {
    res.status(500).json({
      message: "Undo student import failed",
      error: error.message
    });
  }
});

module.exports = router;
