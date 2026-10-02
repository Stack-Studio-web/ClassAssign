const db = require("../config/db");
const AcademicYear = require("../models/AcademicYear");

function normalizeTime(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }
  const match = String(value).trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function normalizeDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  return str.includes("T") ? str.split("T")[0] : str.slice(0, 10);
}

function timesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && bStart < aEnd;
}

function toScheduleRow(row) {
  const startTime =
    normalizeTime(row.start_time ?? row.starttime) ||
    normalizeTime(row.exam_start_time ?? row.examstarttime) ||
    "";
  const endTime =
    normalizeTime(row.end_time ?? row.endtime) ||
    normalizeTime(row.exam_end_time ?? row.examendtime) ||
    "";
  return {
    facultyId: row.faculty_uuid ?? row.facultyuuid ?? null,
    facultyUuid: row.faculty_uuid ?? row.facultyuuid ?? null,
    facultyName: row.faculty_name ?? row.facultyname ?? "",
    department: row.faculty_department ?? row.facultydepartment ?? "",
    examDate: normalizeDate(row.exam_date ?? row.examdate ?? row.assigned_date),
    startTime,
    endTime,
    examSession: row.exam_session ?? row.examsession ?? "",
    examType: row.exam_type ?? row.examtype ?? "",
    venueName: row.venue_name ?? row.venuename ?? "",
    venueUuid: row.venue_uuid ?? row.venueuuid ?? null,
    seatingPlanUuid: row.seating_plan_uuid ?? row.seatingplanuuid ?? null,
    assignmentUuid: row.assignment_uuid ?? row.assignmentuuid ?? null,
    hasFaculty: Boolean(row.faculty_name ?? row.facultyname),
  };
}

function groupSchedule(assignments) {
  const byDate = new Map();
  for (const a of assignments) {
    const dateKey = a.examDate || "unknown";
    if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
    const byTime = byDate.get(dateKey);
    const timeKey = `${a.startTime}|${a.endTime}`;
    if (!byTime.has(timeKey)) {
      byTime.set(timeKey, {
        examDate: a.examDate,
        startTime: a.startTime,
        endTime: a.endTime,
        examSession: a.examSession,
        examType: a.examType,
        assignments: [],
      });
    }
    byTime.get(timeKey).assignments.push(a);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([examDate, byTime]) => ({
      examDate,
      sessions: [...byTime.values()].sort((x, y) =>
        String(x.startTime).localeCompare(String(y.startTime))
      ),
    }));
}

function detectConflicts(assignments) {
  const warnings = [];
  const byFaculty = new Map();
  for (const a of assignments) {
    if (!a.facultyUuid && !a.facultyName) continue;
    const key = a.facultyUuid || a.facultyName;
    if (!byFaculty.has(key)) byFaculty.set(key, []);
    byFaculty.get(key).push(a);
  }
  for (const [, rows] of byFaculty) {
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        if (a.examDate !== b.examDate) continue;
        if (timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
          warnings.push({
            type: "FACULTY_OVERLAP",
            message: `${a.facultyName} has overlapping invigilation assignments on ${a.examDate} (${a.startTime}-${a.endTime} / ${b.startTime}-${b.endTime}).`,
            facultyName: a.facultyName,
            examDate: a.examDate,
          });
        }
      }
    }
  }
  // Deduplicate similar messages
  const seen = new Set();
  return warnings.filter((w) => {
    if (seen.has(w.message)) return false;
    seen.add(w.message);
    return true;
  });
}

/**
 * Faculty schedule grouped by examDate + startTime + endTime.
 * Source: seating plans (authoritative for allotment display) with assignment times when present.
 */
