/**
 * Shared attendance-sheet data builder.
 * Used by single-venue GET /seating/attendance and multi-venue bulk export.
 * Does NOT change sheet format — only assembles the JSON the existing UI expects.
 */
const db = require("../config/db");
const {
  resolveVenueStudentsWithCourses,
  groupStudentsByCourse,
} = require("./venueAttendanceCourses");

function normalizeTimeParam(value) {
  if (!value) return "";
  const match = String(value).trim().match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  return String(value).substring(0, 5);
}

/**
 * Find seating plan for date + session + time (+ optional examType).
 * @returns {{ plan, venues } | { error, statusCode, payload }}
 */
async function findAttendancePlan({
  date,
  session,
  startTime,
  endTime,
  examType = null,
  ownerSql = "",
  ownerParams = [],
}) {
  const dateOnly = String(date || "").includes("T")
    ? String(date).split("T")[0]
    : String(date || "").trim();
  const reqStart = normalizeTimeParam(startTime);
  const reqEnd = normalizeTimeParam(endTime);

  let examTypeSql = "";
  const params = [dateOnly, session, ...ownerParams];
  if (examType) {
    examTypeSql = " AND UPPER(TRIM(exam_type)) = UPPER(TRIM(?))";
    params.splice(2, 0, examType);
  }

  const [plans] = await db.query(
    `SELECT id, exam_type, exam_date, exam_session, exam_start_time, exam_end_time
     FROM seating_plans
     WHERE exam_date = ? AND exam_session = ?${examTypeSql}${ownerSql}`,
    params
  );

  if (!plans?.length) {
    return {
      error: true,
      statusCode: 404,
      payload: {
        error: "No saved allotment found for this exam slot.",
        searchedFor: { date: dateOnly, session, examType: examType || null },
      },
    };
  }

  const matched = (plans || []).filter((p) => {
    const planStart = normalizeTimeParam(p.exam_start_time ?? p.examstarttime ?? "");
    const planEnd = normalizeTimeParam(p.exam_end_time ?? p.examendtime ?? "");
    return planStart === reqStart && planEnd === reqEnd;
  });

  if (!matched.length) {
    return {
      error: true,
      statusCode: 404,
      payload: {
        error: "No saved allotment found for this exam slot.",
        requestedTime: `${reqStart} - ${reqEnd}`,
        availableTimes: plans.map((p) => ({
          planId: p.id,
          start: p.exam_start_time,
          end: p.exam_end_time,
          examType: p.exam_type,
        })),
      },
    };
  }

  // Prefer exact examType match when multiple plans share the same slot
  let plan = matched[0];
  if (examType) {
    const typed = matched.find(
      (p) =>
        String(p.exam_type ?? p.examtype ?? "")
          .trim()
          .toUpperCase() === String(examType).trim().toUpperCase()
    );
    if (typed) plan = typed;
  }

  const planId = plan.id ?? plan._id;
  const [venues] = await db.query(
    `SELECT id, venue_name, venue_id
     FROM seating_plan_venues
     WHERE seating_plan_id = ?
     ORDER BY COALESCE(display_order, 0), id`,
    [planId]
  );

  return {
    error: false,
    plan,
    planId,
    venues: venues || [],
    dateOnly,
    reqStart,
    reqEnd,
  };
}

/**
 * Build attendance sheet JSON for one venue on a plan.
 * Same shape as existing GET /seating/attendance response.
 */
