const express = require("express");
const router = express.Router();
const Faculty = require("../models/Faculty");
const User = require("../models/User");
const Role = require("../models/Role");
const db = require("../config/db");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const { insertField } = require("../utils/ownerFilter");
const Api = require("../utils/apiResponse");
const { resolveEntity } = require("../middleware/resolvePublicId");
const { TABLE } = require("../utils/publicId");
const {
  passwordFromEmail,
  isValidKctEmail,
  hashPassword,
} = require("../utils/password");

const ownerOpts = (req) => ({
  ownerUserId: req.user?.id,
  role: req.user?.role,
  department: req.user?.department,
});

router.get("/", sessionAuth, checkRole(["admin", "faculty_incharge", "hod"]), async (req, res) => {
  try {
    const data = await Faculty.getAllWithAllocation(ownerOpts(req));
    res.json(data);
  } catch (err) {
    return Api.serverError(res, err, "GET /faculty");
  }
});

router.get("/stats", sessionAuth, checkRole(["admin", "faculty_incharge", "hod"]), async (req, res) => {
  try {
    const stats = await Faculty.count(ownerOpts(req));
    res.json(stats);
  } catch (err) {
    return Api.serverError(res, err, "GET /faculty/stats");
  }
});

router.post("/", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  let conn;
  try {
    const { name, department, email: rawEmail } = req.body;
    const email = String(rawEmail || "").trim().toLowerCase();

    if (!name?.trim() || !email) {
      return Api.validationError(res, "Name and email are required");
    }
    if (!isValidKctEmail(email)) {
      return Api.validationError(res, "Enter a valid college email (@kct.ac.in)");
    }

    const existingFaculty = await Faculty.findByEmail(email);
    if (existingFaculty) {
      const inactive =
        existingFaculty.is_active === false || existingFaculty.isactive === false;
      if (inactive) {
        await Faculty.reactivateById(existingFaculty.id, {
          name: name.trim(),
          department: department?.trim() || null,
        });
        const plainPassword = passwordFromEmail(email);
        return Api.success(
          res,
          "Faculty restored to active management (was previously removed).",
          { email, restored: true, generatedPassword: plainPassword },
          200
        );
      }
      return Api.conflict(res, "DUPLICATE_EMAIL", "Faculty with this email already exists.");
    }

    const existingUser = await User.findByEmailAny(email);
    if (existingUser) {
      return Api.conflict(res, "DUPLICATE_EMAIL", "A user account with this email already exists.");
    }

    const plainPassword = passwordFromEmail(email);
    const username = plainPassword;
    const existingUsername = await User.findByUsername(username);
    if (existingUsername) {
      return Api.conflict(res, "DUPLICATE_USERNAME", "Username derived from email is already taken.");
    }

    const fiRole = await Role.getByName("faculty");
    if (!fiRole) {
      return Api.serverError(res, new Error("Faculty role missing"), "POST /faculty");
    }

    const hashedPassword = await hashPassword(plainPassword);
    const opts = ownerOpts(req);
    const { col, val } = insertField(opts.role, opts.ownerUserId);
    const facultyVals = [name.trim(), department?.trim() || null, email];
    if (val != null) facultyVals.push(val);

    conn = await db.getConnection();
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO faculty (name, department, email${col}) VALUES (?, ?, ?${val != null ? ", ?" : ""})`,
      facultyVals
    );

    await conn.query(
      `INSERT INTO users (username, email, password, role_id, department, created_by, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, FALSE)`,
      [username, email, hashedPassword, fiRole.id, department?.trim() || null, req.user?.id || null]
    );

    await conn.commit();

    return Api.success(
      res,
      "Faculty added successfully",
      { email, generatedPassword: plainPassword },
      201
    );
  } catch (err) {
    if (conn) await conn.rollback();
    if (err.code === "ER_DUP_ENTRY" || err.code === "23505") {
      return Api.conflict(res, "DUPLICATE_RECORD", "Faculty or user with this email already exists.");
    }
    return Api.serverError(res, err, "POST /faculty");
  } finally {
    if (conn) conn.release();
  }
});

router.put("/:uuid/max-classrooms", sessionAuth, checkRole(["admin", "faculty_incharge"]), resolveEntity(TABLE.faculty), async (req, res) => {
  try {
    const max = Number(req.body.max_classrooms);
    if (!Number.isFinite(max) || max < 1 || max > 20) {
      return Api.validationError(res, "max_classrooms must be between 1 and 20");
    }
    const updated = await Faculty.updateMaxClassrooms(req.internalId, max, ownerOpts(req));
    if (!updated) {
      return Api.notFound(res, "Faculty not found or not allowed");
    }
    return Api.success(res, "Max classrooms updated");
  } catch (err) {
    return Api.serverError(res, err, "PUT /faculty/max-classrooms");
  }
});

router.put("/:uuid/availability", sessionAuth, checkRole(["admin", "faculty_incharge"]), resolveEntity(TABLE.faculty), async (req, res) => {
  try {
    const { isAvailable } = req.body || {};
    if (typeof isAvailable !== "boolean") {
      return Api.validationError(res, "isAvailable (boolean) is required");
    }
    const updated = await Faculty.updateAvailability(req.internalId, isAvailable, ownerOpts(req));
    if (!updated) {
      return Api.notFound(res, "Faculty not found or not allowed");
    }
    return Api.success(res, "Availability updated", { isAvailable });
  } catch (err) {
    return Api.serverError(res, err, "PUT /faculty/availability");
  }
});

router.delete("/:uuid", sessionAuth, checkRole(["admin", "faculty_incharge"]), resolveEntity(TABLE.faculty), async (req, res) => {
  try {
    const facultyId = req.internalId;

    // Soft-delete only — never block on seating/attendance assignments.
    // Historical plans keep faculty_id; faculty row stays with is_active=false.
    const deleted = await Faculty.softDeleteById(facultyId, ownerOpts(req));
    if (!deleted) {
      return Api.notFound(res, "Faculty not found or already removed");
    }

    return Api.success(
      res,
      "Faculty removed from active management. Historical seating and attendance data were preserved."
    );
  } catch (err) {
    console.error("FACULTY SOFT DELETE ERROR:", err);
    return Api.fromError(res, err);
  }
});

router.get("/:uuid/can-allocate", sessionAuth, checkRole(["admin", "faculty_incharge", "hod"]), resolveEntity(TABLE.faculty, { allowLegacyNumeric: true }), async (req, res) => {
  try {
    const summary = await Faculty.getCapacitySummary(req.internalId);
    if (!summary) {
      return Api.notFound(res, "Faculty not found");
    }
    const allowed =
      summary.isActive &&
      summary.isAvailable &&
      summary.remaining > 0;
    return Api.success(
      res,
      allowed
        ? "Faculty can be allocated"
        : "Faculty allocation limit reached. This faculty currently has no remaining allocation capacity.",
      {
        allowed,
        maxClassrooms: summary.maxClassrooms,
        allocation: summary.allocation,
        remaining: summary.remaining,
      }
    );
  } catch (err) {
    return Api.serverError(res, err, "GET /faculty/can-allocate");
  }
});

module.exports = router;