async function getFacultySchedule({
  date = null,
  startTime = null,
  endTime = null,
  seatingPlanIds = null,
} = {}) {
  const params = [];
  const where = ["1=1"];

  if (date) {
    where.push("sp.exam_date = ?");
    params.push(normalizeDate(date));
  }
  if (startTime) {
    where.push("sp.exam_start_time = ?::time");
    params.push(normalizeTime(startTime));
  }
  if (endTime) {
    where.push("sp.exam_end_time = ?::time");
    params.push(normalizeTime(endTime));
  }
  if (Array.isArray(seatingPlanIds) && seatingPlanIds.length > 0) {
    where.push(`sp.id IN (${seatingPlanIds.map(() => "?").join(",")})`);
    params.push(...seatingPlanIds);
  }

  const [rows] = await db.query(
    `
    SELECT
      f.public_uuid AS faculty_uuid,
      f.name AS faculty_name,
      f.department AS faculty_department,
      sp.public_uuid AS seating_plan_uuid,
      sp.exam_date,
      sp.exam_session,
      sp.exam_type,
      sp.exam_start_time,
      sp.exam_end_time,
      COALESCE(fa.start_time, sp.exam_start_time) AS start_time,
      COALESCE(fa.end_time, sp.exam_end_time) AS end_time,
      v.public_uuid AS venue_uuid,
      COALESCE(spv.venue_name, v.name) AS venue_name,
      fa.public_uuid AS assignment_uuid
    FROM seating_plan_venues spv
    JOIN seating_plans sp ON sp.id = spv.seating_plan_id
    LEFT JOIN venues v ON v.id = spv.venue_id
    LEFT JOIN seating_plan_venue_faculty spvf ON spvf.seating_plan_venue_id = spv.id
    LEFT JOIN faculty f ON f.id = COALESCE(spvf.faculty_id, spv.faculty_id)
    LEFT JOIN faculty_assignments fa
      ON fa.faculty_id = f.id
     AND fa.venue_id = spv.venue_id
     AND fa.assigned_date = sp.exam_date
    WHERE ${where.join(" AND ")}
      AND f.id IS NOT NULL
    ORDER BY sp.exam_date ASC, sp.exam_start_time ASC, sp.exam_end_time ASC,
             COALESCE(spv.venue_name, v.name) ASC, f.name ASC
    `,
    params
  );

  const assignments = (rows || []).map(toScheduleRow);
  return { assignments, schedule: groupSchedule(assignments) };
}

async function getInvigilationFilterOptions() {
  let academicYears = [];
  try {
    academicYears = await AcademicYear.list();
  } catch (err) {
    console.warn("academic years for invigilation options:", err?.message || err);
  }

  const semesters = [
    { value: "ODD", label: "Odd Sem" },
    { value: "EVEN", label: "Even Sem" },
  ];

  const DEFAULT_EXAM_TYPES = ["CAT 1", "CAT 2", "Model", "Semester", "Retest"];
  let examTypes = [...DEFAULT_EXAM_TYPES];
  try {
    const [typeRows] = await db.query(
      `SELECT DISTINCT TRIM(exam_type) AS exam_type
       FROM seating_plans
       WHERE exam_type IS NOT NULL AND TRIM(exam_type) <> ''
       ORDER BY 1 ASC`
    );
    const fromDb = (typeRows || [])
      .map((r) => r.exam_type ?? r.examtype)
      .filter(Boolean);
    examTypes = [...new Set([...DEFAULT_EXAM_TYPES, ...fromDb])];
  } catch (err) {
    console.warn("exam types for invigilation options:", err?.message || err);
  }

  let departments = [];
  try {
    const [deptRows] = await db.query(
      `SELECT DISTINCT UPPER(TRIM(department)) AS department FROM (
         SELECT department FROM faculty WHERE department IS NOT NULL AND TRIM(department) <> ''
         UNION
         SELECT department FROM students WHERE department IS NOT NULL AND TRIM(department) <> ''
         UNION
         SELECT department FROM timetable WHERE department IS NOT NULL AND TRIM(department) <> ''
       ) d
       ORDER BY 1 ASC`
    );
    departments = (deptRows || []).map((r) => r.department).filter(Boolean);
  } catch (err) {
    console.warn("departments for invigilation options:", err?.message || err);
  }

  let programs = [];
  try {
    const [progRows] = await db.query(
      `SELECT DISTINCT TRIM(selected_courses) AS program_label
       FROM seating_plans
       WHERE selected_courses IS NOT NULL AND TRIM(selected_courses) <> ''
       ORDER BY 1 ASC
       LIMIT 100`
    );
    programs = (progRows || [])
      .map((r) => r.program_label ?? r.programlabel)
      .filter(Boolean);
  } catch (err) {
    console.warn("programs for invigilation options:", err?.message || err);
  }

  return {
    academicYears,
    semesters,
    examTypes,
    departments,
    programs,
  };
}

