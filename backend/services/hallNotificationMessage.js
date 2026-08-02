const OFFSET_PRESETS = {
  "30_minutes": 30,
  "1_hour": 60,
  "2_hours": 120,
  "6_hours": 360,
  "12_hours": 720,
  "24_hours": 1440,
  custom: null,
};

function getInstitutionTimezone() {
  return process.env.INSTITUTION_TIMEZONE || "Asia/Kolkata";
}

function buildHallSeatingMessage({
  studentName,
  regnNo,
  hallName,
  examDate,
  examTime,
  examSession,
  examType,
  courseName,
  courseCode,
  department,
  portalUrl,
}) {
  const dateStr = examDate
    ? new Date(`${examDate}T12:00:00`).toLocaleDateString("en-IN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: getInstitutionTimezone(),
      })
    : "—";

  const portalLink = portalUrl
    ? `<br><br><a href="${portalUrl}">Open Hallora Portal</a>`
    : "";

  return `
<b>📢 Hall Allotment — Exam Notification</b><br><br>
Hello <b>${studentName || "Student"}</b>,<br><br>
Your examination hall allotment has been confirmed.<br><br>
<table style="border-collapse:collapse;font-size:14px;">
<tr><td><b>Register No</b></td><td>&nbsp;${regnNo || "—"}</td></tr>
<tr><td><b>Hall</b></td><td>&nbsp;${hallName || "—"}</td></tr>
<tr><td><b>Date</b></td><td>&nbsp;${dateStr}</td></tr>
<tr><td><b>Session</b></td><td>&nbsp;${examSession || "—"}</td></tr>
<tr><td><b>Time</b></td><td>&nbsp;${examTime || "—"}</td></tr>
<tr><td><b>Exam Type</b></td><td>&nbsp;${examType || "—"}</td></tr>
<tr><td><b>Subject</b></td><td>&nbsp;${courseName || courseCode || "—"}</td></tr>
<tr><td><b>Course Code</b></td><td>&nbsp;${courseCode || "—"}</td></tr>
<tr><td><b>Department</b></td><td>&nbsp;${department || "—"}</td></tr>
</table><br>
<b>Reporting:</b> Please arrive at the hall <b>10 minutes before</b> the exam start time.<br>
Carry your hall ticket and student ID.<br><br>
<i>— Hallora / KSI</i>${portalLink}
  `.trim();
}

module.exports = {
  OFFSET_PRESETS,
  buildHallSeatingMessage,
  getInstitutionTimezone,
};
