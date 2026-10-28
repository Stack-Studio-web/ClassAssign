const { ACTIVE_ALLOCATION_SQL } = require("./facultyAllocationStatus");
const { PLAN_CONTEXT_SQL } = require("./facultyMembership");

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
  return str.includes("T") ? str.split("T")[0] : str.slice(0, 10);
}

/** YYYY-MM-DD → DD/MM/YYYY for user-facing conflict messages. */
function formatDateDisplay(dateOnly) {
  const m = String(dateOnly || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(dateOnly || "");
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Business rule: one active invigilation allotment per faculty per calendar day
 * (regardless of whether exam times overlap). Conflicts are global across Academic Contexts.
 */
function buildTimeConflictMessage({
  facultyName,
  venueName,
  examDate,
  examStartTime,
  examEndTime,
  assignedContext = null,
  assignedDepartment = null,
  hideVenue = false,
}) {
  const name = facultyName || "This faculty";
  const facultyLabel = name === "This faculty" ? name : `Faculty ${name}`;
  const venue = venueName || "another venue";
  const date = formatDateDisplay(normalizeExamDate(examDate));
  const start = formatTime12h(examStartTime);
  const end = formatTime12h(examEndTime);
  const contextLabel = assignedContext || assignedDepartment || null;
  const throughPart = contextLabel ? ` through ${contextLabel}` : "";
  const datePart = date ? ` on ${date}` : "";
  const timePart = start && end ? `, ${start}–${end}` : "";
  const venuePart = hideVenue ? "" : ` at ${venue}`;
  return `${facultyLabel} is already assigned to an exam${throughPart}${datePart}${timePart}${venuePart}. Please select another faculty member.`;
}

/** Viewer used to decide whether another department's venue may be revealed. */
function conflictViewerFromOpts(opts = {}) {
  if (!opts || opts.role === "admin") return { isAdmin: true, ownerIds: null };
  const ids = Array.isArray(opts.ownerIds)
    ? opts.ownerIds
    : opts.ownerUserId
      ? [opts.ownerUserId]
      : [];
  return { isAdmin: false, ownerIds: ids.map(Number).filter((id) => id > 0) };
}

/**
 * Redact venue / plan ids when the conflicting assignment belongs to a department
 * outside the viewer's scope. Date, times and department stay visible so the
 * block can be explained.
 */
function presentConflictForViewer(conflict, viewer) {
  if (!conflict || !viewer || viewer.isAdmin) return conflict;
  const owner = Number(conflict.ownerUserId);
  const visible = Number.isFinite(owner) && (viewer.ownerIds || []).includes(owner);
  if (visible) return conflict;
  return {
    ...conflict,
    venueName: null,
    seatingPlanId: null,
    spvId: null,
    crossDepartment: true,
    message: buildTimeConflictMessage({ ...conflict, hideVenue: true }),
  };
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
 * Kept for venue occupancy windows (not faculty same-day rule).
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

function mapConflictRow(row) {
  if (!row) return null;
  const facultyName = row.faculty_name ?? row.facultyname ?? null;
  const venueName = row.venue_name ?? row.venuename ?? null;
  const examStartTime = row.exam_start_time ?? row.examstarttime ?? null;
  const examEndTime = row.exam_end_time ?? row.examendtime ?? null;
  const examDate = normalizeExamDate(row.exam_date ?? row.examdate ?? null);
  const ownerUserId = row.owner_user_id ?? row.owneruserid ?? null;
  const assignedContext =
    row.assigned_context ??
    row.assignedcontext ??
    row.assigned_department ??
    row.assigneddepartment ??
    null;
  return {
    seatingPlanId: row.seating_plan_id ?? row.seatingplanid ?? null,
    spvId: row.spv_id ?? row.spvid ?? row.id ?? null,
    facultyId: row.faculty_id ?? row.facultyid ?? null,
    facultyName,
    venueName,
    examDate,
    examStartTime,
    examEndTime,
    occupancyEndTime: examEndTime,
    ownerUserId: ownerUserId != null ? Number(ownerUserId) : null,
    assignedContext,
    assignedDepartment: assignedContext,
    message: buildTimeConflictMessage({
      facultyName,
      venueName,
      examDate,
      examStartTime,
      examEndTime,
      assignedContext,
    }),
  };
}

/**
 * Find an active seating allocation for the faculty on the same calendar day.
 * Rule: one invigilation allotment per faculty per day (times do not matter).
 */
async function findActiveTimeConflict(
  executor,
  {
    facultyId,
    examDate,
    examStartTime = null,
    examEndTime = null,
    excludeSeatingPlanId = null,
    excludeSpvId = null,
    forUpdate = false,
  }
) {
  if (!facultyId || !examDate) return null;

  const dateOnly = normalizeExamDate(examDate);
  if (!dateOnly) return null;

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

  const lockSql = forUpdate ? " FOR UPDATE OF spvf" : "";

  const [rows] = await executor.query(
    `SELECT
       spv.id AS spv_id,
       sp.id AS seating_plan_id,
       spvf.faculty_id,
       spv.venue_name,
       sp.exam_date,
       sp.exam_start_time,
       sp.exam_end_time,
       sp.owner_user_id,
       ${PLAN_CONTEXT_SQL} AS assigned_context,
       f.name AS faculty_name
     FROM seating_plan_venue_faculty spvf
     JOIN seating_plan_venues spv ON spv.id = spvf.seating_plan_venue_id
     JOIN seating_plans sp ON sp.id = spv.seating_plan_id
     JOIN faculty f ON f.id = spvf.faculty_id
     WHERE spvf.faculty_id = ?
       AND sp.exam_date = ?
       AND (${ACTIVE_ALLOCATION_SQL})
       ${excludeClauses.join("\n       ")}
     ORDER BY sp.exam_start_time, spv.id
     LIMIT 1${lockSql}`,
    params
  );

  const row = rows?.[0];
  if (!row) return null;
  // Preserve requested window fields for callers that ignore conflict times.
  void examStartTime;
  void examEndTime;
  return mapConflictRow(row);
}

/**
 * Bulk same-day conflict lookup for availability checks (avoids N+1).
 * @returns {Map<number, object>} facultyId → conflict
 */
async function findActiveSameDayConflictsBulk(
  executor,
  { facultyIds, examDate, excludeSeatingPlanId = null }
) {
  const map = new Map();
  const ids = (facultyIds || [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  const dateOnly = normalizeExamDate(examDate);
  if (!ids.length || !dateOnly) return map;

  const placeholders = ids.map(() => "?").join(", ");
  const params = [...ids, dateOnly];
  let excludeSql = "";
  if (excludeSeatingPlanId) {
    excludeSql = "AND sp.id != ?";
    params.push(excludeSeatingPlanId);
  }

  const [rows] = await executor.query(
    `SELECT DISTINCT ON (spvf.faculty_id)
       spv.id AS spv_id,
       sp.id AS seating_plan_id,
       spvf.faculty_id,
       spv.venue_name,
       sp.exam_date,
       sp.exam_start_time,
       sp.exam_end_time,
       sp.owner_user_id,
       ${PLAN_CONTEXT_SQL} AS assigned_context,
       f.name AS faculty_name
     FROM seating_plan_venue_faculty spvf
     JOIN seating_plan_venues spv ON spv.id = spvf.seating_plan_venue_id
     JOIN seating_plans sp ON sp.id = spv.seating_plan_id
     JOIN faculty f ON f.id = spvf.faculty_id
     WHERE spvf.faculty_id IN (${placeholders})
       AND sp.exam_date = ?
       AND (${ACTIVE_ALLOCATION_SQL})
       ${excludeSql}
     ORDER BY spvf.faculty_id, sp.exam_start_time, spv.id`,
    params
  );

  for (const row of rows || []) {
    const conflict = mapConflictRow(row);
    const fid = Number(conflict?.facultyId ?? row.faculty_id ?? row.facultyid);
    if (Number.isFinite(fid)) map.set(fid, conflict);
  }
  return map;
}

/**
 * Lock faculty rows inside an open transaction before conflict checks / inserts.
 * Prevents two concurrent allotments from assigning the same faculty on one day.
 */
async function lockFacultyRowsForUpdate(executor, facultyIds) {
  const ids = [...new Set((facultyIds || []).map(Number))].filter(
    (id) => Number.isFinite(id) && id > 0
  );
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(", ");
  await executor.query(
    `SELECT id FROM faculty WHERE id IN (${placeholders}) FOR UPDATE`,
    ids
  );
}

function examTimesOverlap(existingStart, existingEnd, newStart, newEnd) {
  const es = normalizeExamTime(existingStart);
  const ee = normalizeExamTime(existingEnd);
  const ns = normalizeExamTime(newStart);
  const ne = normalizeExamTime(newEnd);
  if (!es || !ee || !ns || !ne) return false;
  return es < ne && ee > ns;
}

/**
 * Transfer-only: overlapping time windows conflict.
 * Adjacent sessions (e.g. 09:00–11:00 and 11:00–13:00) do not overlap.
 * If either window is missing times, treat as a conflict (cannot prove non-overlap).
 */
function transferWindowsConflict(existingStart, existingEnd, newStart, newEnd) {
  const es = normalizeExamTime(existingStart);
  const ee = normalizeExamTime(existingEnd);
  const ns = normalizeExamTime(newStart);
  const ne = normalizeExamTime(newEnd);
  if (!es || !ee || !ns || !ne) return true;
  return examTimesOverlap(es, ee, ns, ne);
}

function buildTransferOverlapMessage({
  facultyName,
  venueName,
  examDate,
  examStartTime,
  examEndTime,
  hideVenue = false,
} = {}) {
  const name = facultyName || "This faculty";
  const date = formatDateDisplay(normalizeExamDate(examDate));
  const start = formatTime12h(examStartTime);
  const end = formatTime12h(examEndTime);
  const datePart = date ? ` on ${date}` : "";
  const timePart = start && end ? ` from ${start}–${end}` : "";
  const venuePart = hideVenue || !venueName ? "" : ` at ${venueName}`;
  return (
    `Transfer unavailable. ${name} already has an overlapping assignment${datePart}${timePart}${venuePart}. ` +
    "Transfers are allowed on the same day only when exam start and end times do not overlap."
  );
}

/**
 * Active seating allotments for a faculty on a calendar day (all rows, not just first).
 */
async function listActiveSameDayAssignments(
  executor,
  {
    facultyId,
    examDate,
    excludeSeatingPlanId = null,
    excludeSpvId = null,
    forUpdate = false,
  }
) {
  if (!facultyId || !examDate) return [];
  const dateOnly = normalizeExamDate(examDate);
  if (!dateOnly) return [];

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
  const lockSql = forUpdate ? " FOR UPDATE OF spvf" : "";

  const [rows] = await executor.query(
    `SELECT
       spv.id AS spv_id,
       sp.id AS seating_plan_id,
       spvf.faculty_id,
       spv.venue_name,
       sp.exam_date,
       sp.exam_start_time,
       sp.exam_end_time,
       sp.owner_user_id,
       ${PLAN_CONTEXT_SQL} AS assigned_context,
       f.name AS faculty_name
     FROM seating_plan_venue_faculty spvf
     JOIN seating_plan_venues spv ON spv.id = spvf.seating_plan_venue_id
     JOIN seating_plans sp ON sp.id = spv.seating_plan_id
     JOIN faculty f ON f.id = spvf.faculty_id
     WHERE spvf.faculty_id = ?
       AND sp.exam_date = ?
       AND (${ACTIVE_ALLOCATION_SQL})
       ${excludeClauses.join("\n       ")}
     ORDER BY sp.exam_start_time, spv.id${lockSql}`,
    params
  );
  return (rows || []).map(mapConflictRow).filter(Boolean);
}

/**
 * Transfer-only overlap check. Same-day non-overlapping sessions are allowed.
 * Does not change the allocator's one-duty-per-day rule.
 */
async function findOverlappingTimeConflict(
  executor,
  {
    facultyId,
    examDate,
    examStartTime = null,
    examEndTime = null,
    excludeSeatingPlanId = null,
    excludeSpvId = null,
    forUpdate = false,
  }
) {
  const assignments = await listActiveSameDayAssignments(executor, {
    facultyId,
    examDate,
    excludeSeatingPlanId,
    excludeSpvId,
    forUpdate,
  });

  for (const conflict of assignments) {
    if (
      transferWindowsConflict(
        conflict.examStartTime,
        conflict.examEndTime,
        examStartTime,
        examEndTime
      )
    ) {
      return {
        ...conflict,
        message: buildTransferOverlapMessage(conflict),
      };
    }
  }
  return null;
}

module.exports = {
  normalizeExamTime,
  normalizeExamDate,
  formatTime12h,
  formatDateDisplay,
  buildTimeConflictMessage,
  conflictViewerFromOpts,
  presentConflictForViewer,
  findActiveTimeConflict,
  findActiveSameDayConflictsBulk,
  findOverlappingTimeConflict,
  lockFacultyRowsForUpdate,
  examTimesOverlap,
  transferWindowsConflict,
  buildTransferOverlapMessage,
  getStartTimeGroupMaxEnds,
  resolveOccupancyWindow,
};
