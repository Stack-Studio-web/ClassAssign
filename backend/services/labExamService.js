const db = require("../config/db");
const Venue = require("../models/venue");
const Faculty = require("../models/Faculty");
const SeatingPlan = require("../models/SeatingPlan");
const AttendanceService = require("./attendanceService");
const { normalizeFacultyEmail } = require("../utils/facultyIdentity");
const {
  parseLabStudentRows,
  summarizeFacultyCounts,
  readWorkbookSheets,
} = require("../utils/labStudentImport");
const { TABLE, getPublicUuid, resolveInternalId } = require("../utils/publicId");
const { lockFacultyRowsForUpdate } = require("../utils/facultyTimeConflict");

const STATUSES = ["draft", "validated", "finalized", "attendance_open", "completed"];

function normalizeDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  return str.includes("T") ? str.split("T")[0] : str.slice(0, 10);
}

function normalizeTime(value) {
  if (value == null || value === "") return null;
  const match = String(value).trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function toExamRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    uuid: row.public_uuid ?? row.publicuuid,
    title: row.title,
    department: row.department,
    examDate: normalizeDate(row.exam_date ?? row.examdate),
    status: row.status,
    notes: row.notes,
    ownerUserId: row.owner_user_id ?? row.owneruserid,
    createdAt: row.created_at ?? row.createdat,
    updatedAt: row.updated_at ?? row.updatedat,
  };
}

function toSlotRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    uuid: row.public_uuid ?? row.publicuuid,
    labExamId: row.lab_exam_id ?? row.labexamid,
    slotIndex: Number(row.slot_index ?? row.slotindex ?? 1),
    startTime: normalizeTime(row.start_time ?? row.starttime),
    endTime: normalizeTime(row.end_time ?? row.endtime),
    status: row.status,
    seatingPlanId: row.seating_plan_id ?? row.seatingplanid ?? null,
    seatingPlanUuid: row.seating_plan_uuid ?? row.seatingplanuuid ?? null,
  };
}

async function resolveFacultyByEmails(emails, executor = db) {
  const unique = [...new Set((emails || []).map(normalizeFacultyEmail).filter(Boolean))];
  const map = new Map();
  if (!unique.length) return map;

  const placeholders = unique.map(() => "?").join(", ");
  const [rows] = await executor.query(
    `SELECT id, public_uuid, name, email, department, is_active, is_available
     FROM faculty
     WHERE LOWER(TRIM(email)) IN (${placeholders})`,
    unique
  );

  for (const row of rows || []) {
    const email = normalizeFacultyEmail(row.email);
    if (!map.has(email)) {
      map.set(email, {
        id: row.id,
        uuid: row.public_uuid ?? row.publicuuid,
        name: row.name,
        email,
        department: row.department,
        isActive: row.is_active !== false && row.isactive !== false,
        isAvailable: row.is_available !== false && row.isavailable !== false,
      });
    }
  }
  return map;
}

async function getExamByUuid(uuid, executor = db) {
  const id = await resolveInternalId("lab_exams", uuid, { allowLegacyNumeric: true });
  if (!id) return null;
  const [rows] = await executor.query(`SELECT * FROM lab_exams WHERE id = ?`, [id]);
  return rows?.[0] ? toExamRow(rows[0]) : null;
}

async function getExamInternal(uuidOrId, executor = db) {
  const id = await resolveInternalId("lab_exams", uuidOrId, { allowLegacyNumeric: true });
  if (!id) return null;
  const [rows] = await executor.query(`SELECT * FROM lab_exams WHERE id = ?`, [id]);
  return rows?.[0] || null;
}

async function getSlotInternal(uuidOrId, executor = db) {
  const id = await resolveInternalId("lab_exam_slots", uuidOrId, {
    allowLegacyNumeric: true,
  });
  if (!id) return null;
  const [rows] = await executor.query(`SELECT * FROM lab_exam_slots WHERE id = ?`, [id]);
  return rows?.[0] || null;
}

async function listExams({ department = null } = {}) {
  const params = [];
  let sql = `SELECT * FROM lab_exams`;
  if (department) {
    sql += ` WHERE department = ?`;
    params.push(department);
  }
  sql += ` ORDER BY exam_date DESC, id DESC`;
  const [rows] = await db.query(sql, params);
  return (rows || []).map(toExamRow);
}

async function createExam(
  { title, department, examDate, notes = null },
  { ownerUserId = null } = {}
) {
  const dateOnly = normalizeDate(examDate);
  if (!title || !dateOnly) {
    const err = new Error("Title and exam date are required");
    err.statusCode = 400;
    throw err;
  }

  const [result] = await db.query(
    `INSERT INTO lab_exams (title, department, exam_date, status, owner_user_id, notes)
     VALUES (?, ?, ?, 'draft', ?, ?)
     RETURNING id`,
    [String(title).trim(), department || null, dateOnly, ownerUserId, notes]
  );
  const examId = result?.insertId ?? result?.[0]?.id ?? result?.id;
  const [rows] = await db.query(`SELECT * FROM lab_exams WHERE id = ?`, [examId]);
  return toExamRow(rows?.[0]);
}

