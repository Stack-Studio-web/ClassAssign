/**
 * Consolidated Absentees DOCX export — data layer.
 * Filters: department + date range + course + batch (from student enrollment).
 */
const db = require("../config/db");
const crypto = require("crypto");
const ReportVerification = require("../models/ReportVerification");
// DOCX builder is lazy-required in exportDocx so options/preview work even if docx is missing.

function normalizeSession(raw) {
  if (!raw) return "—";
  const s = String(raw).toUpperCase().trim();
  if (!s) return "—";
  if (
    s === "FN" ||
    s === "MORNING" ||
    s === "FORENOON" ||
    s.includes("FORENOON") ||
    /(^|[^A-Z])FN([^A-Z]|$)/.test(s) ||
    s.includes("MORNING")
  ) {
    return "FN";
  }
  if (
    s === "AN" ||
    s === "AFTERNOON" ||
    s.includes("AFTERNOON") ||
    /(^|[^A-Z])AN([^A-Z]|$)/.test(s)
  ) {
    return "AN";
  }
  return String(raw).trim() || "—";
}

function deriveExamType(examName = "", examCode = "", seatingExamType = "") {
  if (seatingExamType && String(seatingExamType).trim()) {
    return String(seatingExamType).trim();
  }
  const hay = `${examName} ${examCode}`.toUpperCase();
  if (hay.includes("CAT 1") || hay.includes("CAT1") || hay.includes("CAT I")) return "CAT 1";
  if (hay.includes("CAT 2") || hay.includes("CAT2") || hay.includes("CAT II")) return "CAT 2";
  if (hay.includes("MODEL")) return "Model";
  if (hay.includes("SEMESTER") || hay.includes("SUMMATIVE")) return "Semester";
  if (hay.includes("RETEST")) return "Retest";
  return examName || examCode || "—";
}

function academicYearLabel(dateFrom) {
  const raw = String(dateFrom || "").slice(0, 10);
  const [y, m] = raw.split("-").map(Number);
  if (!y || !m) {
    const now = new Date();
    const yy = now.getFullYear();
    const mm = now.getMonth() + 1;
    const start = mm >= 7 ? yy : yy - 1;
    return `${start}-${String(start + 1).slice(-2)}`;
  }
  const start = m >= 7 ? y : y - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function formatDateDisplay(value) {
  if (!value) return "";
  const iso = toDateKey(value) || String(value);
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return String(value);
  return `${d}.${m}.${y}`;
}

function formatDateSlash(value) {
  if (!value) return "";
  const iso = toDateKey(value) || String(value);
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return String(value);
  return `${d}/${m}/${y}`;
}

/**
 * Normalize pg DATE / Date / ISO strings to YYYY-MM-DD.
 * Prefer calendar string form. For JS Date from node-pg DATE, use LOCAL
 * Y/M/D (not UTC) — UTC shifts IST midnights to the previous calendar day.
 */
function toDateKey(value) {
  if (value == null || value === "") return "";
  const raw = typeof value === "string" ? value.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const asString = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(asString)) return asString.slice(0, 10);
  const parsed = new Date(asString);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return "";
}

/** SQL fragment: calendar date as YYYY-MM-DD text (avoids node-pg Date TZ shift). */
function sqlDateKey(expr) {
  return `to_char(${expr}, 'YYYY-MM-DD')`;
}

function normalizeCourseCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function extractYearRange(label) {
  const m = String(label || "")
    .toUpperCase()
    .match(/\b(20\d{2})\s*[-–]\s*(20\d{2})\b/);
  if (!m) return "";
  return `${m[1]}-${m[2]}`;
}

function batchesLooselyMatch(timetableBatchName, studentBatchName) {
  const a = String(timetableBatchName || "").trim().toUpperCase();
  const b = String(studentBatchName || "").trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;
  // Ignore placeholder batch labels
  if (/^(ALL|NA|N\/A|-|NONE)$/i.test(a)) return true;
  const ya = extractYearRange(a);
  const yb = extractYearRange(b);
  if (ya && yb && ya === yb) return true;
  return false;
}

/** True only when timetable row actually restricts by academic batch. */
function timetableRowHasBatchRestriction(row) {
  if (row.batchId != null && row.batchId !== "" && Number.isFinite(Number(row.batchId))) {
    return true;
  }
  const label = String(row.batchText || row.batchName || "").trim();
  if (!label || /^(ALL|NA|N\/A|-|NONE)$/i.test(label)) return false;
  // Academic batch years like 2025-2029 — not department codes (BIT/BCS)
  return Boolean(extractYearRange(label));
}

function timetableRowMatchesStudentBatch(row, batchId, batchName) {
  if (
    row.batchId != null &&
    batchId != null &&
    Number(row.batchId) === Number(batchId)
  ) {
    return true;
  }
  if (batchesLooselyMatch(row.batchName, batchName)) return true;
  if (batchesLooselyMatch(row.batchText, batchName)) return true;
  return false;
}

/**
 * Compact roll display: 25BIT047, 50, 62, 125 — underlying values stay full.
 */
function compactAbsenteeRolls(regns) {
  const unique = [
    ...new Set(
      (regns || [])
        .map((r) => String(r || "").trim())
        .filter(Boolean)
    ),
  ];
  unique.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!unique.length) return "";
  const first = unique[0];
  const m = first.match(/^(\d*[A-Za-z]+)(\d+)$/);
  if (!m) return unique.join(", ");
  const letterPrefix = m[1];
  const parts = [first];
  for (let i = 1; i < unique.length; i++) {
    const r = unique[i];
    if (r.startsWith(letterPrefix)) {
      const num = r.slice(letterPrefix.length).replace(/^0+/, "") || "0";
      parts.push(num);
    } else {
      parts.push(r);
    }
  }
  return parts.join(", ");
}

