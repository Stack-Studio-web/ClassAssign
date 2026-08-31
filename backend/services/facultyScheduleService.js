const db = require("../config/db");

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
  };
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

  // Group: date -> time range -> faculty rows
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

  const schedule = [...byDate.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([examDate, byTime]) => ({
      examDate,
      sessions: [...byTime.values()].sort((x, y) =>
        String(x.startTime).localeCompare(String(y.startTime))
      ),
    }));

  return { assignments, schedule };
}

module.exports = {
  getFacultySchedule,
  normalizeTime,
  normalizeDate,
};