async function updateExam(uuid, { title, department, examDate, notes, status }) {
  const exam = await getExamInternal(uuid);
  if (!exam) {
    const err = new Error("LAB exam not found");
    err.statusCode = 404;
    throw err;
  }
  if (exam.status === "finalized" || exam.status === "completed") {
    const err = new Error("Finalized LAB exams cannot be edited");
    err.statusCode = 400;
    throw err;
  }

  const nextTitle = title != null ? String(title).trim() : exam.title;
  const nextDept = department !== undefined ? department : exam.department;
  const nextDate = examDate != null ? normalizeDate(examDate) : normalizeDate(exam.exam_date);
  const nextNotes = notes !== undefined ? notes : exam.notes;
  const nextStatus =
    status && STATUSES.includes(status) ? status : exam.status;

  await db.query(
    `UPDATE lab_exams
     SET title = ?, department = ?, exam_date = ?, notes = ?, status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [nextTitle, nextDept, nextDate, nextNotes, nextStatus, exam.id]
  );
  return getExamByUuid(exam.public_uuid || uuid);
}

async function listSlots(examUuid) {
  const exam = await getExamInternal(examUuid);
  if (!exam) {
    const err = new Error("LAB exam not found");
    err.statusCode = 404;
    throw err;
  }
  const [rows] = await db.query(
    `SELECT s.*, sp.public_uuid AS seating_plan_uuid
     FROM lab_exam_slots s
     LEFT JOIN seating_plans sp ON sp.id = s.seating_plan_id
     WHERE s.lab_exam_id = ?
     ORDER BY s.slot_index ASC`,
    [exam.id]
  );
  return (rows || []).map(toSlotRow);
}

async function addSlot(examUuid, { startTime, endTime, slotIndex = null }) {
  const exam = await getExamInternal(examUuid);
  if (!exam) {
    const err = new Error("LAB exam not found");
    err.statusCode = 404;
    throw err;
  }
  if (exam.status === "finalized" || exam.status === "completed") {
    const err = new Error("Cannot add slots to a finalized LAB exam");
    err.statusCode = 400;
    throw err;
  }

  const start = normalizeTime(startTime);
  const end = normalizeTime(endTime);
  if (!start || !end || start >= end) {
    const err = new Error("Valid start and end times are required");
    err.statusCode = 400;
    throw err;
  }

  let index = slotIndex;
  if (index == null) {
    const [maxRows] = await db.query(
      `SELECT COALESCE(MAX(slot_index), 0) AS max_idx FROM lab_exam_slots WHERE lab_exam_id = ?`,
      [exam.id]
    );
    index = Number(maxRows?.[0]?.max_idx ?? maxRows?.[0]?.maxidx ?? 0) + 1;
  }

  await db.query(
    `INSERT INTO lab_exam_slots (lab_exam_id, slot_index, start_time, end_time, status)
     VALUES (?, ?, ?, ?, 'draft')`,
    [exam.id, index, start, end]
  );

  await db.query(
    `UPDATE lab_exams SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [exam.id]
  );

  const slots = await listSlots(exam.public_uuid || examUuid);
  return slots.find((s) => s.slotIndex === Number(index)) || slots[slots.length - 1];
}

