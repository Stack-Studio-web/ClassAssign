const db = require("../config/db");

const MANUAL_STATUSES = new Set(["MANUALLY_UNLOCKED", "MANUALLY_LOCKED"]);
const AUTO_STATUSES = new Set(["PENDING", "OPEN", "LOCKED"]);

function getInstitutionTimezone() {
  return process.env.INSTITUTION_TIMEZONE || "Asia/Kolkata";
}

function getDefaultCloseOffsetMinutes() {
  const n = Number(process.env.DEFAULT_ATTENDANCE_CLOSE_OFFSET_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

function formatTimeForMessage(isoString, tz) {
  if (!isoString) return "";
  try {
    return new Date(isoString).toLocaleTimeString("en-IN", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

function toSessionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionUuid: row.public_uuid ?? row.publicuuid ?? null,
    examId: row.exam_id ?? row.examid,
    venueId: row.venue_id ?? row.venueid,
    attendanceOpenTime: row.attendance_open_time ?? row.attendanceopentime,
    attendanceCloseTime: row.attendance_close_time ?? row.attendanceclosetime,
    attendanceStatus: row.attendance_status ?? row.attendancestatus,
    closeOffsetMinutes: Number(row.close_offset_minutes ?? row.closeoffsetminutes ?? 40),
    manuallyChangedBy: row.manually_changed_by ?? row.manuallychangedby ?? null,
    manuallyChangedAt: row.manually_changed_at ?? row.manuallychangedat ?? null,
    examDate: row.exam_date ?? row.examdate ?? null,
    examTime: row.exam_time ?? row.examtime ?? null,
    examSession: row.exam_session ?? row.examsession ?? null,
    lifecycleStatus: row.lifecycle_status ?? row.lifecyclestatus ?? "ACTIVE",
    examEndTime: row.exam_end_time ?? row.examendtime ?? null,
    completedAt: row.completed_at ?? row.completedat ?? null,
  };
}

async function getServerNow(executor = db) {
  const [rows] = await executor.query(`SELECT NOW() AS server_now`);
  const r = rows[0] || {};
  return new Date(r.server_now ?? r.servernow ?? Date.now());
}

function parseStartTimeFromExamTime(examTime) {
  if (!examTime) return "09:00:00";
  const normalized = String(examTime).replace(/\u2013|\u2014/g, "-");
  const part = normalized.split("-")[0]?.trim() || "09:00";
  const match = part.match(/(\d{1,2}):(\d{2})/);
  if (!match) return "09:00:00";
  return `${match[1].padStart(2, "0")}:${match[2]}:00`;
}

function parseEndTimeFromExamTime(examTime) {
  if (!examTime) return "11:00:00";
  const normalized = String(examTime).replace(/\u2013|\u2014/g, "-");
  const parts = normalized.split("-");
  const part = (parts.length > 1 ? parts[1] : parts[0])?.trim() || "11:00";
  const match = part.match(/(\d{1,2}):(\d{2})/);
  if (!match) return "11:00:00";
  return `${match[1].padStart(2, "0")}:${match[2]}:00`;
}

async function computeExamEndUtc(examDate, endTime, executor = db) {
  const tz = getInstitutionTimezone();
  const end = endTime || "11:00:00";
  const [rows] = await executor.query(
    `SELECT ((?::date + ?::time) AT TIME ZONE ?) AS end_utc`,
    [examDate, end, tz]
  );
  const r = rows[0] || {};
  return r.end_utc ?? r.endutc;
}

/**
 * Compute open/close UTC timestamps from exam date + start time in institution TZ.
 */
async function computeWindowTimes(examDate, startTime, closeOffsetMinutes, executor = db) {
  const tz = getInstitutionTimezone();
  const offset = closeOffsetMinutes ?? getDefaultCloseOffsetMinutes();
  const start = startTime || "09:00:00";
  const [rows] = await executor.query(
    `SELECT
       ((?::date + ?::time) AT TIME ZONE ?) AS open_utc,
       ((?::date + ?::time) AT TIME ZONE ?) + (? || ' minutes')::interval AS close_utc`,
    [examDate, start, tz, examDate, start, tz, String(offset)]
  );
  const r = rows[0] || {};
  return {
    openUtc: r.open_utc ?? r.openutc,
    closeUtc: r.close_utc ?? r.closeutc,
    closeOffsetMinutes: offset,
  };
}

async function fetchSession(examId, venueId, executor = db) {
  const [rows] = await executor.query(
    `SELECT s.*, s.public_uuid, e.exam_date, e.exam_time, e.exam_session
     FROM attendance_sessions s
     JOIN exams e ON e.id = s.exam_id
     WHERE s.exam_id = ? AND s.venue_id = ?`,
    [examId, venueId]
  );
  return toSessionRow(rows[0]);
}

async function upsertSessionFromExam({
  examId,
  venueId,
  examDate,
  startTime,
  endTime,
  closeOffsetMinutes,
  executor = db,
}) {
  const { openUtc, closeUtc, closeOffsetMinutes: offset } = await computeWindowTimes(
    examDate,
    startTime,
    closeOffsetMinutes,
    executor
  );

  let resolvedEndTime = endTime;
  if (resolvedEndTime == null) {
    const [examRows] = await executor.query(`SELECT exam_time FROM exams WHERE id = ?`, [examId]);
    resolvedEndTime = parseEndTimeFromExamTime(examRows[0]?.exam_time ?? examRows[0]?.examtime);
  }
  const examEndUtc = await computeExamEndUtc(examDate, resolvedEndTime, executor);

  await executor.query(
    `INSERT INTO attendance_sessions
       (exam_id, venue_id, attendance_open_time, attendance_close_time,
        attendance_status, close_offset_minutes, exam_end_time, lifecycle_status, updated_at)
     VALUES (?, ?, ?, ?, 'PENDING', ?, ?, 'ACTIVE', NOW())
     ON CONFLICT (exam_id, venue_id) DO UPDATE SET
       attendance_open_time = EXCLUDED.attendance_open_time,
       attendance_close_time = EXCLUDED.attendance_close_time,
       close_offset_minutes = EXCLUDED.close_offset_minutes,
       exam_end_time = COALESCE(EXCLUDED.exam_end_time, attendance_sessions.exam_end_time),
       updated_at = NOW()
     WHERE attendance_sessions.attendance_status NOT IN ('MANUALLY_UNLOCKED', 'MANUALLY_LOCKED')`,
    [examId, venueId, openUtc, closeUtc, offset, examEndUtc]
  );

  return fetchSession(examId, venueId, executor);
}

async function ensureSession(examId, venueId, executor = db) {
  let session = await fetchSession(examId, venueId, executor);
  if (session) return session;

  const [examRows] = await executor.query(
    `SELECT id, exam_date, exam_time, exam_session FROM exams WHERE id = ?`,
    [examId]
  );
  const exam = examRows[0];
  if (!exam) return null;

  const examDate = exam.exam_date ?? exam.examdate;
  const startTime = parseStartTimeFromExamTime(exam.exam_time ?? exam.examtime);

  return upsertSessionFromExam({
    examId,
    venueId,
    examDate,
    startTime,
    executor,
  });
}

async function isBeforeExamDate(examDate, serverNow, executor = db) {
  const tz = getInstitutionTimezone();
  const [rows] = await executor.query(
    `SELECT (?::date) > ((?::timestamptz AT TIME ZONE ?)::date) AS before_exam`,
    [examDate, serverNow.toISOString(), tz]
  );
  return !!(rows[0]?.before_exam ?? rows[0]?.beforeexam);
}

/**
 * Evaluate effective window state using server time only.
 */
async function evaluateWindow(session, serverNow, executor = db) {
  if (!session) {
    return {
      status: "PENDING",
      canRead: true,
      canWrite: false,
      code: "ATTENDANCE_NOT_OPEN",
      message: "Attendance has not started yet.",
    };
  }

  const tz = getInstitutionTimezone();
  const openAt = new Date(session.attendanceOpenTime);
  const closeAt = new Date(session.attendanceCloseTime);
  const storedStatus = session.attendanceStatus;

  const base = {
    status: storedStatus,
    sessionUuid: session.sessionUuid ?? null,
    opensAt: openAt.toISOString(),
    closesAt: closeAt.toISOString(),
    serverTime: serverNow.toISOString(),
    closeOffsetMinutes: session.closeOffsetMinutes,
    examDate: session.examDate,
    examSession: session.examSession,
    manuallyReopened: storedStatus === "MANUALLY_UNLOCKED",
  };

  if (storedStatus === "MANUALLY_LOCKED") {
    return {
      ...base,
      status: "MANUALLY_LOCKED",
      canRead: true,
      canWrite: false,
      code: "ATTENDANCE_MANUALLY_LOCKED",
      message: "Attendance has been locked by administrator.",
    };
  }

  if (storedStatus === "MANUALLY_UNLOCKED") {
    return {
      ...base,
      status: "MANUALLY_UNLOCKED",
      canRead: true,
      canWrite: true,
      code: null,
      message: "Attendance has been manually reopened by administrator.",
    };
  }

  if (session.examDate && (await isBeforeExamDate(session.examDate, serverNow, executor))) {
    return {
      ...base,
      status: "PENDING",
      canRead: true,
      canWrite: false,
      code: "ATTENDANCE_NOT_OPEN",
      message: "Attendance has not started yet.",
      opensAt: openAt.toISOString(),
    };
  }

  if (serverNow < openAt) {
    const opensLabel = formatTimeForMessage(openAt.toISOString(), tz);
    return {
      ...base,
      status: "PENDING",
      canRead: true,
      canWrite: false,
      code: "ATTENDANCE_NOT_OPEN",
      message: `Attendance opens at ${opensLabel}.`,
      opensAt: openAt.toISOString(),
    };
  }

  if (serverNow <= closeAt) {
    return {
      ...base,
      status: "OPEN",
      canRead: true,
      canWrite: true,
      code: null,
      message: null,
      closesAt: closeAt.toISOString(),
      remainingSeconds: Math.max(0, Math.floor((closeAt - serverNow) / 1000)),
    };
  }

  return {
    ...base,
    status: "LOCKED",
    canRead: true,
    canWrite: false,
    code: "ATTENDANCE_CLOSED",
    message: "Attendance window has closed.",
  };
}

async function persistAutoStatus(examId, venueId, status, executor = db) {
  if (!AUTO_STATUSES.has(status)) return;
  await executor.query(
    `UPDATE attendance_sessions
     SET attendance_status = ?, updated_at = NOW()
     WHERE exam_id = ? AND venue_id = ?
       AND attendance_status NOT IN ('MANUALLY_UNLOCKED', 'MANUALLY_LOCKED')`,
    [status, examId, venueId]
  );
}

async function syncLifecycleStatus(examId, venueId, executor = db) {
  const session = await fetchSession(examId, venueId, executor);
  if (!session) return null;
  if (session.lifecycleStatus === "COMPLETED") return session;

  const serverNow = await getServerNow(executor);
  let examEnd = session.examEndTime;
  if (!examEnd) {
    const endTime = parseEndTimeFromExamTime(session.examTime);
    examEnd = await computeExamEndUtc(session.examDate, endTime, executor);
    await executor.query(
      `UPDATE attendance_sessions SET exam_end_time = ?, updated_at = NOW()
       WHERE exam_id = ? AND venue_id = ?`,
      [examEnd, examId, venueId]
    );
  }

  if (new Date(serverNow) >= new Date(examEnd)) {
    await executor.query(
      `UPDATE attendance_sessions
       SET lifecycle_status = 'COMPLETED',
           completed_at = COALESCE(completed_at, NOW()),
           updated_at = NOW()
       WHERE exam_id = ? AND venue_id = ? AND lifecycle_status = 'ACTIVE'`,
      [examId, venueId]
    );
    await executor.query(
      `UPDATE attendance SET is_locked = TRUE WHERE exam_id = ? AND venue_id = ?`,
      [examId, venueId]
    );
  }

  return fetchSession(examId, venueId, executor);
}

async function refreshDueLifecycleStatuses(executor = db) {
  await executor.query(
    `UPDATE attendance_sessions
     SET lifecycle_status = 'COMPLETED',
         completed_at = COALESCE(completed_at, NOW()),
         updated_at = NOW()
     WHERE lifecycle_status = 'ACTIVE'
       AND exam_end_time IS NOT NULL
       AND exam_end_time <= NOW()`
  );
  await executor.query(
    `UPDATE attendance att
     SET is_locked = TRUE
     FROM attendance_sessions s
     WHERE s.exam_id = att.exam_id
       AND s.venue_id = att.venue_id
       AND s.lifecycle_status = 'COMPLETED'
       AND att.is_locked = FALSE`
  );
}

async function isLifecycleCompleted(examId, venueId, executor = db) {
  await syncLifecycleStatus(examId, venueId, executor);
  const session = await fetchSession(examId, venueId, executor);
  return session?.lifecycleStatus === "COMPLETED";
}

async function getWindowState(examId, venueId, executor = db) {
  await refreshDueLifecycleStatuses(executor);
  await syncLifecycleStatus(examId, venueId, executor);
  const session = await ensureSession(examId, venueId, executor);
  const serverNow = await getServerNow(executor);
  const evaluation = await evaluateWindow(session, serverNow, executor);

  if (session && AUTO_STATUSES.has(evaluation.status)) {
    await persistAutoStatus(examId, venueId, evaluation.status, executor);
  }

  const lifecycleCompleted = session?.lifecycleStatus === "COMPLETED";
  return {
    session,
    ...evaluation,
    lifecycleStatus: session?.lifecycleStatus ?? "ACTIVE",
    examEndTime: session?.examEndTime ?? null,
    completedAt: session?.completedAt ?? null,
    canWrite: lifecycleCompleted ? false : evaluation.canWrite,
    canRead: evaluation.canRead || lifecycleCompleted,
    lifecycleCompleted,
  };
}

function buildWindowError(evaluation) {
  const err = new Error(evaluation.message || "Attendance is not available.");
  err.statusCode = 403;
  err.code = evaluation.code || "ATTENDANCE_NOT_AVAILABLE";
  err.opensAt = evaluation.opensAt;
  err.closesAt = evaluation.closesAt;
  err.status = evaluation.status;
  return err;
}

async function assertWritable(examId, venueId, { adminBypass = false } = {}) {
  const completed = await isLifecycleCompleted(examId, venueId);
  if (completed) {
    const err = new Error("Attendance is completed and cannot be modified.");
    err.statusCode = 403;
    err.code = "ATTENDANCE_COMPLETED";
    throw err;
  }

  if (adminBypass) {
    return getWindowState(examId, venueId);
  }

  const state = await getWindowState(examId, venueId);
  if (!state.canWrite) {
    throw buildWindowError(state);
  }
  return state;
}

async function updateWindowConfig({
  examId,
  venueId,
  openTime,
  closeTime,
  closeOffsetMinutes,
  userId,
}) {
  const session = await ensureSession(examId, venueId);
  if (!session) {
    throw new Error("Exam session not found");
  }

  let openUtc = openTime;
  let closeUtc = closeTime;

  if (!openUtc || !closeUtc) {
    const examDate = session.examDate;
    const startTime = parseStartTimeFromExamTime(session.examTime);
    const computed = await computeWindowTimes(
      examDate,
      startTime,
      closeOffsetMinutes ?? session.closeOffsetMinutes
    );
    openUtc = openUtc || computed.openUtc;
    closeUtc = closeUtc || computed.closeUtc;
  }

  await db.query(
    `UPDATE attendance_sessions
     SET attendance_open_time = ?,
         attendance_close_time = ?,
         close_offset_minutes = COALESCE(?, close_offset_minutes),
         attendance_status = 'PENDING',
         manually_changed_by = ?,
         manually_changed_at = NOW(),
         updated_at = NOW()
     WHERE exam_id = ? AND venue_id = ?`,
    [
      openUtc,
      closeUtc,
      closeOffsetMinutes ?? null,
      userId ?? null,
      examId,
      venueId,
    ]
  );

  return getWindowState(examId, venueId);
}

async function setManualStatus(examId, venueId, status, userId) {
  if (!MANUAL_STATUSES.has(status) && status !== "PENDING") {
    throw new Error("Invalid manual status");
  }
  await ensureSession(examId, venueId);
  await db.query(
    `UPDATE attendance_sessions
     SET attendance_status = ?,
         manually_changed_by = ?,
         manually_changed_at = NOW(),
         updated_at = NOW()
     WHERE exam_id = ? AND venue_id = ?`,
    [status, userId ?? null, examId, venueId]
  );
  return getWindowState(examId, venueId);
}

module.exports = {
  getInstitutionTimezone,
  getDefaultCloseOffsetMinutes,
  parseStartTimeFromExamTime,
  parseEndTimeFromExamTime,
  computeWindowTimes,
  computeExamEndUtc,
  fetchSession,
  upsertSessionFromExam,
  ensureSession,
  getServerNow,
  evaluateWindow,
  syncLifecycleStatus,
  refreshDueLifecycleStatuses,
  isLifecycleCompleted,
  getWindowState,
  assertWritable,
  buildWindowError,
  updateWindowConfig,
  setManualStatus,
  toSessionRow,
};