/**
 * Filtered invigilation schedule for the export page.
 */
async function getInvigilationSchedulePreview(filters = {}) {
  const dateFrom = normalizeDate(filters.dateFrom || filters.date_from);
  const dateTo = normalizeDate(filters.dateTo || filters.date_to);
  const examType = String(filters.examType || filters.category || "").trim();
  const department = String(filters.department || "").trim();
  const semester = String(filters.semester || "").trim().toUpperCase();
  const academicYearLabel = String(filters.academicYear || filters.academic_year || "").trim();
  const program1 = String(filters.program1 || filters.program_1 || "").trim();
  const program2 = String(filters.program2 || filters.program_2 || "").trim();

  if (!dateFrom || !dateTo) {
    const err = new Error("Date From and Date To are required");
    err.statusCode = 400;
    throw err;
  }
  if (dateTo < dateFrom) {
    const err = new Error("Date To cannot be before Date From");
    err.statusCode = 400;
    throw err;
  }

  const params = [dateFrom, dateTo];
  const where = ["sp.exam_date BETWEEN ? AND ?"];

  if (examType) {
    where.push("sp.exam_type ILIKE ?");
    params.push(examType);
  }

  // Odd Sem ≈ Jul–Dec, Even Sem ≈ Jan–Jun (soft academic filter)
  if (semester === "ODD") {
    where.push("EXTRACT(MONTH FROM sp.exam_date) BETWEEN 7 AND 12");
  } else if (semester === "EVEN") {
    where.push("EXTRACT(MONTH FROM sp.exam_date) BETWEEN 1 AND 6");
  }

  if (department) {
    where.push(`(
      EXISTS (
        SELECT 1 FROM seating_plan_venue_faculty spvf2
        JOIN faculty f2 ON f2.id = spvf2.faculty_id
        WHERE spvf2.seating_plan_venue_id = spv.id
          AND UPPER(TRIM(COALESCE(f2.department, ''))) = UPPER(TRIM(?))
      )
      OR EXISTS (
        SELECT 1 FROM faculty f3
        WHERE f3.id = spv.faculty_id
          AND UPPER(TRIM(COALESCE(f3.department, ''))) = UPPER(TRIM(?))
      )
      OR sp.selected_courses ILIKE ?
    )`);
    params.push(department, department, `%${department}%`);
  }

  // Assigned faculty rows
  const [assignedRows] = await db.query(
    `
    SELECT
      f.public_uuid AS faculty_uuid,
      f.name AS faculty_name,
      f.department AS faculty_department,
      sp.public_uuid AS seating_plan_uuid,
      sp.exam_date,
      sp.exam_session,
      sp.exam_type,
      sp.exam_start_time,
      sp.exam_end_time,
      COALESCE(fa.start_time, sp.exam_start_time) AS start_time,
      COALESCE(fa.end_time, sp.exam_end_time) AS end_time,
      v.public_uuid AS venue_uuid,
      COALESCE(spv.venue_name, v.name) AS venue_name,
      fa.public_uuid AS assignment_uuid
    FROM seating_plan_venues spv
    JOIN seating_plans sp ON sp.id = spv.seating_plan_id
    LEFT JOIN venues v ON v.id = spv.venue_id
    LEFT JOIN seating_plan_venue_faculty spvf ON spvf.seating_plan_venue_id = spv.id
    LEFT JOIN faculty f ON f.id = COALESCE(spvf.faculty_id, spv.faculty_id)
    LEFT JOIN faculty_assignments fa
      ON fa.faculty_id = f.id
     AND fa.venue_id = spv.venue_id
     AND fa.assigned_date = sp.exam_date
    WHERE ${where.join(" AND ")}
      AND f.id IS NOT NULL
    ORDER BY sp.exam_date ASC, sp.exam_start_time ASC, COALESCE(spv.venue_name, v.name) ASC, f.name ASC
    `,
    params
  );

  // Unassigned venues in range
  const unassignedParams = [dateFrom, dateTo];
  const unassignedWhere = [
    "sp.exam_date BETWEEN ? AND ?",
    "COALESCE(spvf.faculty_id, spv.faculty_id) IS NULL",
  ];
  if (examType) {
    unassignedWhere.push("sp.exam_type ILIKE ?");
    unassignedParams.push(examType);
  }
  if (semester === "ODD") {
    unassignedWhere.push("EXTRACT(MONTH FROM sp.exam_date) BETWEEN 7 AND 12");
  } else if (semester === "EVEN") {
    unassignedWhere.push("EXTRACT(MONTH FROM sp.exam_date) BETWEEN 1 AND 6");
  }

  const [unassignedRows] = await db.query(
    `
    SELECT
      sp.exam_date,
      sp.exam_session,
      sp.exam_type,
      sp.exam_start_time,
      sp.exam_end_time,
      COALESCE(spv.venue_name, v.name) AS venue_name,
      v.public_uuid AS venue_uuid,
      sp.public_uuid AS seating_plan_uuid
    FROM seating_plan_venues spv
    JOIN seating_plans sp ON sp.id = spv.seating_plan_id
    LEFT JOIN venues v ON v.id = spv.venue_id
    LEFT JOIN seating_plan_venue_faculty spvf ON spvf.seating_plan_venue_id = spv.id
    WHERE ${unassignedWhere.join(" AND ")}
    ORDER BY sp.exam_date ASC, COALESCE(spv.venue_name, v.name) ASC
    `,
    unassignedParams
  );

  const assignments = (assignedRows || []).map(toScheduleRow);
  const unassignedVenues = (unassignedRows || []).map((r) => ({
    examDate: normalizeDate(r.exam_date ?? r.examdate),
    examSession: r.exam_session ?? r.examsession ?? "",
    examType: r.exam_type ?? r.examtype ?? "",
    startTime: normalizeTime(r.exam_start_time ?? r.examstarttime) || "",
    endTime: normalizeTime(r.exam_end_time ?? r.examendtime) || "",
    venueName: r.venue_name ?? r.venuename ?? "",
    venueUuid: r.venue_uuid ?? r.venueuuid ?? null,
    seatingPlanUuid: r.seating_plan_uuid ?? r.seatingplanuuid ?? null,
    facultyName: "Not Assigned",
  }));

  const conflictWarnings = detectConflicts(assignments);
  const warnings = [...conflictWarnings];
  if (unassignedVenues.length > 0) {
    warnings.unshift({
      type: "UNASSIGNED_VENUE",
      message: `${unassignedVenues.length} venue${unassignedVenues.length === 1 ? "" : "s"} do not have an assigned invigilator.`,
      count: unassignedVenues.length,
    });
  }

  const schedule = groupSchedule(assignments);
  const empty = assignments.length === 0 && unassignedVenues.length === 0;

  return {
    empty,
    meta: {
      semester: semester || null,
      academicYear: academicYearLabel || null,
      examType: examType || null,
      department: department || null,
      program1: program1 || null,
      program2: program2 || null,
      dateFrom,
      dateTo,
      assignmentCount: assignments.length,
      unassignedCount: unassignedVenues.length,
    },
    schedule,
    assignments,
    unassignedVenues,
    warnings,
  };
}

module.exports = {
  getFacultySchedule,
  getInvigilationFilterOptions,
  getInvigilationSchedulePreview,
  normalizeTime,
  normalizeDate,
};