function sanitizeFilenamePart(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

function dateForFilename(value) {
  const raw = String(value || "").slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return "date";
  return `${d}-${m}-${y}`;
}

function departmentDisplayName(dept) {
  const d = String(dept || "").trim();
  if (!d || /^all\s+departments$/i.test(d)) return "ALL DEPARTMENTS";
  if (/^DEPARTMENT\s+OF\s+/i.test(d)) return d.toUpperCase();
  return `DEPARTMENT OF ${d.toUpperCase()}`;
}

/** Program code from regn_no, e.g. 24BCS002 → BCS (matches Student.deriveDepartmentFromRegnNo). */
const PROGRAM_FROM_REGN_SQL = (alias = "st") =>
  `UPPER((regexp_match(UPPER(TRIM(COALESCE(${alias}.regn_no, ''))), '^[0-9]{2}([A-Z]+)'))[1])`;

const HAS_PROGRAM_REGN_SQL = (alias = "st") =>
  `${alias}.regn_no ~ '^[0-9]{2}[A-Z]+'`;

/**
 * Match students by program code in regn_no (canonical for Hallora).
 * Also allows students.department when it equals the same program code
 * (never treats org labels like KSI/KCT as student departments).
 */
function departmentMatchClause(department, alias = "st") {
  const dept = String(department || "").trim().toUpperCase();
  if (!dept || dept === "ALL" || dept === "ALL DEPARTMENTS") {
    return { sql: "TRUE", params: [] };
  }
  const programExpr = PROGRAM_FROM_REGN_SQL(alias);
  const sql = `(
    ${programExpr} = ?
    OR (
      UPPER(TRIM(COALESCE(${alias}.department, ''))) = ?
      AND UPPER(TRIM(COALESCE(${alias}.department, ''))) !~ '^(KSI|KCT)$'
      AND LENGTH(UPPER(TRIM(COALESCE(${alias}.department, '')))) BETWEEN 2 AND 8
    )
  )`;
  return { sql, params: [dept, dept] };
}

function parseDateParam(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return raw;
}

function yearSemesterLabel(rows) {
  const semLabels = [
    ...new Set(
      (rows || [])
        .map((r) => r.semesterLabel || r.semesterType)
        .filter((v) => v && String(v).trim() && String(v) !== "—")
    ),
  ];
  if (semLabels.length === 1) return String(semLabels[0]);
  if (semLabels.length > 1) return semLabels.slice(0, 2).join(" / ");

  const batchNames = [
    ...new Set((rows || []).map((r) => r.batchName).filter(Boolean)),
  ];
  if (batchNames.length === 1) return String(batchNames[0]);
  return "All Years";
}

function dominantExamType(rows) {
  const counts = new Map();
  for (const r of rows || []) {
    const t = r.examType || "—";
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  let best = "—";
  let bestN = 0;
  for (const [t, n] of counts) {
    if (n > bestN) {
      best = t;
      bestN = n;
    }
  }
  return best;
}

async function buildRoleScope(user, role) {
  const scope = { sql: "", params: [] };
  if (role === "faculty") {
    const AttendanceService = require("./attendanceService");
    const facultyId = await AttendanceService.resolveFacultyIdForUser(user);
    if (!facultyId) {
      scope.sql = " AND 1=0";
      return scope;
    }
    scope.sql = " AND att.faculty_id = ?";
    scope.params.push(facultyId);
    return scope;
  }
  if (role === "admin") return scope;
  if (role === "faculty_incharge" || role === "hod") {
    const User = require("../models/User");
    const ownerIds = await User.getWorkspaceOwnerIds({
      id: user?.id,
      role,
      created_by_hod_id: user?.createdByHodId ?? user?.created_by_hod_id ?? null,
    });
    const ids = Array.isArray(ownerIds)
      ? [...new Set(ownerIds.map(Number).filter((id) => id > 0))]
      : [];
    if (!ids.length) {
      // Do not hard-block: department filter still scopes the report.
      return scope;
    }
    // Include owned students OR students with unset owner (legacy imports),
    // plus exam/seating ownership for allotment-linked absentees.
    const ph = ids.map(() => "?").join(", ");
    scope.sql = ` AND (
      st.owner_user_id IN (${ph})
      OR st.owner_user_id IS NULL
      OR e.owner_user_id IN (${ph})
      OR EXISTS (
        SELECT 1
        FROM seating_plan_venues spv_own
        JOIN seating_plans sp_own ON sp_own.id = spv_own.seating_plan_id
        WHERE spv_own.venue_id = att.venue_id
          AND sp_own.exam_date = e.exam_date
          AND (
            e.exam_session IS NULL
            OR sp_own.exam_session IS NULL
            OR sp_own.exam_session = e.exam_session
          )
          AND sp_own.owner_user_id IN (${ph})
      )
    )`;
    scope.params = [...ids, ...ids, ...ids];
    return scope;
  }
  return scope;
}

function validateFilters(filters = {}) {
  const department = String(filters.department || "").trim();
  const dateFrom = String(filters.dateFrom || filters.date_from || "").trim().slice(0, 10);
  const dateTo = String(filters.dateTo || filters.date_to || "").trim().slice(0, 10);
  const courseCode = String(filters.courseCode || filters.course || "").trim();
  const batchUuid = String(filters.batchUuid || filters.batch || "").trim();

  if (!dateFrom || !dateTo) {
    const err = new Error("Date From and Date To are required");
    err.statusCode = 400;
    throw err;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    const err = new Error("Dates must be in YYYY-MM-DD format");
    err.statusCode = 400;
    throw err;
  }
  if (dateTo < dateFrom) {
    const err = new Error("Date To cannot be before Date From");
    err.statusCode = 400;
    throw err;
  }
  return { department, dateFrom, dateTo, courseCode, batchUuid };
}

/**
 * Resolve seated courses + seating-plan slot metadata for a venue/exam.
 * Returns { courseMap: Map(regn → courseCode), startTime, endTime, examType, selectedCourses }
 */
async function buildVenueCourseContext(examId, venueId) {
  const { resolveVenueStudentsWithCourses } = require("../utils/venueAttendanceCourses");
  const empty = {
    courseMap: new Map(),
    startTime: null,
    endTime: null,
    examType: null,
    selectedCourses: [],
  };
  const [spvRows] = await db.query(
    `SELECT
       spv.id,
       spv.seating_layout_json,
       spv.seating_plan_id,
       sp.exam_start_time,
       sp.exam_end_time,
       sp.exam_type,
       sp.selected_courses
     FROM seating_plan_venues spv
     JOIN seating_plans sp ON sp.id = spv.seating_plan_id
     JOIN exams e ON e.id = ?
     WHERE spv.venue_id = ?
       AND sp.exam_date = e.exam_date
       AND (e.exam_session IS NULL OR sp.exam_session = e.exam_session)
     ORDER BY spv.id DESC
     LIMIT 1`,
    [examId, venueId]
  );
  const spv = spvRows?.[0];
  if (!spv) return empty;

  const spvId = spv.id;
  const planId = spv.seating_plan_id ?? spv.seatingplanid;
  const [arrangementRows] = await db.query(
    `SELECT regn_no, seat_row, seat_col, seat_index
     FROM seating_arrangements
     WHERE seating_plan_venue_id = ?
       AND regn_no IS NOT NULL AND TRIM(regn_no) <> '' AND regn_no <> '-'`,
    [spvId]
  );
  const [planStudentRows] = await db.query(
    `SELECT regn_no, student_name, course_description
     FROM seating_plan_students
     WHERE seating_plan_id = ?
     ORDER BY id ASC`,
    [planId]
  );
  const students = resolveVenueStudentsWithCourses({
    layoutJson: spv.seating_layout_json ?? spv.seatinglayoutjson,
    arrangementRows: arrangementRows || [],
    planStudentRows: planStudentRows || [],
  });
  const courseMap = new Map(
    (students || [])
      .filter((s) => s.regNo && s.courseCode)
      .map((s) => [String(s.regNo).trim().toUpperCase(), String(s.courseCode).trim()])
  );

  let selectedCourses = [];
  const rawSelected = spv.selected_courses ?? spv.selectedcourses;
  if (rawSelected) {
    try {
      const parsed =
        typeof rawSelected === "string" ? JSON.parse(rawSelected) : rawSelected;
      if (Array.isArray(parsed)) {
        selectedCourses = parsed
          .map((c) =>
            String(
              typeof c === "string"
                ? c
                : c?.code ?? c?.courseCode ?? c?.course_code ?? ""
            ).trim()
          )
          .filter(Boolean);
      }
    } catch {
      selectedCourses = [];
    }
  }

  const trimTime = (t) => {
    if (t == null || t === "") return null;
    const s = String(t).trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
    return s.slice(0, 5) || null;
  };

  return {
    courseMap,
    startTime: trimTime(spv.exam_start_time ?? spv.examstarttime),
    endTime: trimTime(spv.exam_end_time ?? spv.examendtime),
    examType: spv.exam_type ?? spv.examtype ?? null,
    selectedCourses,
  };
}

/** @deprecated use buildVenueCourseContext */
async function buildVenueCourseMap(examId, venueId) {
  const ctx = await buildVenueCourseContext(examId, venueId);
  return ctx.courseMap;
}

function normalizeExamTypeKey(raw) {
  const s = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!s) return "";
  if (s.includes("CAT1") || s === "CATI") return "CAT1";
  if (s.includes("CAT2") || s === "CATII") return "CAT2";
  if (s.includes("MODEL")) return "MODEL";
  if (s.includes("SEMESTER") || s.includes("SUMMATIVE") || s === "SEM") return "SEM";
  if (s.includes("RETEST")) return "RETEST";
  return s;
}

function trimTimePart(t) {
  if (t == null || t === "") return null;
  const s = String(t).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return s.slice(0, 5) || null;
}

/**
 * Load all timetable rows for a date range once (no per-row queries).
 * Authoritative source: public.timetable (same table as Timetable module / allotment).
 * @returns {{ byDateCourse: Map<string, object[]>, rowCount: number, sampleKeys: string[] }}
 */
async function loadTimetableIndex(dateFrom, dateTo) {
  const [rows] = await db.query(
    `SELECT
       ${sqlDateKey("t.date")} AS date,
       t.session,
       to_char(t.start_time, 'HH24:MI') AS start_time,
       to_char(t.end_time, 'HH24:MI') AS end_time,
       t.course_code,
       t.exam_type,
       t.batch_id,
       t.batch,
       b.name AS batch_name
     FROM timetable t
     LEFT JOIN batches b ON b.id = t.batch_id
     WHERE t.date BETWEEN ? AND ?`,
    [dateFrom, dateTo]
  );

  /** @type {Map<string, object[]>} key = YYYY-MM-DD|COURSECODE */
  const byDateCourse = new Map();
  for (const row of rows || []) {
    const dateKey = toDateKey(row.date);
    const code = normalizeCourseCode(row.course_code ?? row.coursecode);
    if (!dateKey || !code) continue;
    const key = `${dateKey}|${code}`;
    if (!byDateCourse.has(key)) byDateCourse.set(key, []);
    const batchText = String(row.batch ?? "").trim();
    const batchName = String(
      row.batch_name ?? row.batchname ?? batchText ?? ""
    ).trim();
    byDateCourse.get(key).push({
      session: row.session,
      startTime: trimTimePart(row.start_time ?? row.starttime),
      endTime: trimTimePart(row.end_time ?? row.endtime),
      examType: row.exam_type ?? row.examtype,
      batchId: row.batch_id ?? row.batchid ?? null,
      batchText,
      batchName,
    });
  }
  return {
    byDateCourse,
    rowCount: (rows || []).length,
    sampleKeys: [...byDateCourse.keys()].slice(0, 12),
  };
}

/**
 * In-memory timetable validation against a preloaded index.
 *
 * Required: date + course_code present on timetable.
 * Session: when BOTH sides have FN/AN, they must agree.
 * Batch: ONLY when timetable row has batch_id or academic year-range batch text.
 * Exam type / exact time: preferred, never sole rejectors when date+course(+session) match.
 *
 * @returns {{ ok: boolean, reason: string }}
 */
function diagnoseCourseScheduledInIndex(index, opts) {
  const byDateCourse = index?.byDateCourse || index;
  const code = normalizeCourseCode(opts.courseCode);
  const dateKey = toDateKey(opts.examDate);
  if (!code || !dateKey) {
    return { ok: false, reason: "missingCourseOrDate" };
  }

  const candidates = byDateCourse.get(`${dateKey}|${code}`) || [];
  if (!candidates.length) {
    return { ok: false, reason: "noTimetableRecord" };
  }

  const sess = normalizeSession(opts.session);
  const batchId = opts.batchId;
  const batchName = opts.batchName;
  const startTime = opts.startTime || null;
  const endTime = opts.endTime || null;
  const wantType = normalizeExamTypeKey(opts.examType);
  const studentHasBatch =
    batchId != null || (batchName && String(batchName).trim());

  let sessionMismatch = 0;
  let batchMismatch = 0;
  let examTypeMismatch = 0;

  const matchRow = (row, { requireType = false, requireBatch = true } = {}) => {
    const rowSess = normalizeSession(row.session);
    if (
      sess &&
      sess !== "—" &&
      rowSess &&
      rowSess !== "—" &&
      rowSess !== sess
    ) {
      sessionMismatch += 1;
      return false;
    }

    if (requireBatch && timetableRowHasBatchRestriction(row) && studentHasBatch) {
      if (!timetableRowMatchesStudentBatch(row, batchId, batchName)) {
        batchMismatch += 1;
        return false;
      }
    }

    if (requireType) {
      const rowType = normalizeExamTypeKey(row.examType);
      if (rowType && wantType && rowType !== wantType) {
        examTypeMismatch += 1;
        return false;
      }
    }
    return true;
  };

  // 1) Prefer exact time window when seating times are known — then relax.
  const pools = [];
  if (startTime && endTime) {
    const timed = candidates.filter(
      (r) => r.startTime === startTime && r.endTime === endTime
    );
    if (timed.length) pools.push(timed);
  }
  pools.push(candidates);

  for (const pool of pools) {
    // Strictest → loosest (type optional; batch only when timetable specifies it)
    if (pool.some((r) => matchRow(r, { requireType: true, requireBatch: true }))) {
      return { ok: true, reason: "matched" };
    }
    if (pool.some((r) => matchRow(r, { requireType: false, requireBatch: true }))) {
      return { ok: true, reason: "matched" };
    }
  }

  // If every candidate failed only because of batch, and there exists a
  // no-batch-restriction row we already tried — classify reason.
  if (candidates.every((r) => !timetableRowHasBatchRestriction(r))) {
    if (sessionMismatch > 0 && sessionMismatch >= candidates.length) {
      return { ok: false, reason: "sessionMismatch" };
    }
  }
  if (batchMismatch > 0) {
    // Last resort: accept date+course+session when a row has NO batch restriction.
    // (Rows WITH batch restriction that didn't match stay rejected — preserves
    //  batch-scoped schedules. Unscheduled courses still have zero candidates.)
    const unrestricted = candidates.filter((r) => !timetableRowHasBatchRestriction(r));
    if (
      unrestricted.some((r) =>
        matchRow(r, { requireType: false, requireBatch: false })
      )
    ) {
      return { ok: true, reason: "matched" };
    }
    return { ok: false, reason: "batchMismatch" };
  }
  if (sessionMismatch > 0) {
    return { ok: false, reason: "sessionMismatch" };
  }
  if (examTypeMismatch > 0) {
    return { ok: false, reason: "examTypeMismatch" };
  }
  return { ok: false, reason: "noTimetableRecord" };
}

function isCourseScheduledInIndex(index, opts) {
  return diagnoseCourseScheduledInIndex(index, opts).ok;
}

/**
 * Bulk-build seating course maps for many (examId, venueId) pairs.
 */
async function bulkBuildVenueCourseContexts(pairs) {
  const { resolveVenueStudentsWithCourses } = require("../utils/venueAttendanceCourses");
  const result = new Map();
  const empty = () => ({
    courseMap: new Map(),
    startTime: null,
    endTime: null,
    examType: null,
    selectedCourses: [],
  });

  const unique = [];
  const seen = new Set();
  for (const p of pairs || []) {
    if (p.examId == null || p.venueId == null) continue;
    const key = `${p.examId}::${p.venueId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ examId: p.examId, venueId: p.venueId, key });
  }
  if (!unique.length) return result;

  // One query for all seating plan venues matching these exams/venues in the date window.
  const examIds = [...new Set(unique.map((u) => u.examId))];
  const venueIds = [...new Set(unique.map((u) => u.venueId))];

  const [spvRows] = await db.query(
    `SELECT
       e.id AS exam_id,
       spv.venue_id,
       spv.id AS spv_id,
       spv.seating_layout_json,
       spv.seating_plan_id,
       sp.exam_start_time,
       sp.exam_end_time,
       sp.exam_type,
       sp.selected_courses,
       e.exam_session AS exam_session,
       sp.exam_session AS plan_session
     FROM exams e
     JOIN seating_plan_venues spv ON spv.venue_id IN (${venueIds.map(() => "?").join(",")})
     JOIN seating_plans sp ON sp.id = spv.seating_plan_id
     WHERE e.id IN (${examIds.map(() => "?").join(",")})
       AND sp.exam_date = e.exam_date
     ORDER BY e.id ASC, spv.venue_id ASC, spv.id DESC`,
    [...venueIds, ...examIds]
  );

  // Keep first (latest spv) per exam+venue with compatible session (FN/AN normalized).
  const bestSpv = new Map();
  for (const row of spvRows || []) {
    const examSess = normalizeSession(row.exam_session ?? row.examsession);
    const planSess = normalizeSession(row.plan_session ?? row.plansession);
    if (
      examSess &&
      examSess !== "—" &&
      planSess &&
      planSess !== "—" &&
      examSess !== planSess
    ) {
      continue;
    }
    const key = `${row.exam_id ?? row.examid}::${row.venue_id ?? row.venueid}`;
    if (!bestSpv.has(key)) bestSpv.set(key, row);
  }

  const planIds = [
    ...new Set(
      [...bestSpv.values()]
        .map((r) => r.seating_plan_id ?? r.seatingplanid)
        .filter((id) => id != null)
    ),
  ];
  const spvIds = [
    ...new Set(
      [...bestSpv.values()].map((r) => r.spv_id ?? r.spvid).filter((id) => id != null)
    ),
  ];

  const planStudentsByPlan = new Map();
  if (planIds.length) {
    const [psRows] = await db.query(
      `SELECT seating_plan_id, regn_no, student_name, course_description
       FROM seating_plan_students
       WHERE seating_plan_id IN (${planIds.map(() => "?").join(",")})
       ORDER BY id ASC`,
      planIds
    );
    for (const row of psRows || []) {
      const pid = row.seating_plan_id ?? row.seatingplanid;
      if (!planStudentsByPlan.has(pid)) planStudentsByPlan.set(pid, []);
      planStudentsByPlan.get(pid).push(row);
    }
  }

  const arrangementsBySpv = new Map();
  if (spvIds.length) {
    const [arrRows] = await db.query(
      `SELECT seating_plan_venue_id, regn_no, seat_row, seat_col, seat_index
       FROM seating_arrangements
       WHERE seating_plan_venue_id IN (${spvIds.map(() => "?").join(",")})
         AND regn_no IS NOT NULL AND TRIM(regn_no) <> '' AND regn_no <> '-'`,
      spvIds
    );
    for (const row of arrRows || []) {
      const sid = row.seating_plan_venue_id ?? row.seatingplanvenueid;
      if (!arrangementsBySpv.has(sid)) arrangementsBySpv.set(sid, []);
      arrangementsBySpv.get(sid).push(row);
    }
  }

  for (const u of unique) {
    const row = bestSpv.get(u.key);
    if (!row) {
      result.set(u.key, empty());
      continue;
    }
    const planId = row.seating_plan_id ?? row.seatingplanid;
    const spvId = row.spv_id ?? row.spvid;
    const students = resolveVenueStudentsWithCourses({
      layoutJson: row.seating_layout_json ?? row.seatinglayoutjson,
      arrangementRows: arrangementsBySpv.get(spvId) || [],
      planStudentRows: planStudentsByPlan.get(planId) || [],
    });
    const courseMap = new Map(
      (students || [])
        .filter((s) => s.regNo && s.courseCode)
        .map((s) => [String(s.regNo).trim().toUpperCase(), String(s.courseCode).trim()])
    );
    let selectedCourses = [];
    const rawSelected = row.selected_courses ?? row.selectedcourses;
    if (rawSelected) {
      try {
        const parsed =
          typeof rawSelected === "string" ? JSON.parse(rawSelected) : rawSelected;
        if (Array.isArray(parsed)) {
          selectedCourses = parsed
            .map((c) =>
              String(
                typeof c === "string"
                  ? c
                  : c?.code ?? c?.courseCode ?? c?.course_code ?? ""
              ).trim()
            )
            .filter(Boolean);
        }
      } catch {
        selectedCourses = [];
      }
    }
    result.set(u.key, {
      courseMap,
      startTime: trimTimePart(row.exam_start_time ?? row.examstarttime),
      endTime: trimTimePart(row.exam_end_time ?? row.examendtime),
      examType: row.exam_type ?? row.examtype ?? null,
      selectedCourses,
    });
  }

  return result;
}

/**
 * Resolve course titles for a small set of codes.
 * Prefer timetable (authoritative for exam slots), then students as fallback.
 */
async function bulkLookupCourseTitles(courseCodes, dateFrom = null, dateTo = null) {
  const codes = [
    ...new Set(
      (courseCodes || []).map((c) => String(c || "").trim()).filter(Boolean)
    ),
  ];
  const map = new Map();
  if (!codes.length) return map;

  const upperCodes = codes.map((c) => c.toUpperCase());

  if (dateFrom && dateTo) {
    try {
      const ph = upperCodes.map(() => "?").join(", ");
      const [ttRows] = await db.query(
        `SELECT DISTINCT ON (UPPER(TRIM(course_code)))
           TRIM(course_code) AS course_code,
           TRIM(course_name) AS course_title
         FROM timetable
         WHERE date BETWEEN ? AND ?
           AND UPPER(TRIM(course_code)) IN (${ph})
           AND course_name IS NOT NULL
           AND TRIM(course_name) <> ''
         ORDER BY UPPER(TRIM(course_code)), id ASC`,
        [dateFrom, dateTo, ...upperCodes]
      );
      for (const r of ttRows || []) {
        const code = String(r.course_code ?? r.coursecode ?? "")
          .trim()
          .toUpperCase();
        const title = String(r.course_title ?? r.coursetitle ?? "").trim();
        if (code && title) map.set(code, title);
      }
    } catch (err) {
      console.error("bulkLookupCourseTitles timetable:", err?.message || err);
    }
  }

  const missing = upperCodes.filter((c) => !map.has(c));
  if (!missing.length) return map;

  try {
    const ph = missing.map(() => "?").join(", ");
    const [rows] = await db.query(
      `SELECT DISTINCT ON (UPPER(TRIM(course_description)))
         TRIM(course_description) AS course_code,
         TRIM(course_name) AS course_title
       FROM students
       WHERE UPPER(TRIM(course_description)) IN (${ph})
         AND course_name IS NOT NULL
         AND TRIM(course_name) <> ''
       ORDER BY UPPER(TRIM(course_description)), id ASC`,
      missing
    );
    for (const r of rows || []) {
      const code = String(r.course_code ?? r.coursecode ?? "")
        .trim()
        .toUpperCase();
      const title = String(r.course_title ?? r.coursetitle ?? "").trim();
      if (code && title && !map.has(code)) map.set(code, title);
    }
  } catch (err) {
    console.error("bulkLookupCourseTitles students:", err?.message || err);
  }
  return map;
}

/** Parse course codes from seating_plans.selected_courses JSON/text. */
function parseSelectedCourseCodes(raw) {
  if (raw == null || raw === "") return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((c) =>
        String(
          typeof c === "string"
            ? c
            : c?.code ?? c?.courseCode ?? c?.course_code ?? ""
        ).trim()
      )
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Raw absentee rows for consolidated export.
 * Course from seating (preferred) or enrollment; validated against bulk-loaded timetable.
 * One physical mark per (regn, exam, venue). No per-row DB queries.
 */
async function fetchAbsentStudentRows(user, role, filters) {
  const debug = process.env.ATTENDANCE_EXPORT_DEBUG === "1";
  const t0 = Date.now();
  const { department, dateFrom, dateTo, courseCode, batchUuid } = validateFilters(filters);
  const roleScope = await buildRoleScope(user, role);

  let extra = "";
  if (batchUuid) {
    extra += " AND b.public_uuid = ?";
  }

  const deptMatch = departmentMatchClause(department, "st");
  const queryParams = [dateFrom, dateTo];
  if (deptMatch.params.length) queryParams.push(...deptMatch.params);
  if (batchUuid) queryParams.push(batchUuid);
  queryParams.push(...(roleScope.params || []));

  const deptSql = deptMatch.sql === "TRUE" ? "" : `AND ${deptMatch.sql}`;

  const tAtt = Date.now();
  const [rows] = await db.query(
    `SELECT
       att.id AS attendance_id,
       att.venue_id,
       st.regn_no,
       st.student_name,
       st.course_description AS enrollment_course,
       st.course_name AS enrollment_title,
       st.batch_id AS student_batch_id,
       ${PROGRAM_FROM_REGN_SQL("st")} AS student_department,
       b.public_uuid AS batch_uuid,
       b.name AS batch_name,
       ${sqlDateKey("e.exam_date")} AS exam_date,
       e.exam_session,
       e.exam_name,
       e.exam_code,
       e.id AS exam_id,
       sem.semester_type,
       sem.label AS semester_label,
       ay.label AS academic_year_label
     FROM attendance att
     JOIN students st ON st.id = att.student_id
     LEFT JOIN batches b ON b.id = st.batch_id
     LEFT JOIN semesters sem ON sem.id = b.semester_id
     LEFT JOIN academic_years ay ON ay.id = sem.academic_year_id
     JOIN exams e ON e.id = att.exam_id
     WHERE UPPER(TRIM(COALESCE(att.status, ''))) = 'ABSENT'
       AND e.exam_date BETWEEN ? AND ?
       ${deptSql}
       ${extra}
       ${roleScope.sql || ""}
     ORDER BY e.exam_date ASC, e.exam_session ASC, att.id ASC`,
    queryParams
  );
  if (debug) {
    console.info(
      `[Attendance Export Preview] attendance query: ${Date.now() - tAtt} ms (candidates=${(rows || []).length})`
    );
  }

  const rawRows = rows || [];
  const stats = {
    candidates: rawRows.length,
    skippedMissingKey: 0,
    skippedDuplicate: 0,
    skippedNoCourse: 0,
    skippedCourseFilter: 0,
    withResolvedCourse: 0,
    withResolvedBatch: 0,
    matchedTimetable: 0,
    rejectedTimetable: 0,
    timetableRecordsLoaded: 0,
    rejectionReasons: {
      dateMismatch: 0,
      sessionMismatch: 0,
      courseMismatch: 0,
      batchMismatch: 0,
      examTypeMismatch: 0,
      noTimetableRecord: 0,
      missingCourseOrDate: 0,
    },
  };

  if (!rawRows.length) {
    console.warn(
      `[Attendance Export Preview] candidate attendance records: 0 ` +
        `(dept=${department || "ALL"} ${dateFrom}→${dateTo})`
    );
    return { rows: [], filters: { department, dateFrom, dateTo, courseCode, batchUuid } };
  }

  const tBulk = Date.now();
  const [timetableLoaded, venueContextMap] = await Promise.all([
    loadTimetableIndex(dateFrom, dateTo),
    bulkBuildVenueCourseContexts(
      rawRows.map((r) => ({
        examId: r.exam_id ?? r.examid,
        venueId: r.venue_id ?? r.venueid,
      }))
    ),
  ]);
  const timetableIndex = timetableLoaded;
  stats.timetableRecordsLoaded = timetableLoaded.rowCount || 0;
  if (debug) {
    console.info(
      `[Attendance Export Preview] bulk timetable+venue: ${Date.now() - tBulk} ms ` +
        `(timetableRows=${timetableLoaded.rowCount}, keys=${timetableLoaded.byDateCourse.size}, venues=${venueContextMap.size})`
    );
  }

  const seenPhysical = new Set();
  const pending = [];
  const courseFilter = normalizeCourseCode(courseCode);
  let sampleLogged = false;

  for (const r of rawRows) {
    const attId = r.attendance_id ?? r.attendanceid;
    const regn = String(r.regn_no ?? r.regnno ?? "").trim();
    const examId = r.exam_id ?? r.examid;
    const venueId = r.venue_id ?? r.venueid;
    if (!regn || examId == null || venueId == null) {
      stats.skippedMissingKey += 1;
      continue;
    }

    const physicalKey = `${regn.toUpperCase()}::${examId}::${venueId}`;
    if (seenPhysical.has(physicalKey)) {
      stats.skippedDuplicate += 1;
      continue;
    }

    const venueCtx =
      venueContextMap.get(`${examId}::${venueId}`) || {
        courseMap: new Map(),
        startTime: null,
        endTime: null,
        examType: null,
        selectedCourses: [],
      };
    const enrollmentCourse = String(
      r.enrollment_course ?? r.enrollmentcourse ?? ""
    ).trim();
    const seatedCourse =
      venueCtx.courseMap.get(regn.toUpperCase()) ||
      venueCtx.courseMap.get(regn) ||
      "";

    const examDate = toDateKey(r.exam_date ?? r.examdate);
    const session = normalizeSession(r.exam_session ?? r.examsession);
    const batchId = r.student_batch_id ?? r.studentbatchid ?? null;
    const batchName = r.batch_name ?? r.batchname ?? null;
    const seatingExamType = venueCtx.examType;
    const scheduleOpts = {
      examDate,
      session,
      batchId,
      batchName,
      startTime: venueCtx.startTime,
      endTime: venueCtx.endTime,
      examType: seatingExamType,
    };

    // Prefer seating course. Enrollment only when seating-authoritative
    // (selected_courses) or when that enrollment course is actually scheduled
    // for this slot — never attribute unscheduled multi-enrollment courses.
    let course = seatedCourse;
    if (!course && enrollmentCourse) {
      const selected = (venueCtx.selectedCourses || []).map((c) =>
        normalizeCourseCode(c)
      );
      if (selected.includes(normalizeCourseCode(enrollmentCourse))) {
        course = enrollmentCourse;
      } else if (
        isCourseScheduledInIndex(timetableIndex, {
          ...scheduleOpts,
          courseCode: enrollmentCourse,
        })
      ) {
        course = enrollmentCourse;
      }
    }
    if (!course) {
      stats.skippedNoCourse += 1;
      seenPhysical.add(physicalKey);
      continue;
    }
    stats.withResolvedCourse += 1;

    if (courseFilter && normalizeCourseCode(course) !== courseFilter) {
      stats.skippedCourseFilter += 1;
      seenPhysical.add(physicalKey);
      continue;
    }

    if (batchId != null || (batchName && String(batchName).trim())) {
      stats.withResolvedBatch += 1;
    }

    const verdict = diagnoseCourseScheduledInIndex(timetableIndex, {
      ...scheduleOpts,
      courseCode: course,
    });

    if (!sampleLogged && (debug || !verdict.ok)) {
      sampleLogged = true;
      const key = `${examDate}|${normalizeCourseCode(course)}`;
      const ttRows = timetableLoaded.byDateCourse.get(key) || [];
      console.warn(
        "[Attendance Export Preview] sample candidate vs timetable:",
        JSON.stringify({
          attendanceId: attId,
          examId,
          venueId,
          examDate,
          session,
          course,
          batchId,
          batchName,
          seatingExamType,
          startTime: venueCtx.startTime,
          endTime: venueCtx.endTime,
          verdict,
          timetableKey: key,
          timetableCandidatesForKey: ttRows.length,
          timetableSample: ttRows.slice(0, 3).map((t) => ({
            session: t.session,
            examType: t.examType,
            batchId: t.batchId,
            batchName: t.batchName,
            batchText: t.batchText,
            startTime: t.startTime,
            endTime: t.endTime,
          })),
          timetableRowsLoaded: timetableLoaded.rowCount,
          timetableSampleKeys: timetableLoaded.sampleKeys,
        })
      );
    }

    if (!verdict.ok) {
      stats.rejectedTimetable += 1;
      const reason = verdict.reason || "noTimetableRecord";
      if (reason === "courseMismatch" || reason === "dateMismatch") {
        stats.rejectionReasons[reason] += 1;
      } else if (stats.rejectionReasons[reason] != null) {
        stats.rejectionReasons[reason] += 1;
      } else {
        stats.rejectionReasons.noTimetableRecord += 1;
      }
      // Map missing key to course/date buckets for clarity
      if (reason === "noTimetableRecord") {
        // already counted
      }
      seenPhysical.add(physicalKey);
      continue;
    }

    stats.matchedTimetable += 1;
    seenPhysical.add(physicalKey);
    pending.push({
      attendanceId: attId,
      regnNo: regn,
      studentName: r.student_name ?? r.studentname ?? "",
      courseCode: course,
      enrollmentCourse,
      enrollmentTitle: String(
        r.enrollment_title ?? r.enrollmenttitle ?? ""
      ).trim(),
      batchUuid: r.batch_uuid ?? r.batchuuid ?? null,
      batchName,
      examDate,
      session,
      examType: deriveExamType(
        r.exam_name ?? r.examname,
        r.exam_code ?? r.examcode,
        seatingExamType
      ),
      semesterType: r.semester_type ?? r.semestertype ?? null,
      semesterLabel: r.semester_label ?? r.semesterlabel ?? null,
      academicYearLabel: r.academic_year_label ?? r.academicyearlabel ?? null,
      studentDepartment: r.student_department ?? r.studentdepartment ?? department,
    });
  }

  const tTitle = Date.now();
  const titleMap = await bulkLookupCourseTitles(
    pending.map((p) => p.courseCode),
    dateFrom,
    dateTo
  );
  const out = pending.map((p) => {
    let courseTitle = "";
    if (
      p.enrollmentCourse &&
      p.courseCode.toUpperCase() === p.enrollmentCourse.toUpperCase() &&
      p.enrollmentTitle
    ) {
      courseTitle = p.enrollmentTitle;
    } else {
      courseTitle =
        titleMap.get(p.courseCode.toUpperCase()) || p.enrollmentTitle || "";
    }
    return {
      attendanceId: p.attendanceId,
      regnNo: p.regnNo,
      studentName: p.studentName,
      courseCode: p.courseCode,
      courseTitle,
      batchUuid: p.batchUuid,
      batchName: p.batchName,
      examDate: p.examDate,
      session: p.session,
      examType: p.examType,
      semesterType: p.semesterType,
      semesterLabel: p.semesterLabel,
      academicYearLabel: p.academicYearLabel,
      studentDepartment: p.studentDepartment,
    };
  });

  const summary =
    `[Attendance Export Preview] ` +
    `candidates=${stats.candidates} ` +
    `withCourse=${stats.withResolvedCourse} ` +
    `withBatch=${stats.withResolvedBatch} ` +
    `timetableRecordsLoaded=${stats.timetableRecordsLoaded} ` +
    `matchedTimetable=${stats.matchedTimetable} ` +
    `rejectedTimetable=${stats.rejectedTimetable} ` +
    `noCourse=${stats.skippedNoCourse} ` +
    `courseFilter=${stats.skippedCourseFilter} ` +
    `rejectionReasons=${JSON.stringify(stats.rejectionReasons)} ` +
    `final=${out.length}`;
  if (out.length === 0 || debug) {
    console.warn(summary);
  }
  if (debug) {
    console.info(
      `[Attendance Export Preview] titles+transform: ${Date.now() - tTitle} ms; ` +
        `total: ${Date.now() - t0} ms`
    );
  }

  return { rows: out, filters: { department, dateFrom, dateTo, courseCode, batchUuid } };
}

function aggregateReportRows(absentRows) {
  const groups = new Map();
  for (const row of absentRows) {
    const dateKey = toDateKey(row.examDate) || String(row.examDate || "").slice(0, 10);
    const key = `${dateKey}|${row.session}|${row.courseCode}`;
    if (!groups.has(key)) {
      groups.set(key, {
        examDate: dateKey,
        session: row.session,
        courseCode: row.courseCode,
        courseTitle: row.courseTitle,
        examType: row.examType,
        batchUuid: row.batchUuid || null,
        batchName: row.batchName,
        semesterLabel: row.semesterLabel,
        semesterType: row.semesterType,
        academicYearLabel: row.academicYearLabel,
        regnNos: [],
      });
    }
    const g = groups.get(key);
    if (!g.courseTitle && row.courseTitle) g.courseTitle = row.courseTitle;
    if (!g.batchName && row.batchName) g.batchName = row.batchName;
    if (!g.batchUuid && row.batchUuid) g.batchUuid = row.batchUuid;
    g.regnNos.push(row.regnNo);
  }

  const reportRows = [];
  for (const g of groups.values()) {
    const uniqueRegns = [...new Set(g.regnNos)];
    uniqueRegns.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    reportRows.push({
      examDate: g.examDate,
      examDateDisplay: formatDateDisplay(g.examDate),
      session: g.session,
      courseCode: g.courseCode || "—",
      courseTitle: g.courseTitle || "—",
      absenteeCount: uniqueRegns.length,
      rollNumbers: uniqueRegns,
      rollNumbersDisplay: compactAbsenteeRolls(uniqueRegns),
      examType: g.examType,
      batchUuid: g.batchUuid || null,
      batchName: g.batchName || null,
      semesterLabel: g.semesterLabel,
      semesterType: g.semesterType,
      academicYearLabel: g.academicYearLabel,
    });
  }

  reportRows.sort((a, b) => {
    const d = String(a.examDate).localeCompare(String(b.examDate));
    if (d !== 0) return d;
    const s = String(a.session).localeCompare(String(b.session));
    if (s !== 0) return s;
    return String(a.courseCode).localeCompare(String(b.courseCode));
  });

  return reportRows;
}

/**
 * Split absentees into one report section per academic batch.
 * Each section aggregates date|session|course with batch-scoped counts only.
 */
function buildBatchSections(absentRows) {
  const byBatch = new Map();
  for (const row of absentRows || []) {
    const name = String(row.batchName || "").trim();
    if (!name) continue; // no blank batch pages
    const key = row.batchUuid || `__name__:${name}`;
    if (!byBatch.has(key)) {
      byBatch.set(key, {
        batchUuid: row.batchUuid || null,
        batchName: name,
        absentRows: [],
      });
    }
    byBatch.get(key).absentRows.push(row);
  }

  const sections = [];
  for (const batch of byBatch.values()) {
    const rows = aggregateReportRows(batch.absentRows);
    if (!rows.length) continue;
    sections.push({
      batchUuid: batch.batchUuid,
      batchName: batch.batchName,
      rows,
      recordCount: rows.length,
      totalAbsentees: rows.reduce((sum, r) => sum + (r.absenteeCount || 0), 0),
      yearSemester: yearSemesterLabel(batch.absentRows),
      examType: dominantExamType(rows),
      academicYear:
        batch.absentRows.find((r) => r.academicYearLabel)?.academicYearLabel || null,
    });
  }

  sections.sort((a, b) =>
    String(a.batchName).localeCompare(String(b.batchName), undefined, {
      numeric: true,
    })
  );
  return sections;
}

function buildMeta(filters, absentRows, reportRows, batchSections = []) {
  const ayFromData =
    absentRows.find((r) => r.academicYearLabel)?.academicYearLabel ||
    batchSections.find((b) => b.academicYear)?.academicYear;
  const deptLabel = filters.department || "All Departments";
  return {
    department: deptLabel,
    departmentHeader: departmentDisplayName(deptLabel),
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    dateFromDisplay: formatDateSlash(filters.dateFrom),
    dateToDisplay: formatDateSlash(filters.dateTo),
    courseCode: filters.courseCode || "",
    courseLabel: filters.courseCode || "All Courses",
    batchUuid: filters.batchUuid || "",
    batchLabel:
      filters.batchUuid
        ? absentRows.find((r) => r.batchUuid === filters.batchUuid)?.batchName ||
          batchSections[0]?.batchName ||
          "Selected Batch"
        : "All Batches",
    academicYear: ayFromData || academicYearLabel(filters.dateFrom),
    yearSemester: yearSemesterLabel(absentRows),
    examType: dominantExamType(reportRows.length ? reportRows : absentRows),
    recordCount: reportRows.length,
    totalAbsentees: reportRows.reduce((sum, r) => sum + (r.absenteeCount || 0), 0),
    batchCount: batchSections.length,
  };
}

const ConsolidatedAbsenteeExportService = {
  /**
   * Cascading filter options for /attendance/export/options.
   *
   * MUST stay lean — never run preview/timetable validation / DOCX pipeline.
   *
   * Course identity comes from seating (regn-matched seating_plan_students),
   * NOT from students.course_description (multi-enrollment rows).
   *
   * Root cause of the 47-minute query (removed):
   *   JOIN seating_plan_students sps ON sps.seating_plan_id = sp.id
   * without matching the attendance student's regn → cartesian explosion
   * (attendance × every plan student), then DISTINCT/MAX + correlated titles.
   */
  getOptions: async (user, role, query = {}) => {
    const t0 = Date.now();
    const dateFrom = parseDateParam(query.dateFrom || query.date_from);
    const dateTo = parseDateParam(query.dateTo || query.date_to);
    const department = String(query.department || "").trim();
    const batchUuid = String(query.batchUuid || query.batch || "").trim();
    const debug = process.env.ATTENDANCE_EXPORT_DEBUG === "1";

    let roleScope;
    try {
      roleScope = await buildRoleScope(user, role);
    } catch (err) {
      console.error("consolidated export buildRoleScope:", err?.message || err);
      roleScope = { sql: "", params: [], needFaJoin: false };
    }

    if (!dateFrom || !dateTo) {
      return {
        departments: [],
        courses: [],
        batches: [],
        message: "Select Date From and Date To to load filter options.",
      };
    }
    if (dateTo < dateFrom) {
      return {
        departments: [],
        courses: [],
        batches: [],
        message: "Date To cannot be before Date From.",
      };
    }

    const programExpr = PROGRAM_FROM_REGN_SQL("st");
    const hasProgram = HAS_PROGRAM_REGN_SQL("st");
    const deptMatch = departmentMatchClause(department, "st");
    const deptSql = deptMatch.sql === "TRUE" ? "" : `AND ${deptMatch.sql}`;
    const roleSql = roleScope.sql || "";
    const roleParams = roleScope.params || [];
    // Cascade: Date → Department → Batch → Course (courses require batchUuid).
    const batchSql = batchUuid ? "AND b_opt.public_uuid = ?" : "";
    const baseParams = [dateFrom, dateTo, ...deptMatch.params];
    if (batchUuid) baseParams.push(batchUuid);
    baseParams.push(...roleParams);

    const timed = async (label, fn) => {
      const start = Date.now();
      try {
        return await fn();
      } finally {
        if (debug) {
          console.info(
            `[Attendance Export] options ${label}: ${Date.now() - start} ms`
          );
        }
      }
    };

    // Start from exams (date filter first), then attendance — never scan all students.
    const [departments, courseRows, batchRows] = await Promise.all([
      timed("departments", async () => {
        try {
          const [deptRows] = await db.query(
            `SELECT DISTINCT ${programExpr} AS department
             FROM exams e
             JOIN attendance att ON att.exam_id = e.id
             JOIN students st ON st.id = att.student_id
             WHERE e.exam_date BETWEEN ? AND ?
               AND ${hasProgram}
               AND ${programExpr} IS NOT NULL
               AND ${programExpr} !~ '^(KSI|KCT)$'
               ${roleSql}
             ORDER BY 1 ASC`,
            [dateFrom, dateTo, ...roleParams]
          );
          return (deptRows || [])
            .map((r) => r.department)
            .filter((d) => d && !/^(KSI|KCT)$/i.test(d));
        } catch (err) {
          console.error("consolidated export departments query:", err?.message || err);
          return [];
        }
      }),

      // Courses for selected batch only (Date → Dept → Batch → Course).
      timed("courses", async () => {
        if (!batchUuid) return [];
        try {
          const [rows] = await db.query(
            `SELECT DISTINCT
               TRIM(sps.course_description) AS course_code
             FROM exams e
             JOIN attendance att ON att.exam_id = e.id
             JOIN students st ON st.id = att.student_id
             JOIN batches b_opt ON b_opt.id = st.batch_id
             JOIN seating_plan_venues spv ON spv.venue_id = att.venue_id
             JOIN seating_plans sp
               ON sp.id = spv.seating_plan_id
              AND sp.exam_date = e.exam_date
              AND (e.exam_session IS NULL OR sp.exam_session = e.exam_session)
             JOIN seating_plan_students sps
               ON sps.seating_plan_id = sp.id
              AND lower(btrim(sps.regn_no)) = lower(btrim(st.regn_no))
             WHERE e.exam_date BETWEEN ? AND ?
               ${deptSql}
               ${batchSql}
               AND sps.course_description IS NOT NULL
               AND btrim(sps.course_description) <> ''
               ${roleSql}
             ORDER BY 1 ASC`,
            baseParams
          );
          let codes = (rows || [])
            .map((r) => String(r.course_code ?? r.coursecode ?? "").trim())
            .filter(Boolean);

          // Fallback: selected_courses on plans that have dept+batch attendance.
          if (!codes.length) {
            const [selRows] = await db.query(
              `SELECT DISTINCT sp.selected_courses AS selected_courses
               FROM exams e
               JOIN seating_plans sp
                 ON sp.exam_date = e.exam_date
                AND (e.exam_session IS NULL OR sp.exam_session = e.exam_session)
               WHERE e.exam_date BETWEEN ? AND ?
                 AND sp.selected_courses IS NOT NULL
                 AND TRIM(sp.selected_courses) <> ''
                 AND EXISTS (
                   SELECT 1
                   FROM attendance att
                   JOIN students st ON st.id = att.student_id
                   JOIN batches b_opt ON b_opt.id = st.batch_id
                   JOIN seating_plan_venues spv
                     ON spv.seating_plan_id = sp.id
                    AND spv.venue_id = att.venue_id
                   WHERE att.exam_id = e.id
                     ${deptSql}
                     ${batchSql}
                     ${roleSql}
                 )`,
              baseParams
            );
            const set = new Set();
            for (const row of selRows || []) {
              for (const code of parseSelectedCourseCodes(
                row.selected_courses ?? row.selectedcourses
              )) {
                set.add(code);
              }
            }
            codes = [...set];
          }

          return codes.map((code) => ({ course_code: code }));
        } catch (err) {
          console.error("consolidated export courses query:", err?.message || err);
          return [];
        }
      }),

      // Batches for date (+ department). Not filtered by course (course comes after batch).
      timed("batches", async () => {
        try {
          const batchParams = [dateFrom, dateTo, ...deptMatch.params, ...roleParams];
          const [rows] = await db.query(
            `SELECT DISTINCT
               b.public_uuid AS batch_uuid,
               b.name AS batch_name
             FROM exams e
             JOIN attendance att ON att.exam_id = e.id
             JOIN students st ON st.id = att.student_id
             JOIN batches b ON b.id = st.batch_id
             WHERE e.exam_date BETWEEN ? AND ?
               ${deptSql}
               AND b.public_uuid IS NOT NULL
               AND b.name IS NOT NULL
               AND TRIM(b.name) <> ''
               ${roleSql}
             ORDER BY b.name ASC`,
            batchParams
          );
          return rows || [];
        } catch (err) {
          console.error("consolidated export batches query:", err?.message || err);
          return [];
        }
      }),
    ]);

    const rawCodes = (courseRows || [])
      .map((r) => String(r.course_code ?? r.coursecode ?? "").trim())
      .filter(Boolean);
    const titleMap = await timed("course titles", () =>
      bulkLookupCourseTitles(rawCodes, dateFrom, dateTo)
    );

    const courses = [
      ...new Map(
        rawCodes.map((code) => {
          const key = code.toUpperCase();
          const title = titleMap.get(key) || "";
          return [
            key,
            {
              code,
              title,
              label: title ? `${code} — ${title}` : code,
            },
          ];
        })
      ).values(),
    ].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

    const batches = (batchRows || [])
      .map((r) => ({
        uuid: r.batch_uuid ?? r.batchuuid,
        name: r.batch_name ?? r.batchname,
      }))
      .filter((b) => b.uuid && b.name);

    if (debug) {
      console.info(
        `[Attendance Export] options total: ${Date.now() - t0} ms ` +
          `(depts=${departments.length}, courses=${courses.length}, batches=${batches.length})`
      );
    }

    return {
      departments,
      courses,
      batches,
      message:
        departments.length === 0
          ? "No attendance records found for the selected date range."
          : null,
    };
  },

  preview: async (user, role, filters = {}) => {
    const { rows: absentRows, filters: f } = await fetchAbsentStudentRows(user, role, filters);
    const batchSections = buildBatchSections(absentRows);
    const reportRows = batchSections.flatMap((b) =>
      (b.rows || []).map((row) => ({
        ...row,
        batchUuid: b.batchUuid,
        batchName: b.batchName,
      }))
    );
    const meta = buildMeta(f, absentRows, reportRows, batchSections);

    if (f.batchUuid && meta.batchLabel === "Selected Batch") {
      const [b] = await db.query(
        `SELECT name FROM batches WHERE public_uuid = ? LIMIT 1`,
        [f.batchUuid]
      );
      if (b?.[0]?.name) meta.batchLabel = b[0].name;
    }

    return {
      meta,
      batches: batchSections,
      rows: reportRows,
      empty: batchSections.length === 0,
    };
  },

  exportDocx: async (user, role, filters = {}) => {
    const preview = await ConsolidatedAbsenteeExportService.preview(user, role, filters);
    if (preview.empty) {
      const err = new Error("No attendance records found for the selected filters.");
      err.statusCode = 404;
      throw err;
    }

    let verification = null;
    try {
      verification = await ReportVerification.create({
        reportType: "Consolidated Absentees List",
        user,
        metadata: {
          department: preview.meta.department,
          dateFrom: preview.meta.dateFrom,
          dateTo: preview.meta.dateTo,
          courseCode: preview.meta.courseCode || null,
          batchUuid: preview.meta.batchUuid || null,
          examType: preview.meta.examType,
          recordCount: preview.meta.recordCount,
          totalAbsentees: preview.meta.totalAbsentees,
        },
      });
    } catch (verErr) {
      console.error("Consolidated absentees verification create failed:", verErr?.message || verErr);
      verification = {
        uuid: null,
        verificationId: `HAL-LOCAL-${Date.now()}`,
        generatedAt: new Date().toISOString(),
      };
    }

    const { buildConsolidatedAbsenteeDocx } = require("../utils/consolidatedAbsenteeDocx");
    let buffer;
    try {
      buffer = await buildConsolidatedAbsenteeDocx({
        meta: preview.meta,
        batches: preview.batches,
        rows: preview.rows,
        verification: {
          verificationId: verification.verificationId,
          generatedAt: verification.generatedAt,
        },
      });
    } catch (docxErr) {
      console.error("DOCX build failed:", docxErr?.message || docxErr);
      const err = new Error(
        docxErr?.message || "Failed to generate DOCX. Ensure the backend `docx` package is installed."
      );
      err.statusCode = 500;
      throw err;
    }

    if (verification?.uuid) {
      try {
        const hash = crypto.createHash("sha256").update(buffer).digest("hex");
        await ReportVerification.finalize(verification.uuid, hash);
      } catch (finErr) {
        console.error("Verification finalize failed:", finErr?.message || finErr);
      }
    }

    const deptShort = sanitizeFilenamePart(preview.meta.department).slice(0, 20);
    const examShort = sanitizeFilenamePart(preview.meta.examType);
    const from = dateForFilename(preview.meta.dateFrom);
    const to = dateForFilename(preview.meta.dateTo);
    let filename;
    if (preview.meta.batchUuid && preview.batches?.[0]?.batchName) {
      const batchShort = sanitizeFilenamePart(preview.batches[0].batchName);
      filename = `Hallora_Consolidated_Absentees_${deptShort}_${examShort}_${batchShort}_${from}_to_${to}.docx`;
    } else if (preview.meta.courseCode) {
      filename = `Hallora_Absentees_${sanitizeFilenamePart(preview.meta.courseCode)}_${examShort}_${from}_to_${to}.docx`;
    } else {
      filename = `Hallora_Consolidated_Absentees_${deptShort}_${examShort}_${from}_to_${to}_All-Batches.docx`;
    }

    return {
      buffer,
      filename,
      verificationId: verification.verificationId,
      documentHash: hash,
      meta: preview.meta,
    };
  },
};

module.exports = ConsolidatedAbsenteeExportService;
