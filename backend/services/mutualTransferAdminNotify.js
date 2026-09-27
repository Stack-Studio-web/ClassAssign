/**
 * Notify Admin / Faculty Incharge when a mutual faculty change is approved.
 */
const db = require("../config/db");
const { sendMail, isSmtpConfigured } = require("../utils/mailer");
const {
  formatDate,
  formatTime,
} = require("./transferApprovalEmailMessage");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDisplayDate(value) {
  if (!value) return "—";
  const raw = formatDate(value);
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDisplayDateTime(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

async function listAdminAndFiEmails() {
  const [rows] = await db.query(
    `SELECT DISTINCT LOWER(TRIM(u.email)) AS email, u.username, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name IN ('admin', 'faculty_incharge')
       AND COALESCE(u.is_active, TRUE) = TRUE
       AND u.email IS NOT NULL
       AND TRIM(u.email) <> ''`
  );
  return (rows || [])
    .map((r) => ({
      email: r.email,
      name: r.username || r.email,
      role: r.role_name || r.rolename,
    }))
    .filter((r) => r.email && r.email.includes("@"));
}

function buildAdminNotifySubject({ courseCode, examDate }) {
  const code = courseCode || "Exam";
  return `Mutual Faculty Change Approved – ${code} – ${formatDate(examDate)}`;
}

function buildAdminNotifyText(data) {
  return `Dear Admin / Faculty Incharge,

A mutual faculty change request has been approved by the concerned faculty member.

Faculty Change Details
Requested By : ${data.requestedByName || "—"}
Approved By  : ${data.approvedByName || "—"}

Course Code  : ${data.courseCode || "—"}
Course Name  : ${data.courseName || "—"}
Date         : ${formatDisplayDate(data.examDate)}
Time         : ${formatTime(data.startTime)} – ${formatTime(data.endTime)}
Session      : ${data.session || "—"}
Venue        : ${data.venueName || "—"}

Assignment Change
Previous Faculty : ${data.previousFacultyName || "—"}
New Faculty      : ${data.newFacultyName || "—"}

The request was approved mutually by the concerned faculty members.

The faculty assignment has been updated, and attendance responsibility for this assignment has been transferred to ${data.newFacultyName || "the new faculty"}.

Request Status : APPROVED
Approved At    : ${formatDisplayDateTime(data.approvedAt)}

This email is for your information and records.

Regards,
Hallora – Examination Management System
`;
}

function buildAdminNotifyHtml(data) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#0B1F4B;color:#fff;padding:18px 24px;">
      <div style="font-size:18px;font-weight:700;">Hallora</div>
      <div style="font-size:13px;opacity:0.9;margin-top:4px;">Mutual Faculty Change Approved</div>
    </div>
    <div style="padding:24px;font-size:14px;line-height:1.55;">
      <p style="margin:0 0 14px;">Dear Admin / Faculty Incharge,</p>
      <p style="margin:0 0 16px;">A mutual faculty change request has been approved by the concerned faculty member.</p>

      <h3 style="margin:0 0 8px;font-size:15px;color:#0B1F4B;">Faculty Change Details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 18px;">
        <tr><td style="padding:6px 0;color:#64748b;width:40%;">Requested By</td><td>${escapeHtml(data.requestedByName || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Approved By</td><td>${escapeHtml(data.approvedByName || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Course Code</td><td>${escapeHtml(data.courseCode || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Course Name</td><td>${escapeHtml(data.courseName || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Date</td><td>${escapeHtml(formatDisplayDate(data.examDate))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Time</td><td>${escapeHtml(`${formatTime(data.startTime)} – ${formatTime(data.endTime)}`)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Session</td><td>${escapeHtml(data.session || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Venue</td><td>${escapeHtml(data.venueName || "—")}</td></tr>
      </table>

      <h3 style="margin:0 0 8px;font-size:15px;color:#0B1F4B;">Assignment Change</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 18px;">
        <tr><td style="padding:6px 0;color:#64748b;width:40%;">Previous Faculty</td><td>${escapeHtml(data.previousFacultyName || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">New Faculty</td><td>${escapeHtml(data.newFacultyName || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Request Status</td><td><strong>APPROVED</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Approved At</td><td>${escapeHtml(formatDisplayDateTime(data.approvedAt))}</td></tr>
      </table>

      <p style="margin:0 0 12px;">
        The faculty assignment has been updated, and <strong>attendance responsibility for this assignment has been transferred to ${escapeHtml(
          data.newFacultyName || "the new faculty"
        )}</strong>.
      </p>
      <p style="margin:0;color:#64748b;font-size:12px;">This email is for your information and records.</p>
      <p style="margin:18px 0 0;font-size:12px;color:#64748b;">
        Regards,<br/>
        <strong>Hallora – Examination Management System</strong>
      </p>
    </div>
  </div>
</body></html>`;
}

async function notifyAdminsOfMutualApproval(payload) {
  const result = { sent: false, recipients: [], errors: [] };
  if (!isSmtpConfigured()) {
    console.warn("[mutual-transfer-email] SMTP not configured; skipping admin/FI notify");
    return { ...result, skipped: true, reason: "smtp_not_configured" };
  }

  const recipients = await listAdminAndFiEmails();
  if (!recipients.length) {
    return { ...result, skipped: true, reason: "no_admin_recipients" };
  }

  const subject = buildAdminNotifySubject(payload);
  const text = buildAdminNotifyText(payload);
  const html = buildAdminNotifyHtml(payload);

  for (const r of recipients) {
    try {
      await sendMail({ to: r.email, subject, text, html });
      result.recipients.push({ email: r.email, role: r.role, sent: true });
      result.sent = true;
    } catch (err) {
      console.error("[mutual-transfer-email] Failed for", r.email, err?.message || err);
      result.errors.push({ email: r.email, message: err?.message || String(err) });
    }
  }
  return result;
}

module.exports = {
  listAdminAndFiEmails,
  notifyAdminsOfMutualApproval,
  buildAdminNotifySubject,
  buildAdminNotifyText,
  buildAdminNotifyHtml,
};