async function updateSlot(slotUuid, { startTime, endTime, slotIndex }) {
  const slot = await getSlotInternal(slotUuid);
  if (!slot) {
    const err = new Error("LAB slot not found");
    err.statusCode = 404;
    throw err;
  }
  if (slot.status === "finalized") {
    const err = new Error("Finalized slots cannot be edited");
    err.statusCode = 400;
    throw err;
  }

  const start = startTime != null ? normalizeTime(startTime) : normalizeTime(slot.start_time);
  const end = endTime != null ? normalizeTime(endTime) : normalizeTime(slot.end_time);
  if (!start || !end || start >= end) {
    const err = new Error("Valid start and end times are required");
    err.statusCode = 400;
    throw err;
  }
  const index =
    slotIndex != null ? Number(slotIndex) : Number(slot.slot_index ?? 1);

  await db.query(
    `UPDATE lab_exam_slots
     SET start_time = ?, end_time = ?, slot_index = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [start, end, index, slot.id]
  );
  const [rows] = await db.query(
    `SELECT s.*, sp.public_uuid AS seating_plan_uuid
     FROM lab_exam_slots s
     LEFT JOIN seating_plans sp ON sp.id = s.seating_plan_id
     WHERE s.id = ?`,
    [slot.id]
  );
  return toSlotRow(rows?.[0]);
}

async function setSlotVenues(slotUuid, venueUuids = []) {
  const slot = await getSlotInternal(slotUuid);
  if (!slot) {
    const err = new Error("LAB slot not found");
    err.statusCode = 404;
    throw err;
  }
  if (slot.status === "finalized") {
    const err = new Error("Cannot change venues on a finalized slot");
    err.statusCode = 400;
    throw err;
  }

  const [examRows] = await db.query(`SELECT * FROM lab_exams WHERE id = ?`, [
    slot.lab_exam_id ?? slot.labexamid,
  ]);
  const exam = examRows?.[0];
  const dateOnly = normalizeDate(exam?.exam_date);
  const start = normalizeTime(slot.start_time);
  const end = normalizeTime(slot.end_time);

  const resolved = [];
  const conflicts = [];
  for (const raw of venueUuids || []) {
    const venueId = await resolveInternalId(TABLE.venues, raw, {
      allowLegacyNumeric: true,
    });
    if (!venueId) {
      conflicts.push({ venueId: raw, message: "Unknown venue" });
      continue;
    }
    const check = await Venue.checkAllotmentSlot(venueId, dateOnly, start, end, db, {
      lock: false,
    });
    // venues has no department column; do not join optional block columns here.
    const [vrows] = await db.query(
      `SELECT v.id, v.public_uuid, v.name, v.capacity, v.block_id
       FROM venues v
       WHERE v.id = ?`,
      [venueId]
    );
    const v = vrows?.[0];
    if (!check.ok) {
      conflicts.push({
        venueId: v?.public_uuid || raw,
        venueName: v?.name || check.venueName,
        message: check.message,
        status: check.status,
      });
      continue;
    }
    if (!v) {
      conflicts.push({ venueId: raw, message: "Venue not found" });
      continue;
    }
    resolved.push({
      id: venueId,
      uuid: v.public_uuid ?? v.publicuuid,
      name: v.name,
      department: null,
      capacity: v.capacity,
    });
  }

  if (conflicts.length) {
    const err = new Error(
      conflicts[0].message || "One or more venues are not available for this slot"
    );
    err.statusCode = 409;
    err.conflicts = conflicts;
    throw err;
  }

  if (!resolved.length) {
    const err = new Error("Select at least one available venue");
    err.statusCode = 400;
    throw err;
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM lab_slot_venues WHERE lab_slot_id = ?`, [slot.id]);
    for (const v of resolved) {
      await conn.query(
        `INSERT INTO lab_slot_venues (lab_slot_id, venue_id) VALUES (?, ?)
         ON CONFLICT (lab_slot_id, venue_id) DO NOTHING`,
        [slot.id, v.id]
      );
    }
    await conn.commit();
  } catch (e) {
    try {
      await conn.rollback();
    } catch (_) {
      /* ignore */
    }
    const msg = String(e?.message || e);
    if (/lab_slot_venues/i.test(msg) && /does not exist/i.test(msg)) {
      const err = new Error(
        "LAB venue table is missing. Restart the API so ensureLabExamSchema can create lab_slot_venues, then retry."
      );
      err.statusCode = 503;
      err.code = "SCHEMA_NOT_READY";
      throw err;
    }
    const err = new Error(msg || "Failed to save LAB venues");
    err.statusCode = 500;
    err.code = "LAB_VENUE_SAVE_FAILED";
    throw err;
  } finally {
    conn.release();
  }

  return listSlotVenues(slot.public_uuid || slotUuid);
}

async function listSlotVenues(slotUuid) {
  const slot = await getSlotInternal(slotUuid);
  if (!slot) {
    const err = new Error("LAB slot not found");
    err.statusCode = 404;
    throw err;
  }
  const [rows] = await db.query(
    `SELECT v.id, v.public_uuid, v.name, v.capacity, v.type,
            b.name AS block_name
     FROM lab_slot_venues lsv
     JOIN venues v ON v.id = lsv.venue_id
     LEFT JOIN blocks b ON b.id = v.block_id
     WHERE lsv.lab_slot_id = ?
     ORDER BY v.name`,
    [slot.id]
  );
  return (rows || []).map((v) => ({
    id: v.id,
    uuid: v.public_uuid ?? v.publicuuid,
    name: v.name,
    department: null,
    capacity: v.capacity,
    type: v.type,
    blockName: v.block_name ?? v.blockname ?? null,
  }));
}

async function previewImport(filePath, { sheetName = null } = {}) {
  const { sheetNames, sheets } = readWorkbookSheets(filePath);
  const selected =
    sheetName && sheets[sheetName]
      ? sheetName
      : sheetNames[0];
  if (!selected) {
    const err = new Error("Workbook has no sheets");
    err.statusCode = 400;
    throw err;
  }

  const parsed = parseLabStudentRows(sheets[selected] || []);
  const facultyMap = await resolveFacultyByEmails(
    parsed.valid.map((r) => r.facultyEmail)
  );

  const resolved = [];
  const unmatchedEmails = [];
  for (const row of parsed.valid) {
    const faculty = facultyMap.get(row.facultyEmail);
    if (!faculty || !faculty.isActive) {
      unmatchedEmails.push({
        ...row,
        reason: faculty
          ? "Faculty is inactive"
          : "No matching active faculty record for this email",
      });
      continue;
    }
    resolved.push({
      ...row,
      facultyId: faculty.id,
      facultyUuid: faculty.uuid,
      facultyName: faculty.name,
    });
  }

  return {
    sheetNames,
    selectedSheet: selected,
    valid: resolved,
    invalid: [...parsed.invalid, ...unmatchedEmails],
    facultySummary: summarizeFacultyCounts(resolved).map((g) => {
      const f = facultyMap.get(g.facultyEmail);
      return {
        ...g,
        facultyName: f?.name || null,
        facultyUuid: f?.uuid || null,
        matched: !!f,
      };
    }),
    counts: {
      valid: resolved.length,
      invalid: parsed.invalid.length + unmatchedEmails.length,
      facultyGroups: summarizeFacultyCounts(resolved).length,
    },
  };
}

