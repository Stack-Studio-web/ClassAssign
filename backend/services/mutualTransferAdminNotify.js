/**
 * Notify the Faculty Incharge's configured notification email
 * when a mutual faculty change is approved.
 */
const { sendMail, isSmtpConfigured } = require("../utils/mailer");
const FacultyChangeNotifySettings = require("./facultyChangeNotifySettings");
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

function formatDisplayTime(value) {
  if (!value) return "—";
  const raw = formatTime(value);
  const match = String(raw).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw;
  let hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${String(hour).padStart(2, "0")}:${minute} ${period}`;
}

function buildAdminNotifySubject({ courseCode }) {
  const code = courseCode || "Exam";
  return `Hallora – Mutual Faculty Change Approved – ${code}`;
}

function buildAdminNotifyText(data) {
  return `Dear Faculty Incharge,

A mutual faculty change request has been approved in Hallora.

Faculty Change Details

Requested By: ${data.requestedByName || "—"}
Approved By: ${data.approvedByName || "—"}

Course Code: ${data.courseCode || "—"}
Course Name: ${data.courseName || "—"}
Department: ${data.department || "—"}

Exam Date: ${formatDisplayDate(data.examDate)}
Time: ${formatDisplayTime(data.startTime)} – ${formatDisplayTime(data.endTime)}
Session: ${data.session || "—"}
Exam Type: ${data.examType || "—"}
Venue: ${data.venueName || "—"}

Assignment Change

Previous Faculty: ${data.previousFacultyName || "—"}
New Faculty: ${data.newFacultyName || "—"}

Attendance Responsibility:
${data.newFacultyName || "—"}

Status: APPROVED

The mutual faculty change has been approved by both faculties
and the attendance responsibility has been transferred to the
new faculty.

Regards,
Hallora Examination Management System
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
      <p style="margin:0 0 14px;">Dear Faculty Incharge,</p>
      <p style="margin:0 0 16px;">A mutual faculty change request has been approved in Hallora.</p>

      <h3 style="margin:0 0 8px;font-size:15px;color:#0B1F4B;">Faculty Change Details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 18px;">
        <tr><td style="padding:6px 0;color:#64748b;width:42%;">Requested By</td><td>${escapeHtml(data.requestedByName || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Approved By</td><td>${escapeHtml(data.approvedByName || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Course Code</td><td>${escapeHtml(data.courseCode || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Course Name</td><td>${escapeHtml(data.courseName || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Department</td><td>${escapeHtml(data.department || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Exam Date</td><td>${escapeHtml(formatDisplayDate(data.examDate))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Time</td><td>${escapeHtml(`${formatDisplayTime(data.startTime)} – ${formatDisplayTime(data.endTime)}`)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Session</td><td>${escapeHtml(data.session || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Exam Type</td><td>${escapeHtml(data.examType || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Venue</td><td>${escapeHtml(data.venueName || "—")}</td></tr>
      </table>

      <h3 style="margin:0 0 8px;font-size:15px;color:#0B1F4B;">Assignment Change</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 18px;">
        <tr><td style="padding:6px 0;color:#64748b;width:42%;">Previous Faculty</td><td>${escapeHtml(data.previousFacultyName || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">New Faculty</td><td>${escapeHtml(data.newFacultyName || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Attendance Responsibility</td><td>${escapeHtml(data.newFacultyName || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Status</td><td><strong>APPROVED</strong></td></tr>
      </table>

      <p style="margin:0 0 12px;">
        The mutual faculty change has been approved by both faculties
        and the attendance responsibility has been transferred to the
        new faculty.
      </p>
      <p style="margin:18px 0 0;font-size:12px;color:#64748b;">
        Regards,<br/>
        <strong>Hallora Examination Management System</strong>
      </p>
    </div>
  </div>
</body></html>`;
}

/**
 * Sends to the FI-configured notification email for the exam owner.
 * Does not email personal FI/admin accounts.
 */
async function notifyAdminsOfMutualApproval(payload) {
  const result = { sent: false, recipients: [], errors: [] };
  if (!isSmtpConfigured()) {
    console.warn("[mutual-transfer-email] SMTP not configured; skipping FI notify");
    return { ...result, skipped: true, reason: "smtp_not_configured" };
  }

  const ownerUserId = payload.ownerUserId ?? payload.owner_user_id ?? null;
  const configuredEmail = await FacultyChangeNotifySettings.getEmailForOwner(ownerUserId);
  if (!configuredEmail) {
    console.warn(
      "[mutual-transfer-email] No Faculty Change Email configured for owner",
      ownerUserId
    );
    return { ...result, skipped: true, reason: "no_configured_email" };
  }

  const subject = buildAdminNotifySubject(payload);
  const text = buildAdminNotifyText(payload);
  const html = buildAdminNotifyHtml(payload);

  try {
    await sendMail({ to: configuredEmail, subject, text, html });
    result.recipients.push({ email: configuredEmail, role: "faculty_incharge_notify", sent: true });
    result.sent = true;
  } catch (err) {
    console.error("[mutual-transfer-email] Failed for", configuredEmail, err?.message || err);
    result.errors.push({ email: configuredEmail, message: err?.message || String(err) });
  }
  return result;
}

module.exports = {
  notifyAdminsOfMutualApproval,
  buildAdminNotifySubject,
  buildAdminNotifyText,
  buildAdminNotifyHtml,
};
