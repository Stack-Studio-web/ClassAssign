/**
 * Regression checks for mutual faculty change workflow helpers.
 */
const assert = require("assert");
const {
  buildAdminNotifySubject,
  buildAdminNotifyText,
  buildAdminNotifyHtml,
} = require("../services/mutualTransferAdminNotify");

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

function run() {
  testAdminSubject();
  testAdminBody();
  console.log("validateMutualFacultyTransfer: OK");
}

run();
