/**
 * Regression checks for mutual faculty transfer (transfer-only, time overlap).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  buildAdminNotifySubject,
  buildAdminNotifyText,
  buildAdminNotifyHtml,
} = require("../services/mutualTransferAdminNotify");
const {
  examTimesOverlap,
  transferWindowsConflict,
  buildTransferOverlapMessage,
} = require("../utils/facultyTimeConflict");

function testAdminSubject() {
  const s = buildAdminNotifySubject({
    courseCode: "24BCS101",
    examDate: "2026-09-29",
  });
  assert.ok(s.includes("Hallora"));
  assert.ok(s.includes("Mutual Faculty Change Approved"));
  assert.ok(s.includes("24BCS101"));
  assert.ok(!s.includes("2026-09-29"));
}

function testAdminBody() {
  const data = {
    requestedByName: "Faizal",
    approvedByName: "Prithiviraj",
    courseCode: "24BCS101",
    courseName: "Data Structures",
    department: "BCS",
    examType: "CAT1",
    examDate: "2026-09-29",
    startTime: "09:00",
    endTime: "11:00",
    session: "FN",
    venueName: "BCS Room 01",
    previousFacultyName: "Faizal",
    newFacultyName: "Prithiviraj",
    approvedAt: "2026-09-28T05:00:00.000Z",
  };
  const text = buildAdminNotifyText(data);
  assert.ok(text.includes("Dear Faculty Incharge"));
  assert.ok(text.includes("Requested By: Faizal"));
  assert.ok(text.includes("Approved By: Prithiviraj"));
  assert.ok(text.includes("24BCS101"));
  assert.ok(text.includes("Department: BCS"));
  assert.ok(text.includes("Exam Type: CAT1"));
  assert.ok(text.includes("Attendance Responsibility"));
  assert.ok(text.includes("Prithiviraj"));
  assert.ok(text.includes("APPROVED"));

  const html = buildAdminNotifyHtml(data);
  assert.ok(html.includes("Mutual Faculty Change Approved"));
  assert.ok(html.includes("Faizal"));
  assert.ok(html.includes("Prithiviraj"));
  assert.ok(html.includes("Hallora"));
  assert.ok(html.includes("Attendance Responsibility"));
}

function testAdjacentSessionsAllowed() {
  assert.strictEqual(
    examTimesOverlap("09:00", "11:00", "11:00", "13:00"),
    false,
    "adjacent 9–11 and 11–1 must not overlap"
  );
  assert.strictEqual(
    transferWindowsConflict("09:00", "11:00", "11:00", "13:00"),
    false
  );
  assert.strictEqual(
    transferWindowsConflict("09:00", "11:00", "10:00", "12:00"),
    true
  );
  assert.strictEqual(
    transferWindowsConflict("09:00", "11:00", null, "13:00"),
    true,
    "missing times cannot prove non-overlap"
  );
  console.log("✓ adjacent sessions allowed; overlapping windows blocked");
}

function testOverlapMessage() {
  const msg = buildTransferOverlapMessage({
    facultyName: "Faculty A",
    venueName: "SC316",
    examDate: "2026-10-22",
    examStartTime: "09:00",
    examEndTime: "11:00",
  });
  assert.ok(msg.includes("Transfer unavailable"));
  assert.ok(msg.includes("overlapping"));
  assert.ok(msg.includes("do not overlap"));
  console.log("✓ transfer overlap message");
}

function testTransferServiceUsesOverlapNotSameDay() {
  const root = path.resolve(__dirname, "../..");
  const svc = fs.readFileSync(
    path.join(root, "backend/services/facultyTransferService.js"),
    "utf8"
  );
  const faculty = fs.readFileSync(
    path.join(root, "backend/models/Faculty.js"),
    "utf8"
  );
  const allotment = fs.readFileSync(
    path.join(root, "src/pages/Allotment.jsx"),
    "utf8"
  );
  assert.ok(svc.includes("skipTimeConflict: true"));
  assert.ok(svc.includes("findTransferOverlapConflict"));
  assert.ok(svc.includes("FOR UPDATE"));
  assert.ok(svc.includes("status = 'Pending'"));
  assert.ok(!svc.includes("_applySwap"));
  assert.ok(faculty.includes("skipTimeConflict"));
  assert.ok(
    faculty.includes("if (examDate && !skipTimeConflict)"),
    "allocator same-day rule remains the default"
  );
  assert.ok(
    !allotment.toLowerCase().includes("faculty-transfers"),
    "Allotment page must not call transfer APIs"
  );
  console.log("✓ transfer overlap path; allocator same-day unchanged; Allotment untouched");
}

function testMutualRequestsUi() {
  const root = path.resolve(__dirname, "../..");
  const dash = fs.readFileSync(
    path.join(root, "src/pages/FacultyDashboard.jsx"),
    "utf8"
  );
  const modal = fs.readFileSync(
    path.join(root, "src/Components/TransferRequestModal.jsx"),
    "utf8"
  );
  assert.ok(dash.includes("Mutual Requests"));
  assert.ok(dash.includes("Accept"));
  assert.ok(dash.includes("Reject"));
  assert.ok(dash.includes("transferActionError"));
  assert.ok(modal.includes("Send Transfer Request"));
  assert.ok(modal.includes("not a swap"));
  console.log("✓ Mutual Requests UI: Accept/Reject + transfer-only copy");
}

function run() {
  testAdminSubject();
  testAdminBody();
  testAdjacentSessionsAllowed();
  testOverlapMessage();
  testTransferServiceUsesOverlapNotSameDay();
  testMutualRequestsUi();
  console.log("validateMutualFacultyTransfer: OK");
}

run();
