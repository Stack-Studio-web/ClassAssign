const { ACTIVE_ALLOCATION_SQL } = require("./facultyAllocationStatus");

function normalizeExamTime(value) {
  if (value == null || value === "") return null;
  const match = String(value).trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function formatTime12h(value) {
  const norm = normalizeExamTime(value);
  if (!norm) return String(value || "").trim();
  const [hStr, mStr] = norm.split(":");
  let hour = Number(hStr);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${mStr} ${ampm}`;
}

function normalizeExamDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  return str.includes("T") ? str.split("T")[0] : str;
}

function buildTimeConflictMessage({
  facultyName,
  venueName,
  examStartTime,
  examEndTime,
}) {
  const start = formatTime12h(examStartTime);
  const end = formatTime12h(examEndTime);
  const venue = venueName || "another exam";
  const name = facultyName || "This faculty";
  return `Faculty unavailable for this time slot. ${name} is already allocated to ${venue} from ${start} to ${end}.`;
}

function mapConflictRow(row) {
  if (!row) return null;
  const facultyName = row.faculty_name ?? row.facultyname ?? null;
  const venueName = row.venue_name ?? row.venuename ?? null;
  const examStartTime = row.exam_start_time ?? row.examstarttime ?? null;
  const examEndTime = row.exam_end_time ?? row.examendtime ?? null;
  return {
    seatingPlanId: row.seating_plan_id ?? row.seatingplanid ?? null,
    spvId: row.spv_id ?? row.spvid ?? row.id ?? null,
    facultyName,
    venueName,
    examStartTime,
    examEndTime,
    message: buildTimeConflictMessage({
      facultyName,
      venueName,
      examStartTime,
      examEndTime,
    }),
  };
}

/**
 * Find an active seating allocation that overlaps the requested exam window.
 * Overlap: existingStart < newEnd AND existingEnd > newStart (same exam date).
 */
async function findActiveTimeConflict(
  executor,
  {
    facultyId,
    examDate,
    examStartTime,
    examEndTime,
    excludeSeatingPlanId = null,
    excludeSpvId = null,
  }
) {
  if (!facultyId || !examDate || !examStartTime || !examEndTime) return null;

  const dateOnly = normalizeExamDate(examDate);
  const newStart = normalizeExamTime(examStartTime);
  const newEnd = normalizeExamTime(examEndTime);
  if (!dateOnly || !newStart || !newEnd) return null;

  const excludeClauses = [];
  const params = [facultyId, dateOnly, newStart, newEnd];

  if (excludeSeatingPlanId) {
    excludeClauses.push("AND sp.id != ?");
    params.push(excludeSeatingPlanId);
  }
  if (excludeSpvId) {
    excludeClauses.push("AND spv.id != ?");
    params.push(excludeSpvId);
  }

  const [rows] = await executor.query(
    `SELECT
       spv.id AS spv_id,
       sp.id AS seating_plan_id,
       spv.venue_name,
       sp.exam_start_time,
       sp.exam_end_time,
       f.name AS faculty_name
     FROM seating_plan_venue_faculty spvf
     JOIN seating_plan_venues spv ON spv.id = spvf.seating_plan_venue_id
     JOIN seating_plans sp ON sp.id = spv.seating_plan_id
     JOIN faculty f ON f.id = spvf.faculty_id
     WHERE spvf.faculty_id = ?
       AND sp.exam_date = ?
       AND (${ACTIVE_ALLOCATION_SQL})
       AND NOT (sp.exam_end_time <= ? OR sp.exam_start_time >= ?)
       ${excludeClauses.join("\n       ")}
     ORDER BY sp.exam_start_time, spv.id
     LIMIT 1`,
    params
  );

  return mapConflictRow(rows?.[0]);
}

module.exports = {
  normalizeExamTime,
  normalizeExamDate,
  formatTime12h,
  buildTimeConflictMessage,
  findActiveTimeConflict,
};
