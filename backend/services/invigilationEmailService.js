const db = require("../config/db");
const { sendMail, isSmtpConfigured, getMailFrom } = require("../utils/mailer");
const {
  buildInvigilationSubject,
  buildInvigilationText,
  buildInvigilationHtml,
  formatDate,
  formatTime,
} = require("./invigilationEmailMessage");

function portalUrl() {
  const base =
    process.env.FRONTEND_URL ||
    process.env.API_PUBLIC_URL ||
    "https://iexam.kumaraguru.in";
  return `${String(base).replace(/\/$/, "")}/attendance/login`;
}

function examNameFromPlan(row) {
  const fromExam = row.exam_name ?? row.examname;
  if (fromExam) return fromExam;
  const courses = row.selected_courses ?? row.selectedcourses;
  try {
    const parsed = typeof courses === "string" ? JSON.parse(courses) : courses;
    if (Array.isArray(parsed) && parsed.length) {
      return parsed
        .map((c) => c.courseCode || c.course_code || c.code || c.name || c)
        .filter(Boolean)
        .join(", ");
    }
  } catch {
    /* ignore */
  }
  return row.exam_type ?? row.examtype ?? "Examination";
}

async function fetchAllotmentsForPlans(seatingPlanIds) {
  if (!seatingPlanIds.length) return [];
  const placeholders = seatingPlanIds.map(() => "?").join(",");
  const [rows] = await db.query(
    `
    SELECT
      sp.id AS seating_plan_id,
      sp.public_uuid AS seating_plan_uuid,
      sp.exam_date,
      sp.exam_session,
      sp.exam_type,
      sp.exam_start_time,
      sp.exam_end_time,
      sp.selected_courses,
      spv.venue_id,
      spv.venue_name,
      v.name AS venue_table_name,
      f.id AS faculty_id,
      f.name AS faculty_name,
      f.email AS faculty_email,
      f.department AS faculty_department,
      e.id AS exam_id,
      e.exam_name,
      e.exam_code
    FROM seating_plan_venues spv
    JOIN seating_plans sp ON sp.id = spv.seating_plan_id
    JOIN faculty f ON f.id = spv.faculty_id
    LEFT JOIN venues v ON v.id = spv.venue_id
    LEFT JOIN faculty_assignments fa
      ON fa.faculty_id = f.id
     AND fa.venue_id = spv.venue_id
     AND fa.assigned_date = sp.exam_date
    LEFT JOIN exams e ON e.id = fa.exam_id
    WHERE sp.id IN (${placeholders})
      AND spv.faculty_id IS NOT NULL
    ORDER BY sp.exam_date, sp.exam_session, f.name
    `,
    seatingPlanIds
  );
  return rows || [];
}

async function wasAlreadySent(facultyId, seatingPlanId, venueId) {
  const [rows] = await db.query(
    `SELECT id FROM invigilation_email_logs
     WHERE faculty_id = ? AND seating_plan_id = ? AND venue_id = ?
       AND status = 'SENT'
     LIMIT 1`,
    [facultyId, seatingPlanId, venueId]
  );
  return Boolean(rows?.[0]);
}

