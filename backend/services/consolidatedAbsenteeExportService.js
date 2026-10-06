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
  const s = String(raw).toUpperCase();
  if (s.includes("FN") || s === "MORNING") return "FN";
  if (s.includes("AN") || s === "AFTERNOON") return "AN";
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
  const raw = String(value);
  const iso = raw.includes("T") ? raw.split("T")[0] : raw.slice(0, 10);
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return raw;
  return `${d}.${m}.${y}`;
}

function formatDateSlash(value) {
  if (!value) return "";
  const raw = String(value);
  const iso = raw.includes("T") ? raw.split("T")[0] : raw.slice(0, 10);
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return raw;
  return `${d}/${m}/${y}`;
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
 * Resolve the course a student was seated for in a venue on an exam date/session.
 * Canonical source: seating_layout_json / seating_plan_students (same as attendance Excel export).
 * Enrollment course on students.course_description is only a fallback — a student may have
 * multiple enrollment rows, and attendance.student_id can point at the wrong one.
 */
async function buildVenueCourseMap(examId, venueId) {
  const { resolveVenueStudentsWithCourses } = require("../utils/venueAttendanceCourses");
  const [spvRows] = await db.query(
    `SELECT spv.id, spv.seating_layout_json, spv.seating_plan_id
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
  if (!spv) return new Map();

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
  return new Map(
    (students || [])
      .filter((s) => s.regNo && s.courseCode)
      .map((s) => [String(s.regNo).trim().toUpperCase(), String(s.courseCode).trim()])
  );
}

async function lookupCourseTitle(courseCode, titleCache) {
  const code = String(courseCode || "").trim();
  if (!code) return "";
  const key = code.toUpperCase();
  if (titleCache.has(key)) return titleCache.get(key);
  const [rows] = await db.query(
    `SELECT course_name
     FROM students
     WHERE UPPER(TRIM(course_description)) = UPPER(TRIM(?))
       AND course_name IS NOT NULL
       AND TRIM(course_name) <> ''
     LIMIT 1`,
    [code]
  );
  const title = String(rows?.[0]?.course_name ?? rows?.[0]?.coursename ?? "").trim();
  titleCache.set(key, title);
  return title;
}

/**
 * Raw absentee rows for consolidated export.
 * Course comes from seating (exam session truth), not from possibly-wrong enrollment row.
 * One physical mark per (regn, exam, venue) — prevents duplicate courses from multi-enrollment student rows.
 */
async function fetchAbsentStudentRows(user, role, filters) {
  const { department, dateFrom, dateTo, courseCode, batchUuid } = validateFilters(filters);
  const roleScope = await buildRoleScope(user, role);

  let extra = "";
  // Course filter applied AFTER seating course resolution (not on enrollment column).
  if (batchUuid) {
    extra += " AND b.public_uuid = ?";
  }

  const deptMatch = departmentMatchClause(department, "st");
  const queryParams = [dateFrom, dateTo];
  if (deptMatch.params.length) queryParams.push(...deptMatch.params);
  if (batchUuid) queryParams.push(batchUuid);
  queryParams.push(...(roleScope.params || []));

  const deptSql = deptMatch.sql === "TRUE" ? "" : `AND ${deptMatch.sql}`;

  const [rows] = await db.query(
    `SELECT
       att.id AS attendance_id,
       att.venue_id,
       st.regn_no,
       st.student_name,
       st.course_description AS enrollment_course,
       st.course_name AS enrollment_title,
       ${PROGRAM_FROM_REGN_SQL("st")} AS student_department,
       b.public_uuid AS batch_uuid,
       b.name AS batch_name,
       e.exam_date,
       e.exam_session,
       e.exam_name,
       e.exam_code,
       e.id AS exam_id,
       sem.semester_type,
       sem.label AS semester_label,
       ay.label AS academic_year_label,
       (
         SELECT sp.exam_type
         FROM seating_plans sp
         JOIN seating_plan_venues spv ON spv.seating_plan_id = sp.id
         WHERE spv.venue_id = att.venue_id
           AND sp.exam_date = e.exam_date
           AND (e.exam_session IS NULL OR sp.exam_session = e.exam_session)
         ORDER BY sp.id DESC
         LIMIT 1
       ) AS seating_exam_type
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

  const venueCourseCache = new Map();
  const titleCache = new Map();
  // One absentee per physical exam+venue seat occupancy (regn), not per enrollment row.
  const seenPhysical = new Set();
  const out = [];
  const courseFilter = String(courseCode || "").trim().toUpperCase();

  for (const r of rows || []) {
    const attId = r.attendance_id ?? r.attendanceid;
    const regn = String(r.regn_no ?? r.regnno ?? "").trim();
    const examId = r.exam_id ?? r.examid;
    const venueId = r.venue_id ?? r.venueid;
    if (!regn || examId == null || venueId == null) continue;

    const physicalKey = `${regn.toUpperCase()}::${examId}::${venueId}`;
    if (seenPhysical.has(physicalKey)) continue;

    const cacheKey = `${examId}::${venueId}`;
    if (!venueCourseCache.has(cacheKey)) {
      try {
        venueCourseCache.set(cacheKey, await buildVenueCourseMap(examId, venueId));
      } catch (err) {
        console.error(
          "consolidated export seating course map failed:",
          err?.message || err
        );
        venueCourseCache.set(cacheKey, new Map());
      }
    }
    const seatedMap = venueCourseCache.get(cacheKey);
    const enrollmentCourse = String(
      r.enrollment_course ?? r.enrollmentcourse ?? ""
    ).trim();
    const seatedCourse =
      seatedMap?.get(regn.toUpperCase()) ||
      seatedMap?.get(regn) ||
      "";
    const course = seatedCourse || enrollmentCourse;
    if (!course) continue;

    if (courseFilter && course.toUpperCase() !== courseFilter) {
      // Seated course is fixed per regn+venue; later enrollment rows won't change it.
      seenPhysical.add(physicalKey);
      continue;
    }

    seenPhysical.add(physicalKey);

    let courseTitle = "";
    const enrollmentTitle = String(
      r.enrollment_title ?? r.enrollmenttitle ?? ""
    ).trim();
    if (
      enrollmentCourse &&
      course.toUpperCase() === enrollmentCourse.toUpperCase() &&
      enrollmentTitle
    ) {
      courseTitle = enrollmentTitle;
    } else {
      courseTitle = await lookupCourseTitle(course, titleCache);
      if (!courseTitle) courseTitle = enrollmentTitle;
    }

    out.push({
      attendanceId: attId,
      regnNo: regn,
      studentName: r.student_name ?? r.studentname ?? "",
      courseCode: course,
      courseTitle,
      batchUuid: r.batch_uuid ?? r.batchuuid ?? null,
      batchName: r.batch_name ?? r.batchname ?? null,
      examDate: r.exam_date ?? r.examdate,
      session: normalizeSession(r.exam_session ?? r.examsession),
      examType: deriveExamType(
        r.exam_name ?? r.examname,
        r.exam_code ?? r.examcode,
        r.seating_exam_type ?? r.seatingexamtype
      ),
      semesterType: r.semester_type ?? r.semestertype ?? null,
      semesterLabel: r.semester_label ?? r.semesterlabel ?? null,
      academicYearLabel: r.academic_year_label ?? r.academicyearlabel ?? null,
      studentDepartment: r.student_department ?? r.studentdepartment ?? department,
    });
  }

  return { rows: out, filters: { department, dateFrom, dateTo, courseCode, batchUuid } };
}

function aggregateReportRows(absentRows) {
  const groups = new Map();
  for (const row of absentRows) {
    const dateKey = String(row.examDate || "").slice(0, 10);
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
   * Cascading filter options from ACTUAL attendance records in a date range.
   * Departments = program codes from student regn_no (BCS/BIT/…), never org KSI.
   * Query: dateFrom, dateTo, department?, courseCode?
   */
  getOptions: async (user, role, query = {}) => {
    const dateFrom = parseDateParam(query.dateFrom || query.date_from);
    const dateTo = parseDateParam(query.dateTo || query.date_to);
    const department = String(query.department || "").trim();
    const courseCode = String(query.courseCode || query.course || "").trim();

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

    // --- Departments (program codes present in attendance for the date range) ---
    let departments = [];
    try {
      const [deptRows] = await db.query(
        `SELECT DISTINCT ${programExpr} AS department
         FROM attendance att
         JOIN students st ON st.id = att.student_id
         JOIN exams e ON e.id = att.exam_id
         WHERE e.exam_date BETWEEN ? AND ?
           AND ${hasProgram}
           AND ${programExpr} IS NOT NULL
           AND ${programExpr} !~ '^(KSI|KCT)$'
           ${roleScope.sql || ""}
         ORDER BY 1 ASC`,
        [dateFrom, dateTo, ...(roleScope.params || [])]
      );
      departments = (deptRows || [])
        .map((r) => r.department)
        .filter((d) => d && !/^(KSI|KCT)$/i.test(d));
    } catch (err) {
      console.error("consolidated export departments query:", err?.message || err);
      departments = [];
    }

    // --- Courses (attendance in range, optional department) ---
    let courseRows = [];
    try {
      const courseParams = [dateFrom, dateTo, ...deptMatch.params, ...(roleScope.params || [])];
      const [rows] = await db.query(
        `SELECT DISTINCT
           TRIM(st.course_description) AS course_code,
           TRIM(st.course_name) AS course_title
         FROM attendance att
         JOIN students st ON st.id = att.student_id
         JOIN exams e ON e.id = att.exam_id
         WHERE e.exam_date BETWEEN ? AND ?
           ${deptSql}
           AND st.course_description IS NOT NULL
           AND TRIM(st.course_description) <> ''
           ${roleScope.sql || ""}
         ORDER BY 1 ASC`,
        courseParams
      );
      courseRows = rows || [];
    } catch (err) {
      console.error("consolidated export courses query:", err?.message || err);
      courseRows = [];
    }

    const courses = (courseRows || [])
      .map((r) => {
        const code = r.course_code ?? r.coursecode;
        const title = (r.course_title ?? r.coursetitle) || "";
        if (!code) return null;
        return {
          code,
          title,
          label: title ? `${code} — ${title}` : code,
        };
      })
      .filter(Boolean);

    // --- Batches (academic batch names from batches table via student.batch_id) ---
    let batchRows = [];
    try {
      const batchParams = [dateFrom, dateTo, ...deptMatch.params];
      let courseClause = "";
      if (courseCode) {
        courseClause = " AND UPPER(TRIM(st.course_description)) = UPPER(TRIM(?))";
        batchParams.push(courseCode);
      }
      batchParams.push(...(roleScope.params || []));

      const [rows] = await db.query(
        `SELECT DISTINCT
           b.public_uuid AS batch_uuid,
           b.name AS batch_name
         FROM attendance att
         JOIN students st ON st.id = att.student_id
         JOIN batches b ON b.id = st.batch_id
         JOIN exams e ON e.id = att.exam_id
         WHERE e.exam_date BETWEEN ? AND ?
           ${deptSql}
           ${courseClause}
           AND b.public_uuid IS NOT NULL
           AND b.name IS NOT NULL
           AND TRIM(b.name) <> ''
           ${roleScope.sql || ""}
         ORDER BY b.name ASC`,
        batchParams
      );
      batchRows = rows || [];
    } catch (err) {
      console.error("consolidated export batches query:", err?.message || err);
      batchRows = [];
    }

    const batches = (batchRows || [])
      .map((r) => ({
        uuid: r.batch_uuid ?? r.batchuuid,
        name: r.batch_name ?? r.batchname,
      }))
      .filter((b) => b.uuid && b.name);

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