async function commitImport(slotUuid, filePath, { sheetName = null, replace = true } = {}) {
  const slot = await getSlotInternal(slotUuid);
  if (!slot) {
    const err = new Error("LAB slot not found");
    err.statusCode = 404;
    throw err;
  }
  if (slot.status === "finalized") {
    const err = new Error("Cannot import into a finalized slot");
    err.statusCode = 400;
    throw err;
  }

  const preview = await previewImport(filePath, { sheetName });
  if (!preview.valid.length) {
    const err = new Error("No valid student rows to import");
    err.statusCode = 400;
    err.preview = preview;
    throw err;
  }

  // Lookup student names from students table when available
  const regns = preview.valid.map((r) => r.regnNo.toLowerCase());
  const placeholders = regns.map(() => "?").join(", ");
  const [studentRows] = await db.query(
    `SELECT DISTINCT ON (LOWER(TRIM(regn_no)))
       regn_no, student_name
     FROM students
     WHERE LOWER(TRIM(regn_no)) IN (${placeholders})
     ORDER BY LOWER(TRIM(regn_no)), id DESC`,
    regns
  );
  const nameByRegn = new Map();
  for (const s of studentRows || []) {
    nameByRegn.set(String(s.regn_no || s.regnno).trim().toLowerCase(), s.student_name || s.studentname);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    if (replace) {
      await conn.query(`DELETE FROM lab_slot_students WHERE lab_slot_id = ?`, [slot.id]);
    }

    for (const row of preview.valid) {
      const name =
        row.studentName ||
        nameByRegn.get(row.regnNo.toLowerCase()) ||
        null;
      await conn.query(
        `INSERT INTO lab_slot_students
           (lab_slot_id, regn_no, course_code, faculty_email, faculty_id,
            student_name, batch_label, import_row)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (lab_slot_id, regn_no) DO UPDATE SET
           course_code = EXCLUDED.course_code,
           faculty_email = EXCLUDED.faculty_email,
           faculty_id = EXCLUDED.faculty_id,
           student_name = COALESCE(EXCLUDED.student_name, lab_slot_students.student_name),
           batch_label = EXCLUDED.batch_label,
           import_row = EXCLUDED.import_row,
           updated_at = CURRENT_TIMESTAMP`,
        [
          slot.id,
          row.regnNo,
          row.courseCode,
          row.facultyEmail,
          row.facultyId,
          name,
          row.batchLabel,
          row.importRow,
        ]
      );
    }

    const hasInvalid = preview.invalid.length > 0;
    await conn.query(
      `UPDATE lab_exam_slots SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [hasInvalid ? "draft" : "validated", slot.id]
    );
    await conn.query(
      `UPDATE lab_exams SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [hasInvalid ? "draft" : "validated", slot.lab_exam_id ?? slot.labexamid]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  return {
    preview,
    students: await listSlotStudents(slot.public_uuid || slotUuid),
  };
}

async function listSlotStudents(slotUuid, { facultyUuid = null, batchLabel = null } = {}) {
  const slot = await getSlotInternal(slotUuid);
  if (!slot) {
    const err = new Error("LAB slot not found");
    err.statusCode = 404;
    throw err;
  }

  const params = [slot.id];
  let sql = `
    SELECT ls.*, f.public_uuid AS faculty_uuid, f.name AS faculty_name,
           v.public_uuid AS venue_uuid, v.name AS venue_name
    FROM lab_slot_students ls
    LEFT JOIN faculty f ON f.id = ls.faculty_id
    LEFT JOIN venues v ON v.id = ls.venue_id
    WHERE ls.lab_slot_id = ?`;

  if (facultyUuid) {
    const fid = await resolveInternalId(TABLE.faculty, facultyUuid, {
      allowLegacyNumeric: true,
    });
    sql += ` AND ls.faculty_id = ?`;
    params.push(fid);
  }
  if (batchLabel) {
    sql += ` AND ls.batch_label = ?`;
    params.push(batchLabel);
  }
  sql += ` ORDER BY ls.regn_no ASC`;

  const [rows] = await db.query(sql, params);
  return (rows || []).map((r) => ({
    uuid: r.public_uuid ?? r.publicuuid,
    regnNo: r.regn_no ?? r.regnno,
    courseCode: r.course_code ?? r.coursecode,
    facultyEmail: r.faculty_email ?? r.facultyemail,
    facultyId: r.faculty_id ?? r.facultyid,
    facultyUuid: r.faculty_uuid ?? r.facultyuuid,
    facultyName: r.faculty_name ?? r.facultyname,
    venueUuid: r.venue_uuid ?? r.venueuuid,
    venueName: r.venue_name ?? r.venuename,
    studentName: r.student_name ?? r.studentname,
    batchLabel: r.batch_label ?? r.batchlabel,
    importRow: r.import_row ?? r.importrow,
  }));
}

async function reassignStudentFaculty(studentUuid, facultyUuid) {
  const sid = await resolveInternalId("lab_slot_students", studentUuid, {
    allowLegacyNumeric: true,
  });
  const facultyId = await resolveInternalId(TABLE.faculty, facultyUuid, {
    allowLegacyNumeric: true,
  });
  if (!sid || !facultyId) {
    const err = new Error("Student or faculty not found");
    err.statusCode = 404;
    throw err;
  }

  const [frows] = await db.query(
    `SELECT id, email, name FROM faculty WHERE id = ? AND COALESCE(is_active, TRUE) = TRUE`,
    [facultyId]
  );
  const faculty = frows?.[0];
  if (!faculty) {
    const err = new Error("Faculty not found or inactive");
    err.statusCode = 400;
    throw err;
  }

  await db.query(
    `UPDATE lab_slot_students
     SET faculty_id = ?, faculty_email = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [facultyId, normalizeFacultyEmail(faculty.email), sid]
  );

  const [rows] = await db.query(
    `SELECT ls.*, f.public_uuid AS faculty_uuid, f.name AS faculty_name
     FROM lab_slot_students ls
     LEFT JOIN faculty f ON f.id = ls.faculty_id
     WHERE ls.id = ?`,
    [sid]
  );
  const r = rows?.[0];
  return {
    uuid: r.public_uuid,
    regnNo: r.regn_no,
    facultyUuid: r.faculty_uuid,
    facultyName: r.faculty_name,
    facultyEmail: r.faculty_email,
  };
}

/**
 * Assign a contiguous range of imported students (by sorted regn order) to a faculty.
 */
async function assignStudentRange(slotUuid, { fromRegn, toRegn, facultyUuid, venueUuid = null }) {
  const slot = await getSlotInternal(slotUuid);
  if (!slot) {
    const err = new Error("LAB slot not found");
    err.statusCode = 404;
    throw err;
  }
  const facultyId = await resolveInternalId(TABLE.faculty, facultyUuid, {
    allowLegacyNumeric: true,
  });
  if (!facultyId) {
    const err = new Error("Faculty not found");
    err.statusCode = 404;
    throw err;
  }

  let venueId = null;
  if (venueUuid) {
    venueId = await resolveInternalId(TABLE.venues, venueUuid, {
      allowLegacyNumeric: true,
    });
  }

  const students = await listSlotStudents(slot.public_uuid || slotUuid);
  const ordered = [...students].sort((a, b) =>
    String(a.regnNo).localeCompare(String(b.regnNo), undefined, { numeric: true })
  );
  const from = String(fromRegn || "").trim();
  const to = String(toRegn || "").trim();
  const startIdx = ordered.findIndex((s) => s.regnNo === from);
  const endIdx = ordered.findIndex((s) => s.regnNo === to);
  if (startIdx < 0 || endIdx < 0 || startIdx > endIdx) {
    const err = new Error(
      "From/To register numbers must exist in the imported list and define a valid range"
    );
    err.statusCode = 400;
    throw err;
  }

  const range = ordered.slice(startIdx, endIdx + 1);
  const [frows] = await db.query(`SELECT email FROM faculty WHERE id = ?`, [facultyId]);
  const email = normalizeFacultyEmail(frows?.[0]?.email);

  for (const s of range) {
    const id = await resolveInternalId("lab_slot_students", s.uuid, {
      allowLegacyNumeric: true,
    });
    await db.query(
      `UPDATE lab_slot_students
       SET faculty_id = ?, faculty_email = ?,
           venue_id = COALESCE(?, venue_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [facultyId, email, venueId, id]
    );
  }

  return {
    updated: range.length,
    registerNumbers: range.map((s) => s.regnNo),
    students: await listSlotStudents(slot.public_uuid || slotUuid),
  };
}

/**
 * Hall-compatible seating layout: row → columns → seats-in-cell.
 * venueAttendanceCourses / seatingLayout both require cells to be arrays of seat objects.
 */
function buildFlatLayout(students) {
  return [
    (students || []).map((s) => [
      {
        regn_no: s.regnNo,
        regnNo: s.regnNo,
        course: s.courseCode,
        courseCode: s.courseCode,
        course_description: s.courseCode,
        student_name: s.studentName || s.regnNo,
        studentName: s.studentName || s.regnNo,
      },
    ]),
  ];
}

/** seating_plans.exam_type is VARCHAR(20); exam_session VARCHAR(10) in base schema. */
function labPlanExamType(exam, courseCodes = []) {
  const course = String(courseCodes[0] || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  if (course) return `LAB-${course}`.slice(0, 20);
  const fromTitle = String(exam?.title || "LAB")
    .trim()
    .replace(/\s+/g, " ");
  return `LAB-${fromTitle}`.slice(0, 20);
}

function labPlanExamSession(slot) {
  const idx = Number(slot?.slot_index ?? slot?.slotindex ?? 1) || 1;
  return `LAB-S${idx}`.slice(0, 10);
}

/**
 * Build finalization summary from imported student→faculty mappings.
 * Faculty page "remaining" counts invigilation duties (SPVF rows), not students.
 * Each distinct faculty in a finalized LAB slot consumes 1 duty.
 */
async function buildFinalizeSummary(students, byFaculty, venuesUsed) {
  const facultyAssignments = [];
  for (const [facultyId, group] of byFaculty.entries()) {
    const sample = group[0];
    const venue =
      venuesUsed.find((v) =>
        (v.facultyIds || []).map(Number).includes(Number(facultyId))
      ) || null;
    const capacity = await Faculty.getCapacitySummary(Number(facultyId));
    facultyAssignments.push({
      facultyId: Number(facultyId),
      facultyUuid: sample.facultyUuid || null,
      facultyName: sample.facultyName || null,
      facultyEmail: sample.facultyEmail || null,
      studentCount: group.length,
      registerNumbers: group.map((s) => s.regnNo),
      venueName: venue?.venueName || null,
      // Counting unit = invigilation duty (room assignment), not student headcount.
      invigilationDutiesCharged: 1,
      maxClassrooms: capacity?.maxClassrooms ?? null,
      allocationAfter: capacity?.allocation ?? null,
      remainingAfter: capacity?.remaining ?? null,
    });
  }
  facultyAssignments.sort((a, b) =>
    String(a.facultyName || "").localeCompare(String(b.facultyName || ""), undefined, {
      sensitivity: "base",
    })
  );
  return {
    totalStudents: students.length,
    mappedStudents: students.filter((s) => s.facultyId).length,
    unresolvedStudents: students.filter((s) => !s.facultyId).length,
    facultyCount: facultyAssignments.length,
    facultyAssignments,
    note:
      "Faculty remaining count deducts 1 invigilation duty per faculty on this LAB slot (not one per student).",
  };
}

/**
 * Finalize a slot using imported lab_slot_students.faculty_id as source of truth.
 * Creates one seating plan + attendance sync. Idempotent if already finalized.
 */
async function finalizeSlot(slotUuid, ownerOpts = {}) {
  const slot = await getSlotInternal(slotUuid);
  if (!slot) {
    const err = new Error("LAB slot not found");
    err.statusCode = 404;
    throw err;
  }

  // Idempotent: already finalized → return existing summary (no double capacity charge).
  if (slot.seating_plan_id || slot.seatingplanid) {
    const students = await listSlotStudents(slot.public_uuid || slotUuid);
    const byFaculty = new Map();
    for (const s of students) {
      if (!s.facultyId) continue;
      const key = String(s.facultyId);
      if (!byFaculty.has(key)) byFaculty.set(key, []);
      byFaculty.get(key).push(s);
    }
    const planId = slot.seating_plan_id || slot.seatingplanid;
    const planUuid = await getPublicUuid(TABLE.seatingPlans, planId);
    const summary = await buildFinalizeSummary(students, byFaculty, []);
    return {
      alreadyFinalized: true,
      seatingPlanId: planId,
      seatingPlanUuid: planUuid,
      attendanceAssignmentsSynced: 0,
      examStatus: "finalized",
      summary,
      slot: toSlotRow({
        ...slot,
        seating_plan_uuid: planUuid,
        status: "finalized",
      }),
    };
  }

  const [examRows] = await db.query(`SELECT * FROM lab_exams WHERE id = ?`, [
    slot.lab_exam_id ?? slot.labexamid,
  ]);
  const exam = examRows?.[0];
  const dateOnly = normalizeDate(exam.exam_date);
  const start = normalizeTime(slot.start_time);
  const end = normalizeTime(slot.end_time);

  const venues = await listSlotVenues(slot.public_uuid || slotUuid);
  if (!venues.length) {
    const err = new Error("Select at least one venue before finalizing");
    err.statusCode = 400;
    throw err;
  }

  const students = await listSlotStudents(slot.public_uuid || slotUuid);
  if (!students.length) {
    const err = new Error("Import students before finalizing");
    err.statusCode = 400;
    throw err;
  }

  const unresolved = students.filter((s) => !s.facultyId);
  if (unresolved.length) {
    const err = new Error(
      `${unresolved.length} student(s) have unresolved faculty emails. Fix before finalizing.`
    );
    err.statusCode = 400;
    err.unresolved = unresolved.slice(0, 20);
    throw err;
  }

  // Preserve imported (or manually corrected) faculty_id — never reassign.
  const byFaculty = new Map();
  for (const s of students) {
    const key = String(s.facultyId);
    if (!byFaculty.has(key)) byFaculty.set(key, []);
    byFaculty.get(key).push(s);
  }

  const conn = await db.getConnection();
  let committed = false;
  try {
    await conn.beginTransaction();

    // Concurrent finalize: lock slot row
    const [lockedSlots] = await conn.query(
      `SELECT id, seating_plan_id, status FROM lab_exam_slots WHERE id = ? FOR UPDATE`,
      [slot.id]
    );
    const locked = lockedSlots?.[0];
    if (locked?.seating_plan_id || locked?.seatingplanid) {
      await conn.rollback();
      const studentsLocked = await listSlotStudents(slot.public_uuid || slotUuid);
      const byFac = new Map();
      for (const s of studentsLocked) {
        if (!s.facultyId) continue;
        const key = String(s.facultyId);
        if (!byFac.has(key)) byFac.set(key, []);
        byFac.get(key).push(s);
      }
      const planId = locked.seating_plan_id || locked.seatingplanid;
      const planUuid = await getPublicUuid(TABLE.seatingPlans, planId);
      return {
        alreadyFinalized: true,
        seatingPlanId: planId,
        seatingPlanUuid: planUuid,
        attendanceAssignmentsSynced: 0,
        examStatus: "finalized",
        summary: await buildFinalizeSummary(studentsLocked, byFac, []),
        slot: toSlotRow({
          ...slot,
          seating_plan_id: planId,
          seating_plan_uuid: planUuid,
          status: "finalized",
        }),
      };
    }

    for (const v of venues) {
      const check = await Venue.checkAllotmentSlot(
        v.id,
        dateOnly,
        start,
        end,
        conn,
        { lock: true }
      );
      if (!check.ok) {
        const err = new Error(check.message || `${v.name} is not available`);
        err.statusCode = 409;
        throw err;
      }
    }

    const facultyIds = [...byFaculty.keys()].map(Number);
    await lockFacultyRowsForUpdate(conn, facultyIds);

    // Capacity unit = 1 invigilation duty per faculty (not student count).
    for (const facultyId of facultyIds) {
      const validation = await Faculty.validateFacultyForAllocation(
        facultyId,
        {
          examDate: dateOnly,
          examStartTime: start,
          examEndTime: end,
          additionalSlots: 1,
        },
        conn
      );
      if (!validation.allowed) {
        const err = new Error(validation.message || "Faculty cannot be allocated");
        err.statusCode = validation.code === "TIME_CONFLICT" ? 409 : 400;
        err.code = validation.code;
        throw err;
      }
    }

    // Round-robin faculty groups onto venues; keep each student's faculty_id unchanged.
    const facultyEntries = [...byFaculty.entries()];
    const venueBuckets = new Map();

    for (let i = 0; i < facultyEntries.length; i++) {
      const [facultyId, group] = facultyEntries[i];
      const venue = venues[i % venues.length];
      if (!venueBuckets.has(venue.id)) {
        venueBuckets.set(venue.id, {
          venue,
          facultyIds: new Set(),
          students: [],
        });
      }
      const bucket = venueBuckets.get(venue.id);
      bucket.facultyIds.add(Number(facultyId));
      bucket.students.push(...group);

      for (const s of group) {
        const sid = await resolveInternalId("lab_slot_students", s.uuid, {
          allowLegacyNumeric: true,
        });
        await conn.query(
          `UPDATE lab_slot_students
           SET venue_id = ?, faculty_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [venue.id, Number(facultyId), sid]
        );
      }
    }

    const venuesUsed = [];
    const allPlanStudents = [];
    for (const bucket of venueBuckets.values()) {
      const fids = [...bucket.facultyIds];
      const layout = buildFlatLayout(bucket.students);
      venuesUsed.push({
        venueId: bucket.venue.id,
        venueName: bucket.venue.name,
        seatingArrangement: layout,
        // One seat per column — matches buildFlatLayout cell shape.
        benchConfig: bucket.students.map(() => 1),
        facultyId: fids[0] || null,
        facultyIds: fids,
      });
      for (const s of bucket.students) {
        allPlanStudents.push({
          regnNo: s.regnNo,
          studentName: s.studentName || s.regnNo,
          courseDescription: s.courseCode,
          examCode: s.courseCode,
        });
      }
    }

    const selectedCourses = [
      ...new Set(students.map((s) => s.courseCode).filter(Boolean)),
    ];
    const examType = labPlanExamType(exam, selectedCourses);
    const examSession = labPlanExamSession(slot);

    const seatingPlanId = await SeatingPlan.createPlan(
      {
        examDate: dateOnly,
        examSession,
        examType,
        examStartTime: start,
        examEndTime: end,
        selectedCourses,
        students: allPlanStudents,
        venuesUsed,
        facultyMode: "MANUAL",
        planKind: "lab",
      },
      ownerOpts,
      conn
    );

    if (!seatingPlanId) {
      const err = new Error("Failed to create LAB seating plan");
      err.statusCode = 500;
      throw err;
    }

    // Ensure plan_kind even if createPlan ignored planKind (older code paths).
    try {
      await conn.query(
        `UPDATE seating_plans SET plan_kind = 'lab' WHERE id = ?`,
        [seatingPlanId]
      );
    } catch (kindErr) {
      const code = kindErr?.code || kindErr?.parent?.code;
      const msg = String(kindErr?.message || "");
      if (code === "42703" || /plan_kind/i.test(msg)) {
        const err = new Error(
          "LAB schema is missing seating_plans.plan_kind. Restart the API so ensureLabExamSchema can run, then retry finalize."
        );
        err.statusCode = 503;
        err.code = "SCHEMA_NOT_READY";
        throw err;
      }
      throw kindErr;
    }

    const attendanceSync = await AttendanceService.syncAssignmentsFromSeatingPlan(
      seatingPlanId,
      conn
    );

    for (const v of venues) {
      try {
        await Venue.addSession(v.id, dateOnly, start, end, conn);
      } catch (sessionErr) {
        // Duplicate venue_sessions must not abort finalize (idempotent retry).
        const code = sessionErr?.code || sessionErr?.parent?.code;
        if (code !== "23505") throw sessionErr;
      }
    }

    const [slotUpdate] = await conn.query(
      `UPDATE lab_exam_slots
       SET seating_plan_id = ?, status = 'finalized', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND seating_plan_id IS NULL`,
      [seatingPlanId, slot.id]
    );
    const slotUpdated = Number(slotUpdate?.affectedRows ?? 0);
    if (slotUpdated < 1) {
      const err = new Error(
        "LAB slot was finalized concurrently. Refresh the page and retry if needed."
      );
      err.statusCode = 409;
      err.code = "ALREADY_FINALIZED";
      throw err;
    }

    const [remaining] = await conn.query(
      `SELECT COUNT(*)::int AS cnt FROM lab_exam_slots
       WHERE lab_exam_id = ? AND status <> 'finalized'`,
      [exam.id]
    );
    const allFinal =
      Number(remaining?.[0]?.cnt ?? remaining?.[0]?.CNT ?? 0) === 0;

    await conn.query(
      `UPDATE lab_exams
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [allFinal ? "finalized" : "validated", exam.id]
    );

    await conn.commit();
    committed = true;

    // Post-commit: never roll back persisted work if summary enrichment fails.
    let planUuid = null;
    let summary;
    try {
      planUuid = await getPublicUuid(TABLE.seatingPlans, seatingPlanId);
      summary = await buildFinalizeSummary(students, byFaculty, venuesUsed);
    } catch (postErr) {
      console.error("LAB finalize post-commit summary error:", postErr?.message || postErr);
      summary = {
        totalStudents: students.length,
        mappedStudents: students.filter((s) => s.facultyId).length,
        unresolvedStudents: students.filter((s) => !s.facultyId).length,
        facultyCount: byFaculty.size,
        facultyAssignments: [...byFaculty.entries()].map(([facultyId, group]) => ({
          facultyId: Number(facultyId),
          facultyName: group[0]?.facultyName || null,
          facultyEmail: group[0]?.facultyEmail || null,
          studentCount: group.length,
          invigilationDutiesCharged: 1,
        })),
        note: "Finalized successfully; capacity summary unavailable.",
      };
    }

    return {
      alreadyFinalized: false,
      seatingPlanId,
      seatingPlanUuid: planUuid,
      attendanceAssignmentsSynced: attendanceSync.synced,
      examStatus: allFinal ? "finalized" : "validated",
      summary,
      slot: toSlotRow({
        ...slot,
        seating_plan_id: seatingPlanId,
        seating_plan_uuid: planUuid,
        status: "finalized",
      }),
    };
  } catch (e) {
    if (!committed) {
      try {
        await conn.rollback();
      } catch (_) {
        /* transaction may already be closed */
      }
    }
    throw e;
  } finally {
    conn.release();
  }
}

async function getExamDetail(examUuid) {
  const exam = await getExamByUuid(examUuid);
  if (!exam) {
    const err = new Error("LAB exam not found");
    err.statusCode = 404;
    throw err;
  }
  const slots = await listSlots(examUuid);
  const slotsWithMeta = [];
  for (const slot of slots) {
    const venues = await listSlotVenues(slot.uuid);
    const students = await listSlotStudents(slot.uuid);
    const facultySummary = summarizeFacultyCounts(
      students.map((s) => ({
        facultyEmail: s.facultyEmail,
        regnNo: s.regnNo,
      }))
    ).map((g) => {
      const sample = students.find((s) => s.facultyEmail === g.facultyEmail);
      return {
        ...g,
        facultyName: sample?.facultyName || null,
        facultyUuid: sample?.facultyUuid || null,
      };
    });
    slotsWithMeta.push({
      ...slot,
      venues,
      studentCount: students.length,
      unresolvedCount: students.filter((s) => !s.facultyId).length,
      facultySummary,
    });
  }
  return { ...exam, slots: slotsWithMeta };
}

/**
 * Regns assigned to a faculty for a LAB exam+venue (attendance filter).
 */
async function getLabRegnsForFacultyAssignment(examId, venueId, facultyId) {
  if (!examId || !venueId || !facultyId) return null;

  const [rows] = await db.query(
    `SELECT ls.regn_no
     FROM lab_slot_students ls
     JOIN lab_exam_slots slot ON slot.id = ls.lab_slot_id
     JOIN seating_plans sp ON sp.id = slot.seating_plan_id
     JOIN exams e ON e.id = ?
     WHERE sp.id = slot.seating_plan_id
       AND sp.exam_date = e.exam_date
       AND sp.plan_kind = 'lab'
       AND ls.faculty_id = ?
       AND ls.venue_id = ?`,
    [examId, facultyId, venueId]
  );

  if (!rows?.length) {
    // Fallback: match via seating plan linked to exam times
    const [rows2] = await db.query(
      `SELECT ls.regn_no
       FROM lab_slot_students ls
       JOIN lab_exam_slots slot ON slot.id = ls.lab_slot_id
       JOIN seating_plans sp ON sp.id = slot.seating_plan_id
       JOIN exams e ON e.id = ?
       WHERE sp.plan_kind = 'lab'
         AND sp.exam_date = e.exam_date
         AND (e.exam_session IS NULL OR sp.exam_session = e.exam_session)
         AND ls.faculty_id = ?
         AND (ls.venue_id = ? OR ls.venue_id IS NULL)`,
      [examId, facultyId, venueId]
    );
    if (!rows2?.length) return null;
    return new Set(
      rows2.map((r) => String(r.regn_no || r.regnno).trim().toLowerCase())
    );
  }

  return new Set(
    rows.map((r) => String(r.regn_no || r.regnno).trim().toLowerCase())
  );
}

module.exports = {
  STATUSES,
  listExams,
  createExam,
  updateExam,
  getExamByUuid,
  getExamDetail,
  listSlots,
  addSlot,
  updateSlot,
  setSlotVenues,
  listSlotVenues,
  previewImport,
  commitImport,
  listSlotStudents,
  reassignStudentFaculty,
  assignStudentRange,
  finalizeSlot,
  getLabRegnsForFacultyAssignment,
  resolveFacultyByEmails,
  parseLabStudentRows,
  summarizeFacultyCounts,
  readWorkbookSheets,
  buildFlatLayout,
  labPlanExamType,
  labPlanExamSession,
};
