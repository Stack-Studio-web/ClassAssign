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
  if (!d) return "";
  if (/^DEPARTMENT\s+OF\s+/i.test(d)) return d.toUpperCase();
  return `DEPARTMENT OF ${d.toUpperCase()}`;
}

/**
 * Match students by department column OR by dept code embedded in regn_no
 * (e.g. BCS matches students.department='BCS' or regn like 24BCS001).
 * Returns { sql, params } — params are the department value repeated as needed.
 */
function departmentMatchClause(department, alias = "st") {
  const dept = String(department || "").trim().toUpperCase();
  const sql = `(
    UPPER(TRIM(COALESCE(${alias}.department, ''))) = ?
    OR (
      LENGTH(?) BETWEEN 2 AND 8
      AND UPPER(TRIM(COALESCE(${alias}.regn_no, ''))) LIKE CONCAT('__', ?, '%')
    )
  )`;
  return { sql, params: [dept, dept, dept] };
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

  if (!department) {
    const err = new Error("Department is required");
    err.statusCode = 400;
    throw err;
  }
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
 * Raw absentee rows joined to student enrollment (course + batch).
 */
async function fetchAbsentStudentRows(user, role, filters) {
  const { department, dateFrom, dateTo, courseCode, batchUuid } = validateFilters(filters);
  const roleScope = await buildRoleScope(user, role);

  let extra = "";
  if (courseCode) {
    extra += " AND UPPER(TRIM(st.course_description)) = UPPER(TRIM(?))";
  }
  if (batchUuid) {
    extra += " AND b.public_uuid = ?";
  }

  const deptMatch = departmentMatchClause(department, "st");
  const queryParams = [dateFrom, dateTo, ...deptMatch.params];
  if (courseCode) queryParams.push(courseCode);
  if (batchUuid) queryParams.push(batchUuid);
  queryParams.push(...(roleScope.params || []));

  const [rows] = await db.query(
    `SELECT
       att.id AS attendance_id,
       st.regn_no,
       st.student_name,
       st.course_description AS course_code,
       st.course_name AS course_title,
       st.department AS student_department,
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
       AND ${deptMatch.sql}
       ${extra}
       ${roleScope.sql || ""}
     ORDER BY e.exam_date ASC, e.exam_session ASC, st.course_description ASC, st.regn_no ASC, att.id ASC`,
    queryParams
  );

  // Deduplicate by attendance_id (or student+exam+course)
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    const attId = r.attendance_id ?? r.attendanceid;
    const regn = String(r.regn_no ?? r.regnno ?? "").trim();
    const examId = r.exam_id ?? r.examid;
    const course = String(r.course_code ?? r.coursecode ?? "").trim();
    const key = attId != null ? `a:${attId}` : `${regn}::${examId}::${course}`;
    if (!regn || seen.has(key)) continue;
    seen.add(key);

    out.push({
      regnNo: regn,
      studentName: r.student_name ?? r.studentname ?? "",
      courseCode: course,
      courseTitle: String(r.course_title ?? r.coursetitle ?? "").trim(),
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
        batchName: row.batchName,
        semesterLabel: row.semesterLabel,
        semesterType: row.semesterType,
        academicYearLabel: row.academicYearLabel,
        regnNos: [],
      });
    }
    const g = groups.get(key);
    if (!g.courseTitle && row.courseTitle) g.courseTitle = row.courseTitle;
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
      batchName: g.batchName,
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

function buildMeta(filters, absentRows, reportRows) {
  const ayFromData = absentRows.find((r) => r.academicYearLabel)?.academicYearLabel;
  return {
    department: filters.department,
    departmentHeader: departmentDisplayName(filters.department),
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    dateFromDisplay: formatDateSlash(filters.dateFrom),
    dateToDisplay: formatDateSlash(filters.dateTo),
    courseCode: filters.courseCode || "",
    courseLabel: filters.courseCode || "All Courses",
    batchUuid: filters.batchUuid || "",
    batchLabel:
      filters.batchUuid
        ? absentRows.find((r) => r.batchUuid === filters.batchUuid)?.batchName || "Selected Batch"
        : "All Batches",
    academicYear: ayFromData || academicYearLabel(filters.dateFrom),
    yearSemester: yearSemesterLabel(absentRows),
    examType: dominantExamType(reportRows.length ? reportRows : absentRows),
    recordCount: reportRows.length,
    totalAbsentees: reportRows.reduce((sum, r) => sum + (r.absenteeCount || 0), 0),
  };
}

const ConsolidatedAbsenteeExportService = {
  /**
   * Cascading filter options.
   * GET without department → departments list.
   * With department → courses (+ batches if course also set).
   */
  getOptions: async (user, role, query = {}) => {
    const department = String(query.department || "").trim();
    const courseCode = String(query.courseCode || query.course || "").trim();
    let roleScope;
    try {
      roleScope = await buildRoleScope(user, role);
    } catch (err) {
      console.error("consolidated export buildRoleScope:", err?.message || err);
      roleScope = { sql: "", params: [], needFaJoin: false };
    }
    const faJoin = ""; // role scope no longer requires fa/v joins

    // Prefer student enrollment department from any attendance mark (not only Absent),
    // so the Department dropdown is usable before absentees exist.
    if (!department) {
      try {
        const [deptRows] = await db.query(
          `SELECT DISTINCT UPPER(TRIM(st.department)) AS department
           FROM attendance att
           JOIN students st ON st.id = att.student_id
           JOIN exams e ON e.id = att.exam_id
           ${faJoin}
           WHERE st.department IS NOT NULL
             AND TRIM(st.department) <> ''
             ${roleScope.sql || ""}
           ORDER BY 1 ASC`,
          roleScope.params || []
        );
        const departments = (deptRows || [])
          .map((r) => r.department)
          .filter(Boolean);
        return { departments, courses: [], batches: [] };
      } catch (err) {
        console.error("consolidated export departments query:", err?.message || err);
        // Fallback: departments from students table
        try {
          const [fallback] = await db.query(
            `SELECT DISTINCT UPPER(TRIM(department)) AS department
             FROM students
             WHERE department IS NOT NULL AND TRIM(department) <> ''
             ORDER BY 1 ASC`
          );
          return {
            departments: (fallback || []).map((r) => r.department).filter(Boolean),
            courses: [],
            batches: [],
          };
        } catch (err2) {
          console.error("consolidated export departments fallback:", err2?.message || err2);
          return { departments: [], courses: [], batches: [] };
        }
      }
    }

    const deptMatch = departmentMatchClause(department, "st");
    const deptParams = [...deptMatch.params, ...(roleScope.params || [])];
    let courseRows = [];
    try {
      const [rows] = await db.query(
        `SELECT DISTINCT
           TRIM(st.course_description) AS course_code,
           TRIM(st.course_name) AS course_title
         FROM attendance att
         JOIN students st ON st.id = att.student_id
         JOIN exams e ON e.id = att.exam_id
         ${faJoin}
         WHERE ${deptMatch.sql}
           AND st.course_description IS NOT NULL
           AND TRIM(st.course_description) <> ''
           ${roleScope.sql || ""}
         ORDER BY 1 ASC`,
        deptParams
      );
      courseRows = rows || [];
    } catch (err) {
      console.error("consolidated export courses query:", err?.message || err);
      const fbDept = departmentMatchClause(department, "st");
      const [rows] = await db.query(
        `SELECT DISTINCT
           TRIM(st.course_description) AS course_code,
           TRIM(st.course_name) AS course_title
         FROM students st
         WHERE ${fbDept.sql}
           AND st.course_description IS NOT NULL
           AND TRIM(st.course_description) <> ''
         ORDER BY 1 ASC`,
        fbDept.params
      );
      courseRows = rows || [];
    }

    const courses = (courseRows || []).map((r) => ({
      code: r.course_code ?? r.coursecode,
      title: (r.course_title ?? r.coursetitle) || "",
      label:
        (r.course_title ?? r.coursetitle)
          ? `${r.course_code ?? r.coursecode} — ${r.course_title ?? r.coursetitle}`
          : r.course_code ?? r.coursecode,
    }));

    const batchParams = [...deptMatch.params];
    let courseClause = "";
    if (courseCode) {
      courseClause = " AND UPPER(TRIM(st.course_description)) = UPPER(TRIM(?))";
      batchParams.push(courseCode);
    }
    batchParams.push(...(roleScope.params || []));

    let batchRows = [];
    try {
      const [rows] = await db.query(
        `SELECT DISTINCT
           b.public_uuid AS batch_uuid,
           b.name AS batch_name
         FROM attendance att
         JOIN students st ON st.id = att.student_id
         JOIN batches b ON b.id = st.batch_id
         JOIN exams e ON e.id = att.exam_id
         ${faJoin}
         WHERE ${deptMatch.sql}
           ${courseClause}
           ${roleScope.sql || ""}
         ORDER BY b.name ASC`,
        batchParams
      );
      batchRows = rows || [];
    } catch (err) {
      console.error("consolidated export batches query:", err?.message || err);
      const fbDept = departmentMatchClause(department, "st");
      const fbParams = [...fbDept.params];
      let fbCourse = "";
      if (courseCode) {
        fbCourse = " AND UPPER(TRIM(st.course_description)) = UPPER(TRIM(?))";
        fbParams.push(courseCode);
      }
      const [rows] = await db.query(
        `SELECT DISTINCT
           b.public_uuid AS batch_uuid,
           b.name AS batch_name
         FROM students st
         JOIN batches b ON b.id = st.batch_id
         WHERE ${fbDept.sql}
           ${fbCourse}
         ORDER BY b.name ASC`,
        fbParams
      );
      batchRows = rows || [];
    }

    const batches = (batchRows || []).map((r) => ({
      uuid: r.batch_uuid ?? r.batchuuid,
      name: r.batch_name ?? r.batchname,
    }));

    return { departments: [department], courses, batches };
  },

  preview: async (user, role, filters = {}) => {
    const { rows: absentRows, filters: f } = await fetchAbsentStudentRows(user, role, filters);
    const reportRows = aggregateReportRows(absentRows);
    const meta = buildMeta(f, absentRows, reportRows);

    if (f.batchUuid && meta.batchLabel === "Selected Batch") {
      const [b] = await db.query(
        `SELECT name FROM batches WHERE public_uuid = ? LIMIT 1`,
        [f.batchUuid]
      );
      if (b?.[0]?.name) meta.batchLabel = b[0].name;
    }

    return {
      meta,
      rows: reportRows,
      empty: reportRows.length === 0,
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
    if (preview.meta.courseCode) {
      filename = `Hallora_Absentees_${sanitizeFilenamePart(preview.meta.courseCode)}_${examShort}_${from}_to_${to}.docx`;
    } else {
      filename = `Hallora_Consolidated_Absentees_${deptShort}_${examShort}_${from}_to_${to}.docx`;
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
