const { ACTIVE_ALLOCATION_SQL } = require("./facultyAllocationStatus");

function normalizeExamTime(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
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

function laterTime(a, b) {
  const left = normalizeExamTime(a);
  const right = normalizeExamTime(b);
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}

function occupancyEndForStart(groupMaxByStart, startTime, ownEndTime) {
  const start = normalizeExamTime(startTime);
  const ownEnd = normalizeExamTime(ownEndTime);
  const groupEnd = start ? groupMaxByStart.get(start) : null;
  return laterTime(ownEnd, groupEnd);
}

/**
 * Group timetable + seating-plan exams by date + start time.
 * Faculty occupancy for a start-time group uses MAX(endTime).
 */
async function getStartTimeGroupMaxEnds(executor, examDate) {
  const dateOnly = normalizeExamDate(examDate);
  const map = new Map();
  if (!dateOnly) return map;

  const [timetableRows] = await executor.query(
    `SELECT start_time, MAX(end_time) AS max_end
     FROM timetable
     WHERE date = ?
     GROUP BY start_time`,
    [dateOnly]
  );
  const [planRows] = await executor.query(
    `SELECT exam_start_time AS start_time, MAX(exam_end_time) AS max_end
     FROM seating_plans
     WHERE exam_date = ?
     GROUP BY exam_start_time`,
    [dateOnly]
  );

  for (const row of [...(timetableRows || []), ...(planRows || [])]) {
    const start = normalizeExamTime(row.start_time ?? row.starttime);
    const end = normalizeExamTime(row.max_end ?? row.maxend);
    if (!start || !end) continue;
    map.set(start, laterTime(map.get(start), end));
  }
  return map;
}

async function resolveOccupancyWindow(
  executor,
  { examDate, examStartTime, examEndTime, groupMaxByStart = null }
) {
  const start = normalizeExamTime(examStartTime);
  const ownEnd = normalizeExamTime(examEndTime);
  const groups =
    groupMaxByStart || (await getStartTimeGroupMaxEnds(executor, examDate));
  const occupancyEndTime = occupancyEndForStart(groups, start, ownEnd);
  return {
    examStartTime: start,
    examEndTime: ownEnd,
    occupancyEndTime: occupancyEndTime || ownEnd,
    groupMaxByStart: groups,
  };
}

function mapConflictRow(row, occupancyEndTime = null) {
  if (!row) return null;
  const facultyName = row.faculty_name ?? row.facultyname ?? null;
  const venueName = row.venue_name ?? row.venuename ?? null;
  const examStartTime = row.exam_start_time ?? row.examstarttime ?? null;
  const examEndTime = row.exam_end_time ?? row.examendtime ?? null;
  const occupancyEnd = occupancyEndTime || examEndTime;
  return {
    seatingPlanId: row.seating_plan_id ?? row.seatingplanid ?? null,
    spvId: row.spv_id ?? row.spvid ?? row.id ?? null,
    facultyName,
    venueName,
    examStartTime,
    examEndTime,
    occupancyEndTime: occupancyEnd,
    message: buildTimeConflictMessage({
      facultyName,
      venueName,
      examStartTime,
      examEndTime: occupancyEnd,
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
  const ownNewEnd = normalizeExamTime(examEndTime);
  if (!dateOnly || !newStart || !ownNewEnd) return null;

  const groupMaxByStart = await getStartTimeGroupMaxEnds(executor, dateOnly);
  const newOccupancyEnd = occupancyEndForStart(
    groupMaxByStart,
    newStart,
    ownNewEnd
  );

  const excludeClauses = [];
  const params = [facultyId, dateOnly];

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
       ${excludeClauses.join("\n       ")}
     ORDER BY sp.exam_start_time, spv.id`,
    params
  );

  for (const row of rows || []) {
    const existingStart = row.exam_start_time ?? row.examstarttime;
    const existingEnd = row.exam_end_time ?? row.examendtime;
    const existingOccupancyEnd = occupancyEndForStart(
      groupMaxByStart,
      existingStart,
      existingEnd
    );
    if (
      examTimesOverlap(
        existingStart,
        existingOccupancyEnd,
        newStart,
        newOccupancyEnd
      )
    ) {
      return mapConflictRow(row, existingOccupancyEnd);
    }
  }

  return null;
}

function examTimesOverlap(existingStart, existingEnd, newStart, newEnd) {
  const es = normalizeExamTime(existingStart);
  const ee = normalizeExamTime(existingEnd);
  const ns = normalizeExamTime(newStart);
  const ne = normalizeExamTime(newEnd);
  if (!es || !ee || !ns || !ne) return false;
  return es < ne && ee > ns;
}

module.exports = {
  normalizeExamTime,
  normalizeExamDate,
  formatTime12h,
  buildTimeConflictMessage,
  findActiveTimeConflict,
  examTimesOverlap,
  getStartTimeGroupMaxEnds,
  resolveOccupancyWindow,
};