async function buildAttendanceSheetForVenue({
  plan,
  planId,
  venueName,
  venueRow = null,
}) {
  let matchedVenue = venueRow;
  if (!matchedVenue) {
    const [venues] = await db.query(
      `SELECT id, venue_name FROM seating_plan_venues WHERE seating_plan_id = ?`,
      [planId]
    );
    matchedVenue = (venues || []).find(
      (v) => (v.venue_name ?? v.venuename) === venueName
    );
  }

  if (!matchedVenue) {
    const err = new Error(`Venue "${venueName}" not found in plan`);
    err.statusCode = 404;
    err.code = "VENUE_NOT_FOUND";
    throw err;
  }

  const venueId = matchedVenue.id;
  const hallNo = matchedVenue.venue_name ?? matchedVenue.venuename ?? venueName;

  const [venueMetaRows] = await db.query(
    `SELECT seating_layout_json FROM seating_plan_venues WHERE id = ?`,
    [venueId]
  );
  const layoutJson =
    venueMetaRows?.[0]?.seating_layout_json ??
    venueMetaRows?.[0]?.seatinglayoutjson ??
    null;

  const [arrangementRows] = await db.query(
    `SELECT regn_no, seat_row, seat_col, seat_index
     FROM seating_arrangements
     WHERE seating_plan_venue_id = ?
       AND regn_no IS NOT NULL
       AND TRIM(regn_no) <> ''
       AND regn_no <> '-'`,
    [venueId]
  );

  const [planStudentRows] = await db.query(
    `SELECT regn_no, student_name, course_description
     FROM seating_plan_students
     WHERE seating_plan_id = ?
     ORDER BY id ASC`,
    [planId]
  );

  let venueStudents = resolveVenueStudentsWithCourses({
    layoutJson,
    arrangementRows: arrangementRows || [],
    planStudentRows: planStudentRows || [],
  });

  const nameByRegn = new Map();
  for (const r of planStudentRows || []) {
    const regn = String(r.regn_no ?? r.regnno ?? "").trim();
    const name = String(r.student_name ?? r.studentname ?? "").trim();
    if (regn && name && !nameByRegn.has(regn)) nameByRegn.set(regn, name);
  }
  venueStudents = venueStudents.map((s) => ({
    ...s,
    name: s.name || nameByRegn.get(s.regNo) || s.regNo,
  }));

  const venueCourseCodes = [
    ...new Set(venueStudents.map((s) => s.courseCode).filter(Boolean)),
  ];
  const courseNameMap = {};
  venueStudents.forEach((s) => {
    if (s.courseCode) courseNameMap[s.courseCode] = s.courseCode;
  });
  if (venueCourseCodes.length > 0) {
    const placeholders = venueCourseCodes.map(() => "?").join(",");
    const [ttRows] = await db.query(
      `SELECT course_code, course_name FROM timetable
       WHERE course_code IN (${placeholders})`,
      venueCourseCodes
    );
    for (const t of ttRows || []) {
      const code = t.course_code ?? t.coursecode;
      const name = t.course_name ?? t.coursename;
      if (code && name) courseNameMap[code] = name;
    }
  }

  const courses = groupStudentsByCourse(venueStudents, courseNameMap);
  const studentCount = venueStudents.length;

  return {
    examDate: plan.exam_date ?? plan.examDate,
    examSession: plan.exam_session ?? plan.examSession,
    examType: plan.exam_type ?? plan.examType ?? "",
    hallNo,
    venueId,
    courses,
    studentCount,
  };
}

/**
 * Build sheets for every venue on the matched allotment.
 */
async function buildAttendanceSheetsForSlot({
  date,
  session,
  startTime,
  endTime,
  examType = null,
  ownerSql = "",
  ownerParams = [],
}) {
  const found = await findAttendancePlan({
    date,
    session,
    startTime,
    endTime,
    examType,
    ownerSql,
    ownerParams,
  });

  if (found.error) return found;

  const { plan, planId, venues } = found;
  if (!venues.length) {
    return {
      error: true,
      statusCode: 404,
      payload: {
        error: "No venues found for this allotment.",
      },
    };
  }

  const sheets = [];
  const failures = [];

  for (const v of venues) {
    const venueName = v.venue_name ?? v.venuename ?? "";
    try {
      const sheet = await buildAttendanceSheetForVenue({
        plan,
        planId,
        venueName,
        venueRow: v,
      });
      if (!sheet.studentCount) {
        failures.push({
          venue: venueName,
          error: `${venueName} — No students assigned.`,
        });
        continue;
      }
      sheets.push(sheet);
    } catch (err) {
      failures.push({
        venue: venueName,
        error: `Failed to generate attendance sheet for ${venueName}.`,
        details: err.message,
      });
    }
  }

  return {
    error: false,
    examDate: plan.exam_date,
    examSession: plan.exam_session,
    examType: plan.exam_type ?? examType ?? "",
    startTime: found.reqStart,
    endTime: found.reqEnd,
    sheets,
    failures,
    venueCount: venues.length,
    studentTotal: sheets.reduce((sum, s) => sum + (s.studentCount || 0), 0),
  };
}

module.exports = {
  normalizeTimeParam,
  findAttendancePlan,
  buildAttendanceSheetForVenue,
  buildAttendanceSheetsForSlot,
};
