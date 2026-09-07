/**
 * HTML/text templates for faculty transfer approval notifications.
 * Matches Hallora invigilation email tone (institutional, plain professional).
 */

function formatDate(value) {
  if (!value) return "—";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function formatTime(value) {
  if (!value) return "—";
  const s = String(value).trim();
  const match = s.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  return s;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function portalDutyUrl() {
  const base =
    process.env.FRONTEND_URL ||
    process.env.API_PUBLIC_URL ||
    "https://iexam.kumaraguru.in";
  return `${String(base).replace(/\/$/, "")}/attendance/login`;
}

function buildTransferApprovalSubject() {
  return "Faculty Transfer Approved – Exam Invigilation Duty Updated";
}

function dutiesTableText(duties = []) {
  if (!duties.length) {
    return "There are currently no upcoming exam invigilation duties assigned to you in the system.";
  }
  return duties
    .map(
      (d, i) =>
        `${i + 1}. ${d.examName || "Examination"} | ${formatDate(d.examDate)} | ${
          d.session || "—"
        } | ${formatTime(d.startTime)} – ${formatTime(d.endTime)} | ${d.venueName || "—"}`
    )
    .join("\n");
}

function dutiesTableHtml(duties = []) {
  if (!duties.length) {
    return `<p style="margin:0 0 12px;color:#334155;">There are currently no upcoming exam invigilation duties assigned to you in the system.</p>`;
  }
  const rows = duties
    .map(
      (d) => `<tr>
      <td style="padding:8px 10px;border:1px solid #e2e8f0;">${escapeHtml(d.examName || "Examination")}</td>
      <td style="padding:8px 10px;border:1px solid #e2e8f0;">${escapeHtml(formatDate(d.examDate))}</td>
      <td style="padding:8px 10px;border:1px solid #e2e8f0;">${escapeHtml(d.session || "—")}</td>
      <td style="padding:8px 10px;border:1px solid #e2e8f0;">${escapeHtml(
        `${formatTime(d.startTime)} – ${formatTime(d.endTime)}`
      )}</td>
      <td style="padding:8px 10px;border:1px solid #e2e8f0;">${escapeHtml(d.venueName || "—")}</td>
    </tr>`
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-size:13px;margin:0 0 16px;">
    <thead>
      <tr style="background:#f1f5f9;">
        <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;">Exam</th>
        <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;">Date</th>
        <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;">Session</th>
        <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;">Time</th>
        <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;">Classroom</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * @param {'requester'|'incoming'} audience
 */
function buildTransferApprovalText(data, audience = "requester") {
  const {
    facultyName,
    approvedByName,
    approvedByRole,
    previousFacultyName,
    previousDepartment,
    newFacultyName,
    newDepartment,
    examName,
    examDate,
    session,
    venueName,
    startTime,
    endTime,
    approvalDate,
    upcomingDuties = [],
    portalUrl = portalDutyUrl(),
  } = data;

  const approverLabel = [approvedByName, approvedByRole].filter(Boolean).join(" / ") || "authorized staff";

  const intro =
    audience === "incoming"
      ? `An examination invigilation duty has been transferred to you following an approved faculty transfer request.`
      : `Your faculty transfer request has been approved by ${approverLabel}.`;

  return `Dear ${facultyName || "Faculty"},

Greetings from Hallora – Intelligent Exam Seating & Attendance System.

${intro}

TRANSFER DETAILS
Previous Faculty / Allocation : ${previousFacultyName || "—"} (${previousDepartment || "—"})
New Faculty / Allocation      : ${newFacultyName || "—"} (${newDepartment || "—"})
Examination                   : ${examName || "—"}
Date                          : ${formatDate(examDate)}
Session                       : ${session || "—"}
Time                          : ${formatTime(startTime)} – ${formatTime(endTime)}
Classroom                     : ${venueName || "—"}
Approved By                   : ${approverLabel}
Approval Date                 : ${formatDate(approvalDate)}

EXAM INVIGILATION DUTY
As a result of the approved faculty transfer, your exam invigilation duty allocation has been updated in the Hallora system.

${dutiesTableText(upcomingDuties)}

Please log in to Hallora to view your latest exam invigilation duty details.
${portalUrl}

IMPORTANT
Please verify your updated exam invigilation duty in the Hallora portal before attending your next examination duty.

Any previous duty information associated with the former allocation for this examination hall should be considered outdated once the approved transfer becomes effective, unless otherwise communicated by the concerned authority.

This is an automated email generated by the Hallora Examination Management System.

Regards,

Hallora – Intelligent Exam Seating & Attendance System
Examination Cell
Kumaraguru College of Technology

Email: support.iexam@kct.ac.in
`;
}

function buildTransferApprovalHtml(data, audience = "requester") {
  const {
    facultyName,
    approvedByName,
    approvedByRole,
    previousFacultyName,
    previousDepartment,
    newFacultyName,
    newDepartment,
    examName,
    examDate,
    session,
    venueName,
    startTime,
    endTime,
    approvalDate,
    upcomingDuties = [],
    portalUrl = portalDutyUrl(),
  } = data;

  const approverLabel =
    [approvedByName, approvedByRole].filter(Boolean).join(" / ") || "authorized staff";
  const intro =
    audience === "incoming"
      ? `An examination invigilation duty has been transferred to you following an approved faculty transfer request.`
      : `Your faculty transfer request has been approved by <strong>${escapeHtml(
          approverLabel
        )}</strong>.`;

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:24px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#0B1F4B;color:#fff;padding:18px 24px;">
      <div style="font-size:18px;font-weight:700;">Hallora</div>
      <div style="font-size:13px;opacity:0.9;margin-top:4px;">Faculty Transfer Notification</div>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;">Dear ${escapeHtml(facultyName || "Faculty")},</p>
      <p style="margin:0 0 16px;line-height:1.5;">${intro}</p>

      <h3 style="margin:0 0 8px;font-size:15px;color:#0B1F4B;">Transfer Details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 20px;">
        <tr><td style="padding:6px 0;color:#64748b;width:42%;">Previous Faculty / Allocation</td><td style="padding:6px 0;">${escapeHtml(
          previousFacultyName || "—"
        )} (${escapeHtml(previousDepartment || "—")})</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">New Faculty / Allocation</td><td style="padding:6px 0;">${escapeHtml(
          newFacultyName || "—"
        )} (${escapeHtml(newDepartment || "—")})</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Examination</td><td style="padding:6px 0;">${escapeHtml(
          examName || "—"
        )}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Date / Session</td><td style="padding:6px 0;">${escapeHtml(
          formatDate(examDate)
        )} · ${escapeHtml(session || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Time</td><td style="padding:6px 0;">${escapeHtml(
          `${formatTime(startTime)} – ${formatTime(endTime)}`
        )}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Classroom</td><td style="padding:6px 0;">${escapeHtml(
          venueName || "—"
        )}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Approved By</td><td style="padding:6px 0;">${escapeHtml(
          approverLabel
        )}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Approval Date</td><td style="padding:6px 0;">${escapeHtml(
          formatDate(approvalDate)
        )}</td></tr>
      </table>

      <h3 style="margin:0 0 8px;font-size:15px;color:#0B1F4B;">Exam Invigilation Duty</h3>
      <p style="margin:0 0 12px;line-height:1.5;color:#334155;">
        As a result of the approved faculty transfer, your exam invigilation duty allocation has been updated in the Hallora system.
        Please log in to Hallora to view your latest exam invigilation duty details.
      </p>
      ${dutiesTableHtml(upcomingDuties)}

      <p style="margin:0 0 20px;">
        <a href="${escapeHtml(portalUrl)}"
           style="display:inline-block;background:#0B1F4B;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;">
          View My Exam Invigilation Duty
        </a>
      </p>

      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.5;color:#9a3412;">
        <strong>Important:</strong> Please verify your updated exam invigilation duty in the Hallora portal before attending your next examination duty.
        Any previous duty information associated with the former allocation for this examination hall should be considered outdated once the approved transfer becomes effective, unless otherwise communicated by the concerned authority.
      </div>

      <p style="margin:20px 0 0;font-size:12px;color:#64748b;line-height:1.5;">
        This is an automated email generated by the Hallora Examination Management System.<br/>
        Regards,<br/>
        Hallora – Exam &amp; Faculty Management System<br/>
        Examination Cell · Kumaraguru College of Technology
      </p>
    </div>
  </div>
</body></html>`;
}

module.exports = {
  formatDate,
  formatTime,
  portalDutyUrl,
  buildTransferApprovalSubject,
  buildTransferApprovalText,
  buildTransferApprovalHtml,
};
