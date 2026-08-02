const db = require("../config/db");
const bullQueue = require("../config/bullQueue");
const { OFFSET_PRESETS, getInstitutionTimezone } = require("./hallNotificationMessage");

const ACTIVE_STATUSES = ["SCHEDULED", "QUEUED", "PROCESSING", "SENT", "DELIVERED", "RETRYING"];
const BLOCK_DUPLICATE_STATUSES = ["SCHEDULED", "QUEUED", "PROCESSING", "SENT", "DELIVERED", "RETRYING"];

function buildIdempotencyKey({ examDate, session, email, notificationType = "hall_seating" }) {
  return `${examDate}|${session || ""}|${String(email).trim().toLowerCase()}|${notificationType}`;
}

async function logEvent(notificationId, eventType, message, metadata = null, executor = db) {
  await executor.query(
    `INSERT INTO hall_notification_events (notification_id, event_type, message, metadata)
     VALUES (?, ?, ?, ?)`,
    [notificationId, eventType, message, metadata ? JSON.stringify(metadata) : null]
  );
}

const HallNotificationService = {
  OFFSET_PRESETS,

  getSettings: async () => {
    const [rows] = await db.query(`SELECT * FROM notification_settings ORDER BY id LIMIT 1`);
    const row = rows[0] || {};
    return {
      offsetPreset: row.offset_preset ?? row.offsetpreset ?? "12_hours",
      offsetMinutes: Number(row.offset_minutes ?? row.offsetminutes ?? 720),
      customOffsetMinutes: row.custom_offset_minutes ?? row.customoffsetminutes ?? null,
      notificationsPaused: !!(row.notifications_paused ?? row.notificationspaused),
      portalUrl: row.portal_url ?? row.portalurl ?? "",
      updatedAt: row.updated_at ?? row.updatedat,
    };
  },

  updateSettings: async ({ offsetPreset, customOffsetMinutes, portalUrl, userId }) => {
    let offsetMinutes = OFFSET_PRESETS[offsetPreset];
    if (offsetPreset === "custom") {
      offsetMinutes = Number(customOffsetMinutes);
      if (!Number.isFinite(offsetMinutes) || offsetMinutes < 1) {
        throw new Error("Custom offset must be at least 1 minute");
      }
    }
    if (!Number.isFinite(offsetMinutes)) {
      throw new Error("Invalid offset preset");
    }

    await db.query(
      `UPDATE notification_settings SET
         offset_preset = ?,
         offset_minutes = ?,
         custom_offset_minutes = ?,
         portal_url = COALESCE(?, portal_url),
         updated_by = ?,
         updated_at = NOW()
       WHERE id = (SELECT id FROM notification_settings ORDER BY id LIMIT 1)`,
      [
        offsetPreset,
        offsetMinutes,
        offsetPreset === "custom" ? offsetMinutes : null,
        portalUrl ?? null,
        userId ?? null,
      ]
    );
    return HallNotificationService.getSettings();
  },

  setPaused: async (paused, userId) => {
    await db.query(
      `UPDATE notification_settings SET notifications_paused = ?, updated_by = ?, updated_at = NOW()
       WHERE id = (SELECT id FROM notification_settings ORDER BY id LIMIT 1)`,
      [!!paused, userId ?? null]
    );
    return HallNotificationService.getSettings();
  },

  computeScheduledTime: async (examDate, examStartTime, offsetMinutes, executor = db) {
    const tz = getInstitutionTimezone();
    const [rows] = await executor.query(
      `SELECT ((?::date + ?::time) AT TIME ZONE ?) - (? * INTERVAL '1 minute') AS scheduled_utc`,
      [examDate, examStartTime || "09:00:00", tz, offsetMinutes]
    );
    return rows[0]?.scheduled_utc ?? rows[0]?.scheduledutc;
  },

  scheduleForSeatingPlan: async (seatingPlanId, executor = db) => {
    const settings = await HallNotificationService.getSettings();

    const [plans] = await executor.query(
      `SELECT id, exam_date, exam_session, exam_type, exam_start_time, exam_end_time
       FROM seating_plans WHERE id = ?`,
      [seatingPlanId]
    );
    if (!plans.length) return { scheduled: 0, skipped: 0 };

    const plan = plans[0];
    const examDate = plan.exam_date ?? plan.examdate;
    const examSession = plan.exam_session ?? plan.examsession;
    const examType = plan.exam_type ?? plan.examtype;
    const examStartTime = plan.exam_start_time ?? plan.examstarttime;
    const examEndTime = plan.exam_end_time ?? plan.examendtime;
    const examTimeStr = `${examStartTime || ""} - ${examEndTime || ""}`.trim();

    const scheduledTime = await HallNotificationService.computeScheduledTime(
      examDate,
      examStartTime,
      settings.offsetMinutes,
      executor
    );

    const [venues] = await executor.query(
      `SELECT id, venue_name FROM seating_plan_venues WHERE seating_plan_id = ?`,
      [seatingPlanId]
    );

    const [arrangements] = await executor.query(
      `SELECT sa.regn_no, sa.seating_plan_venue_id, spv.venue_name
       FROM seating_arrangements sa
       JOIN seating_plan_venues spv ON spv.id = sa.seating_plan_venue_id
       WHERE spv.seating_plan_id = ?
         AND sa.regn_no IS NOT NULL AND TRIM(sa.regn_no) <> '' AND sa.regn_no <> '-'`,
      [seatingPlanId]
    );

    const [planStudents] = await executor.query(
      `SELECT regn_no, course_description FROM seating_plan_students WHERE seating_plan_id = ?`,
      [seatingPlanId]
    );
    const courseByRegn = {};
    for (const ps of planStudents || []) {
      const reg = String(ps.regn_no ?? ps.regnno ?? "").trim();
      if (reg) courseByRegn[reg] = ps.course_description ?? ps.coursedescription;
    }

    const regnSet = new Set();
    for (const a of arrangements || []) {
      regnSet.add(String(a.regn_no ?? a.regnno).trim());
    }
    if (regnSet.size === 0) return { scheduled: 0, skipped: 0 };

    const regnList = Array.from(regnSet);
    const [students] = await executor.query(
      `SELECT regn_no, MIN(student_name) AS student_name, MIN(email) AS email,
              MIN(course_description) AS course_description, MIN(course_name) AS course_name,
              MIN(department) AS department
       FROM students WHERE regn_no IN (${regnList.map(() => "?").join(",")})
       GROUP BY regn_no`,
      regnList
    );

    const studentByRegn = {};
    for (const s of students || []) {
      studentByRegn[String(s.regn_no ?? s.regnno).trim()] = s;
    }

    const venueByPlanVenueId = {};
    for (const v of venues || []) {
      venueByPlanVenueId[v.id] = v.venue_name ?? v.venuename;
    }

    const regnToHall = {};
    for (const a of arrangements || []) {
      const reg = String(a.regn_no ?? a.regnno).trim();
      regnToHall[reg] = a.venue_name ?? a.venuename ?? venueByPlanVenueId[a.seating_plan_venue_id];
    }

    let scheduled = 0;
    let skipped = 0;

    for (const regnNo of regnList) {
      const student = studentByRegn[regnNo];
      const email = String(student?.email ?? "").trim();
      if (!email) {
        skipped += 1;
        continue;
      }

      const idempotencyKey = buildIdempotencyKey({
        examDate,
        session: examSession,
        email,
      });

      const [existing] = await executor.query(
        `SELECT id FROM hall_notifications
         WHERE idempotency_key = ? AND status IN (${BLOCK_DUPLICATE_STATUSES.map(() => "?").join(",")})`,
        [idempotencyKey, ...BLOCK_DUPLICATE_STATUSES]
      );
      if (existing.length) {
        skipped += 1;
        continue;
      }

      const courseCode = courseByRegn[regnNo] || student?.course_description || student?.coursedescription;
      const courseName = student?.course_name ?? student?.coursename;

      const [insertResult] = await executor.query(
        `INSERT INTO hall_notifications (
           seating_plan_id, exam_date, exam_session, exam_start_time, exam_end_time, exam_type,
           scheduled_time, recipient_email, recipient_name, regn_no, hall_name,
           course_code, course_name, department, notification_type, idempotency_key, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'hall_seating', ?, 'SCHEDULED')`,
        [
          seatingPlanId,
          examDate,
          examSession,
          examStartTime,
          examEndTime,
          examType,
          scheduledTime,
          email,
          student?.student_name ?? student?.studentname ?? regnNo,
          regnNo,
          regnToHall[regnNo] || null,
          courseCode || null,
          courseName || null,
          student?.department ?? null,
          idempotencyKey,
        ]
      );

      const notificationId = insertResult?.insertId ?? insertResult?.[0]?.id;
      if (!notificationId) {
        skipped += 1;
        continue;
      }

      await logEvent(
        notificationId,
        "NOTIFICATION_SCHEDULED",
        `Scheduled for ${scheduledTime}`,
        { seatingPlanId, examDate, examSession, offsetMinutes: settings.offsetMinutes },
        executor
      );
      scheduled += 1;
    }

    return { scheduled, skipped, scheduledTime };
  },

  cancelForSeatingPlan: async (seatingPlanId, executor = db) => {
    const [result] = await executor.query(
      `UPDATE hall_notifications SET status = 'CANCELLED', updated_at = NOW()
       WHERE seating_plan_id = ? AND status IN ('SCHEDULED', 'QUEUED', 'RETRYING')`,
      [seatingPlanId]
    );
    const count = result?.affectedRows ?? 0;
    return { cancelled: count };
  },

  enqueueNotification: async (notificationId, { immediate = false } = {}) => {
    const [rows] = await db.query(`SELECT * FROM hall_notifications WHERE id = ?`, [notificationId]);
    const row = rows[0];
    if (!row) return null;
    if (row.status === "CANCELLED" || row.status === "DELIVERED") return null;

    const delay = immediate ? 0 : undefined;
    const job = await bullQueue.add(
      {
        type: "hall-notification",
        notificationId: row.id,
        email: row.recipient_email ?? row.recipientemail,
      },
      delay != null ? { delay } : {}
    );

    await db.query(
      `UPDATE hall_notifications SET status = 'QUEUED', bull_job_id = ?, updated_at = NOW() WHERE id = ?`,
      [String(job.id), notificationId]
    );
    await logEvent(notificationId, "NOTIFICATION_QUEUED", `Bull job ${job.id}`);
    return job;
  },

  processDueNotifications: async () => {
    const settings = await HallNotificationService.getSettings();
    if (settings.notificationsPaused) {
      return { queued: 0, paused: true };
    }

    const [dueRows] = await db.query(
      `SELECT id FROM hall_notifications
       WHERE status = 'SCHEDULED' AND scheduled_time <= NOW()
       ORDER BY scheduled_time ASC
       LIMIT 500`
    );

    let queued = 0;
    for (const r of dueRows || []) {
      try {
        await HallNotificationService.enqueueNotification(r.id);
        queued += 1;
      } catch (err) {
        console.error(`Failed to enqueue notification ${r.id}:`, err.message);
      }
    }
    return { queued, paused: false };
  },

  markProcessing: async (notificationId) => {
    await db.query(
      `UPDATE hall_notifications SET status = 'PROCESSING', updated_at = NOW() WHERE id = ?`,
      [notificationId]
    );
    await logEvent(notificationId, "NOTIFICATION_PROCESSING", "Worker picked up job");
  },

  markSent: async (notificationId, metadata = {}) => {
    await db.query(
      `UPDATE hall_notifications SET status = 'SENT', sent_at = NOW(), updated_at = NOW(), last_error = NULL
       WHERE id = ?`,
      [notificationId]
    );
    await logEvent(notificationId, "NOTIFICATION_SENT", "KCT Teams API accepted message", metadata);
  },

  markDelivered: async (notificationId, metadata = {}) => {
    await db.query(
      `UPDATE hall_notifications SET status = 'DELIVERED', delivered_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [notificationId]
    );
    await logEvent(notificationId, "NOTIFICATION_DELIVERED", "Delivery confirmed", metadata);
  },

  markFailed: async (notificationId, errorMessage, { retrying = false } = {}) => {
    const status = retrying ? "RETRYING" : "FAILED";
    await db.query(
      `UPDATE hall_notifications SET status = ?, last_error = ?, retry_count = retry_count + 1, updated_at = NOW()
       WHERE id = ?`,
      [status, errorMessage?.slice(0, 2000) || "Unknown error", notificationId]
    );
    await logEvent(notificationId, retrying ? "RETRY_ATTEMPT" : "NOTIFICATION_FAILED", errorMessage);
  },

  getNotificationById: async (id) => {
    const [rows] = await db.query(`SELECT * FROM hall_notifications WHERE id = ?`, [id]);
    return rows[0] ? HallNotificationService.toPublicRow(rows[0]) : null;
  },

  toPublicRow: (row) => ({
    id: row.id,
    uuid: row.public_uuid ?? row.publicuuid,
    seatingPlanId: row.seating_plan_id ?? row.seatingplanid,
    examDate: row.exam_date ?? row.examdate,
    examSession: row.exam_session ?? row.examsession,
    examStartTime: row.exam_start_time ?? row.examstarttime,
    examEndTime: row.exam_end_time ?? row.examendtime,
    examType: row.exam_type ?? row.examtype,
    scheduledTime: row.scheduled_time ?? row.scheduledtime,
    recipientEmail: row.recipient_email ?? row.recipientemail,
    recipientName: row.recipient_name ?? row.recipientname,
    regnNo: row.regn_no ?? row.regnno,
    hallName: row.hall_name ?? row.hallname,
    courseCode: row.course_code ?? row.coursecode,
    courseName: row.course_name ?? row.coursename,
    department: row.department,
    notificationType: row.notification_type ?? row.notificationtype,
    status: row.status,
    retryCount: Number(row.retry_count ?? row.retrycount ?? 0),
    lastError: row.last_error ?? row.lasterror,
    sentAt: row.sent_at ?? row.sentat,
    deliveredAt: row.delivered_at ?? row.deliveredat,
    createdAt: row.created_at ?? row.createdat,
    updatedAt: row.updated_at ?? row.updatedat,
  }),

  listNotifications: async (filters = {}) => {
    const clauses = ["1=1"];
    const params = [];

    if (filters.date) {
      clauses.push("exam_date = ?");
      params.push(filters.date);
    }
    if (filters.session) {
      clauses.push("exam_session = ?");
      params.push(filters.session);
    }
    if (filters.examType) {
      clauses.push("exam_type ILIKE ?");
      params.push(`%${filters.examType}%`);
    }
    if (filters.hall) {
      clauses.push("hall_name ILIKE ?");
      params.push(`%${filters.hall}%`);
    }
    if (filters.department) {
      clauses.push("department ILIKE ?");
      params.push(`%${filters.department}%`);
    }
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.search) {
      clauses.push(
        "(recipient_email ILIKE ? OR recipient_name ILIKE ? OR regn_no ILIKE ? OR hall_name ILIKE ?)"
      );
      const q = `%${filters.search.trim()}%`;
      params.push(q, q, q, q);
    }

    const where = clauses.join(" AND ");
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const page = Math.max(Number(filters.page) || 1, 1);
    const offset = (page - 1) * limit;

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total FROM hall_notifications WHERE ${where}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await db.query(
      `SELECT * FROM hall_notifications WHERE ${where}
       ORDER BY scheduled_time DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      notifications: (rows || []).map(HallNotificationService.toPublicRow),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  },

  getStats: async () => {
    const [rows] = await db.query(
      `SELECT status, COUNT(*) AS cnt FROM hall_notifications GROUP BY status`
    );
    const stats = {
      scheduled: 0,
      queued: 0,
      processing: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      retrying: 0,
      cancelled: 0,
      total: 0,
    };
    for (const r of rows || []) {
      const st = String(r.status ?? "").toLowerCase();
      const cnt = Number(r.cnt ?? 0);
      if (st in stats) stats[st] = cnt;
      stats.total += cnt;
    }
    return stats;
  },

  cancelNotification: async (id) => {
    const [result] = await db.query(
      `UPDATE hall_notifications SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = ? AND status IN ('SCHEDULED', 'QUEUED', 'RETRYING')`,
      [id]
    );
    if ((result?.affectedRows ?? 0) > 0) {
      await logEvent(id, "NOTIFICATION_CANCELLED", "Cancelled by admin");
      return true;
    }
    return false;
  },

  resendNotification: async (id) => {
    const [result] = await db.query(
      `UPDATE hall_notifications SET status = 'SCHEDULED', last_error = NULL, updated_at = NOW()
       WHERE id = ? AND status IN ('FAILED', 'CANCELLED', 'SENT', 'DELIVERED')`,
      [id]
    );
    if ((result?.affectedRows ?? 0) === 0) return false;
    await logEvent(id, "NOTIFICATION_RESEND_REQUESTED", "Admin requested resend");
    return HallNotificationService.enqueueNotification(id, { immediate: true });
  },

  sendNow: async (id) => {
    const n = await HallNotificationService.getNotificationById(id);
    if (!n || !["SCHEDULED", "RETRYING", "FAILED"].includes(n.status)) return false;
    await logEvent(id, "NOTIFICATION_SEND_NOW", "Admin triggered immediate send");
    return HallNotificationService.enqueueNotification(id, { immediate: true });
  },

  bulkResend: async (ids) => {
    let count = 0;
    for (const id of ids || []) {
      const ok = await HallNotificationService.resendNotification(id);
      if (ok) count += 1;
    }
    return { resent: count };
  },

  getEvents: async (notificationId) => {
    const [rows] = await db.query(
      `SELECT event_type, message, metadata, created_at FROM hall_notification_events
       WHERE notification_id = ? ORDER BY created_at ASC`,
      [notificationId]
    );
    return (rows || []).map((r) => ({
      eventType: r.event_type ?? r.eventtype,
      message: r.message,
      metadata: r.metadata,
      createdAt: r.created_at ?? r.createdat,
    }));
  },

  buildIdempotencyKey,
  ACTIVE_STATUSES,
};

module.exports = HallNotificationService;
