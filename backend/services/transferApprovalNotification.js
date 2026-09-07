/**
 * Post-approval email notifications for faculty transfer.
 * Sends after DB commit; failures are logged and must not roll back approval.
 */
const db = require("../config/db");
const { sendMail, isSmtpConfigured } = require("../utils/mailer");
const {
  portalDutyUrl,
  buildTransferApprovalSubject,
  buildTransferApprovalText,
  buildTransferApprovalHtml,
  formatDate,
  formatTime,
} = require("./transferApprovalEmailMessage");

function normalizeTimePart(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(
      2,
      "0"
    )}`;
  }
  const s = String(value).trim();
  const match = s.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  return s.length >= 5 ? s.slice(0, 5) : s;
}

async function getFacultySnapshot(facultyId) {
  if (!facultyId) return null;
  const [rows] = await db.query(
    `SELECT id, name, email, department FROM faculty WHERE id = ? LIMIT 1`,
    [facultyId]
  );
  const r = rows?.[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name || "",
    email: String(r.email || "").trim().toLowerCase(),
    department: r.department || "",
  };
}

async function getApproverSnapshot(userId) {
  if (!userId) return { name: null, role: null };
  const [rows] = await db.query(
    `SELECT u.username, u.email, r.name AS role_name
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );
  const r = rows?.[0];
  if (!r) return { name: null, role: null };
  return {
    name: r.username || r.email || null,
    role: r.role_name || r.rolename || null,
  };
}

/**
 * Upcoming (non-completed) invigilation duties for a faculty id.
 * Uses faculty_assignments + exams; filters out lifecycle COMPLETED when session exists.
 */
async function getUpcomingDutiesForFaculty(facultyId) {
  if (!facultyId) return [];
  const [rows] = await db.query(
    `SELECT
       e.exam_name,
       e.exam_code,
       e.exam_date,
       e.exam_session,
       e.exam_time,
       fa.start_time,
       fa.end_time,
       v.name AS venue_name,
       sess.lifecycle_status
     FROM faculty_assignments fa
     JOIN exams e ON e.id = fa.exam_id
     JOIN venues v ON v.id = fa.venue_id
     LEFT JOIN attendance_sessions sess
       ON sess.exam_id = fa.exam_id AND sess.venue_id = fa.venue_id
     WHERE fa.faculty_id = ?
       AND COALESCE(sess.lifecycle_status, 'ACTIVE') <> 'COMPLETED'
       AND e.exam_date >= CURRENT_DATE
     ORDER BY e.exam_date ASC, COALESCE(fa.start_time::text, e.exam_time) ASC`,
    [facultyId]
  );

  return (rows || []).map((r) => {
    const examTime = String(r.exam_time ?? r.examtime ?? "");
    const parts = examTime.split("-").map((p) => p.trim());
    return {
      examName: r.exam_name ?? r.examname ?? r.exam_code ?? r.examcode ?? "Examination",
      examDate: r.exam_date ?? r.examdate,
      session: r.exam_session ?? r.examsession ?? "—",
      startTime: normalizeTimePart(r.start_time ?? r.starttime) || normalizeTimePart(parts[0]),
      endTime: normalizeTimePart(r.end_time ?? r.endtime) || normalizeTimePart(parts[1]),
      venueName: r.venue_name ?? r.venuename ?? "—",
    };
  });
}

async function sendOneTransferEmail({ to, audience, payload }) {
  if (!to || !to.includes("@")) {
    return { sent: false, skipped: true, reason: "missing_email" };
  }
  if (!isSmtpConfigured()) {
    console.warn("[transfer-email] SMTP not configured; skipping notification to", to);
    return { sent: false, skipped: true, reason: "smtp_not_configured" };
  }

  const subject = buildTransferApprovalSubject();
  const text = buildTransferApprovalText(payload, audience);
  const html = buildTransferApprovalHtml(payload, audience);
  await sendMail({ to, subject, text, html });
  return { sent: true, skipped: false, to };
}

/**
 * Notify requester (outgoing) and incoming faculty after successful approval.
 */
async function notifyTransferApproved({
  currentFacultyId,
  newFacultyId,
  adminUserId,
  transferDuty,
}) {
  const results = {
    queued: false,
    sent: false,
    recipients: [],
    errors: [],
  };

  try {
    const [previousFaculty, newFaculty, approver, previousDuties, newDuties] =
      await Promise.all([
        getFacultySnapshot(currentFacultyId),
        getFacultySnapshot(newFacultyId),
        getApproverSnapshot(adminUserId),
        getUpcomingDutiesForFaculty(currentFacultyId),
        getUpcomingDutiesForFaculty(newFacultyId),
      ]);

    const shared = {
      approvedByName: approver.name,
      approvedByRole: approver.role,
      previousFacultyName: previousFaculty?.name || transferDuty?.previousFacultyName,
      previousDepartment: previousFaculty?.department || "—",
      newFacultyName: newFaculty?.name || transferDuty?.newFacultyName,
      newDepartment: newFaculty?.department || "—",
      examName: transferDuty?.examName || "—",
      examDate: transferDuty?.examDate,
      session: transferDuty?.session,
      venueName: transferDuty?.venueName,
      startTime: transferDuty?.startTime,
      endTime: transferDuty?.endTime,
      approvalDate: new Date(),
      portalUrl: portalDutyUrl(),
    };

    if (previousFaculty?.email) {
      try {
        const r = await sendOneTransferEmail({
          to: previousFaculty.email,
          audience: "requester",
          payload: {
            ...shared,
            facultyName: previousFaculty.name,
            upcomingDuties: previousDuties,
          },
        });
        results.recipients.push({ role: "requester", ...r });
        if (r.sent) results.sent = true;
      } catch (err) {
        console.error(
          "[transfer-email] Failed to notify requester:",
          err?.message || err
        );
        results.errors.push({ role: "requester", message: err?.message || String(err) });
      }
    }

    if (newFaculty?.email && newFaculty.email !== previousFaculty?.email) {
      try {
        const r = await sendOneTransferEmail({
          to: newFaculty.email,
          audience: "incoming",
          payload: {
            ...shared,
            facultyName: newFaculty.name,
            upcomingDuties: newDuties,
          },
        });
        results.recipients.push({ role: "incoming", ...r });
        if (r.sent) results.sent = true;
      } catch (err) {
        console.error(
          "[transfer-email] Failed to notify incoming faculty:",
          err?.message || err
        );
        results.errors.push({ role: "incoming", message: err?.message || String(err) });
      }
    }

    results.queued = false;
    return results;
  } catch (err) {
    console.error("[transfer-email] Notification pipeline failed:", err?.message || err);
    results.errors.push({ role: "pipeline", message: err?.message || String(err) });
    return results;
  }
}

module.exports = {
  getFacultySnapshot,
  getApproverSnapshot,
  getUpcomingDutiesForFaculty,
  notifyTransferApproved,
  formatDate,
  formatTime,
};