async function insertLog(row) {
  const [result] = await db.query(
    `INSERT INTO invigilation_email_logs
      (batch_id, seating_plan_id, exam_id, faculty_id, venue_id,
       faculty_email, faculty_name, subject, status, error_message, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      row.batchId,
      row.seatingPlanId,
      row.examId,
      row.facultyId,
      row.venueId,
      row.facultyEmail,
      row.facultyName,
      row.subject,
      row.status,
      row.errorMessage || null,
      row.sentAt || null,
    ]
  );
  return result?.insertId ?? result?.[0]?.id;
}

async function updateBatchCounts(batchId, counts, status = null, errorMessage = null) {
  const done = status === "COMPLETED" || status === "FAILED";
  await db.query(
    `UPDATE invigilation_notification_batches
     SET total_faculty = ?,
         sent_count = ?,
         failed_count = ?,
         skipped_no_email = ?,
         skipped_duplicate = ?,
         status = COALESCE(?, status),
         error_message = COALESCE(?, error_message),
         completed_at = CASE WHEN ? THEN NOW() ELSE completed_at END
     WHERE id = ?`,
    [
      counts.total,
      counts.sent,
      counts.failed,
      counts.skippedNoEmail,
      counts.skippedDuplicate,
      status,
      errorMessage,
      done,
      batchId,
    ]
  );
}

async function createBatch({ seatingPlanIds, initiatedBy, resend }) {
  const [result] = await db.query(
    `INSERT INTO invigilation_notification_batches
      (seating_plan_ids, initiated_by, resend, status)
     VALUES (?::jsonb, ?, ?, 'PENDING')
     RETURNING id, public_uuid`,
    [JSON.stringify(seatingPlanIds), initiatedBy || null, Boolean(resend)]
  );
  const row = Array.isArray(result) ? result[0] : result;
  return {
    id: row?.id ?? result?.insertId,
    uuid: row?.public_uuid ?? row?.publicuuid,
  };
}

async function getBatchByUuid(uuid) {
  const [rows] = await db.query(
    `SELECT id, public_uuid, seating_plan_ids, resend, status,
            total_faculty, sent_count, failed_count, skipped_no_email, skipped_duplicate,
            error_message, created_at, completed_at
     FROM invigilation_notification_batches
     WHERE public_uuid = ?
     LIMIT 1`,
    [uuid]
  );
  const row = rows?.[0];
  if (!row) return null;
  return {
    uuid: row.public_uuid ?? row.publicuuid,
    status: row.status,
    resend: Boolean(row.resend),
    totalFaculty: Number(row.total_faculty ?? 0),
    sentSuccessfully: Number(row.sent_count ?? 0),
    failedEmails: Number(row.failed_count ?? 0),
    withoutEmail: Number(row.skipped_no_email ?? 0),
    skippedDuplicate: Number(row.skipped_duplicate ?? 0),
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at ?? row.createdat,
    completedAt: row.completed_at ?? row.completedat,
    id: row.id,
  };
}

async function getBatchLogs(batchId) {
  const [rows] = await db.query(
    `SELECT faculty_name, faculty_email, status, error_message, sent_at, subject
     FROM invigilation_email_logs
     WHERE batch_id = ?
     ORDER BY id`,
    [batchId]
  );
  return (rows || []).map((r) => ({
    facultyName: r.faculty_name ?? r.facultyname,
    facultyEmail: r.faculty_email ?? r.facultyemail,
    status: r.status,
    errorMessage: r.error_message ?? r.errormessage,
    sentAt: r.sent_at ?? r.sentat,
    subject: r.subject,
  }));
}

async function processBatch(batchId, { seatingPlanIds, resend }) {
  const counts = {
    total: 0,
    sent: 0,
    failed: 0,
    skippedNoEmail: 0,
    skippedDuplicate: 0,
  };

  try {
    if (!isSmtpConfigured()) {
      await updateBatchCounts(
        batchId,
        counts,
        "FAILED",
        "SMTP is not configured. Set SMTP_USER and SMTP_PASS."
      );
      return;
    }

    await db.query(
      `UPDATE invigilation_notification_batches SET status = 'PROCESSING' WHERE id = ?`,
      [batchId]
    );

    const allotments = await fetchAllotmentsForPlans(seatingPlanIds);
    counts.total = allotments.length;
    await updateBatchCounts(batchId, counts, "PROCESSING");

    for (const row of allotments) {
      const facultyId = row.faculty_id ?? row.facultyid;
      const seatingPlanId = row.seating_plan_id ?? row.seatingplanid;
      const venueId = row.venue_id ?? row.venueid;
      const examId = row.exam_id ?? row.examid ?? null;
      const facultyName = row.faculty_name ?? row.facultyname ?? "Faculty";
      const facultyEmail = String(row.faculty_email ?? row.facultyemail ?? "")
        .trim()
        .toLowerCase();
      const venue =
        row.venue_name ?? row.venuename ?? row.venue_table_name ?? row.venuetablename ?? "—";
      const examDate = row.exam_date ?? row.examdate;
      const session = row.exam_session ?? row.examsession;
      const examType = row.exam_type ?? row.examtype ?? "—";
      const examName = examNameFromPlan(row);
      const startTime = row.exam_start_time ?? row.examstarttime;
      const endTime = row.exam_end_time ?? row.examendtime;

      const payload = {
        facultyName,
        examType,
        examName,
        examDate,
        session,
        startTime,
        endTime,
        venue,
        portalUrl: portalUrl(),
      };
      const subject = buildInvigilationSubject({ examDate, session });

      if (!facultyEmail) {
        counts.skippedNoEmail += 1;
        await insertLog({
          batchId,
          seatingPlanId,
          examId,
          facultyId,
          venueId,
          facultyEmail: null,
          facultyName,
          subject,
          status: "SKIPPED_NO_EMAIL",
          errorMessage: "Faculty email missing in database",
        });
        await updateBatchCounts(batchId, counts, "PROCESSING");
        continue;
      }

      if (!resend && (await wasAlreadySent(facultyId, seatingPlanId, venueId))) {
        counts.skippedDuplicate += 1;
        await insertLog({
          batchId,
          seatingPlanId,
          examId,
          facultyId,
          venueId,
          facultyEmail,
          facultyName,
          subject,
          status: "SKIPPED_DUPLICATE",
          errorMessage: "Notification already sent for this faculty and examination",
        });
        await updateBatchCounts(batchId, counts, "PROCESSING");
        continue;
      }

      try {
        await sendMail({
          to: facultyEmail,
          subject,
          text: buildInvigilationText(payload),
          html: buildInvigilationHtml(payload),
        });
        counts.sent += 1;
        await insertLog({
          batchId,
          seatingPlanId,
          examId,
          facultyId,
          venueId,
          facultyEmail,
          facultyName,
          subject,
          status: "SENT",
          sentAt: new Date(),
        });
      } catch (err) {
        counts.failed += 1;
        await insertLog({
          batchId,
          seatingPlanId,
          examId,
          facultyId,
          venueId,
          facultyEmail,
          facultyName,
          subject,
          status: "FAILED",
          errorMessage: err.message || "Send failed",
        });
      }

      await updateBatchCounts(batchId, counts, "PROCESSING");
      // Gentle pacing for Microsoft 365 SMTP
      await new Promise((r) => setTimeout(r, 400));
    }

    await updateBatchCounts(batchId, counts, "COMPLETED");
  } catch (err) {
    console.error("Invigilation email batch failed:", err);
    await updateBatchCounts(
      batchId,
      counts,
      "FAILED",
      err.message || "Batch processing failed"
    );
  }
}

async function startNotificationBatch({ seatingPlanIds, initiatedBy, resend = false }) {
  if (!Array.isArray(seatingPlanIds) || seatingPlanIds.length === 0) {
    const err = new Error("Select at least one seating plan.");
    err.statusCode = 400;
    throw err;
  }

  const batch = await createBatch({ seatingPlanIds, initiatedBy, resend });
  setImmediate(() => {
    processBatch(batch.id, { seatingPlanIds, resend }).catch((err) => {
      console.error("Background invigilation email batch error:", err);
    });
  });

  return {
    batchUuid: batch.uuid,
    mailFrom: getMailFrom(),
    smtpConfigured: isSmtpConfigured(),
  };
}

module.exports = {
  startNotificationBatch,
  getBatchByUuid,
  getBatchLogs,
  fetchAllotmentsForPlans,
  isSmtpConfigured,
  formatDate,
  formatTime,
};
