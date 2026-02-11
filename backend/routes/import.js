//import.js - WITH VENUE BULK IMPORT
const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");

const Student = require("../models/Student");
const Faculty = require("../models/Faculty");
const Venue = require("../models/venue");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

let lastFacultyImport = {
  insertedIds: [],
  skippedEmails: []
};

let lastStudentImport = {
  insertedIds: []
};

// ✅ NEW: Track venue imports for undo
let lastVenueImport = {
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

    lastStudentImport = { insertedIds: [] };

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

// IMPROVED: import.js - Venue Import Section with Better Error Messages

/* =====================================================
   ✅ IMPROVED: IMPORT VENUES FROM EXCEL
   
   Excel Format:
   | Venue Name | Type      | Rows | Columns | Bench Config    |
   |------------|-----------|------|---------|-----------------|
   | AD101      | classroom | 10   | 5       | 2,2,3,3,2       |
   | B201       | lab       | 8    | 4       | 2,2,2,2         |
   
   ⚠️ CRITICAL: Bench Config must be EXACTLY like: 2,2,3,3,2
   - NO SPACES after commas
   - NO PREFIX (like "5 2,2,3")
   - Only numbers 2 or 3
===================================================== */
router.post("/import-venues", upload.single("file"), async (req, res) => {
  try {
    lastVenueImport = { insertedIds: [] };

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    const formattedData = [];
    const skippedRecords = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // Excel row (accounting for header)
      
      try {
        const name = row["Venue Name"]?.toString().trim();
        const type = row["Type"]?.toString().trim().toLowerCase();
        const benchesRow = parseInt(row["Rows"]);
        const benchesCol = parseInt(row["Columns"]);
        const benchConfigStr = row["Bench Config"]?.toString().trim();

        // ✅ STEP 1: Check required fields
        if (!name || !type || !benchesRow || !benchesCol || !benchConfigStr) {
          skippedRecords.push(
            `Row ${rowNum}: ${name || "Unknown"} - Missing required fields`
          );
          continue;
        }

        // ✅ STEP 2: Validate type
        if (!["classroom", "lab", "hall"].includes(type)) {
          skippedRecords.push(
            `Row ${rowNum}: ${name} - Invalid type "${type}". Must be: classroom, lab, or hall`
          );
          continue;
        }

        // ✅ STEP 3: Parse bench config
        console.log(`Row ${rowNum} (${name}): Raw Bench Config = "${benchConfigStr}"`);
        
        // Remove any leading/trailing spaces and split
        const benchConfig = benchConfigStr
          .split(",")
          .map(s => {
            const trimmed = s.trim();
            const num = parseInt(trimmed);
            
            // ⚠️ DETECT COMMON ERROR: "5 2" instead of "2"
            if (trimmed.includes(" ")) {
              throw new Error(
                `Invalid format "${trimmed}" - contains space. ` +
                `Expected single number (2 or 3). ` +
                `Check for prefix like "5 2,2,3"`
              );
            }
            
            return num;
          })
          .filter(n => !isNaN(n));

        console.log(`Row ${rowNum} (${name}): Parsed config = [${benchConfig.join(", ")}]`);

        // ✅ STEP 4: Validate config length
        if (benchConfig.length !== benchesCol) {
          skippedRecords.push(
            `Row ${rowNum}: ${name} - Bench config has ${benchConfig.length} values ` +
            `but Columns is ${benchesCol}. They must match!\n` +
            `  Raw value: "${benchConfigStr}"\n` +
            `  Parsed as: [${benchConfig.join(", ")}]\n` +
            `  Expected: ${benchesCol} comma-separated values like "2,2,3,3,2"`
          );
          continue;
        }

        // ✅ STEP 5: Validate seat counts (2 or 3 only)
        const invalidSeats = benchConfig.filter(s => s !== 2 && s !== 3);
        if (invalidSeats.length > 0) {
          skippedRecords.push(
            `Row ${rowNum}: ${name} - Invalid seat counts: [${invalidSeats.join(", ")}]. ` +
            `Only 2 or 3 allowed!`
          );
          continue;
        }

        // ✅ All validation passed
        formattedData.push({
          name,
          type,
          benchesRow,
          benchesCol,
          benchConfig
        });

      } catch (err) {
        skippedRecords.push(`Row ${rowNum}: ${err.message}`);
      }
    }

    if (formattedData.length === 0) {
      return res.status(400).json({
        message: "❌ No valid venue records found in Excel.",
        skippedRecords
      });
    }

    // ✅ Insert venues one by one
    let insertedCount = 0;
    const duplicates = [];

    for (const venue of formattedData) {
      try {
        const venueId = await Venue.create(venue);
        lastVenueImport.insertedIds.push(venueId);
        insertedCount++;
        
        console.log(`✅ Inserted: ${venue.name} (${venue.type}) - ID: ${venueId}`);
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
          duplicates.push(`${venue.name} (${venue.type})`);
        } else {
          skippedRecords.push(`${venue.name} - Database error: ${err.message}`);
        }
      }
    }

    res.json({
      message: "✅ Venue import completed",
      inserted: insertedCount,
      skipped: skippedRecords.length + duplicates.length,
      skippedRecords: skippedRecords.length > 0 ? skippedRecords : undefined,
      duplicates: duplicates.length > 0 ? duplicates : undefined
    });

  } catch (error) {
    console.error("❌ VENUE IMPORT ERROR:", error);
    res.status(500).json({
      message: "Venue import failed",
      error: error.message
    });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

/* =====================================================
   UNDO ROUTES
===================================================== */
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

// ✅ NEW: Undo venue import
router.get("/last-venue-import", (req, res) => {
  res.json(lastVenueImport);
});

router.post("/undo-venue-import", async (req, res) => {
  try {
    if (!lastVenueImport.insertedIds.length) {
      return res.status(400).json({
        message: "No venue import to undo"
      });
    }

    await Venue.deleteByIds(lastVenueImport.insertedIds);

    const count = lastVenueImport.insertedIds.length;
    lastVenueImport = { insertedIds: [] };

    res.json({
      message: `Undo successful. Removed ${count} venues.`
    });
  } catch (error) {
    res.status(500).json({
      message: "Undo venue import failed",
      error: error.message
    });
  }
});

module.exports = router;