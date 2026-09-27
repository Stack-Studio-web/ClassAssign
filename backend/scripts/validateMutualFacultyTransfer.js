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
  assert.ok(s.includes("Mutual Faculty Change Approved"));
  assert.ok(s.includes("24BCS101"));
  assert.ok(s.includes("2026-09-29"));
}

function testAdminBody() {
  const data = {
    requestedByName: "Faizal",
    approvedByName: "Prithiviraj",
    courseCode: "24BCS101",
    courseName: "Data Structures",
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
  assert.ok(text.includes("Dear Admin / Faculty Incharge"));
  assert.ok(text.includes("Requested By : Faizal"));
  assert.ok(text.includes("Approved By  : Prithiviraj"));
  assert.ok(text.includes("24BCS101"));
  assert.ok(text.includes("attendance responsibility"));
  assert.ok(text.includes("Prithiviraj"));
  assert.ok(text.includes("APPROVED"));

  const html = buildAdminNotifyHtml(data);
  assert.ok(html.includes("Mutual Faculty Change Approved"));
  assert.ok(html.includes("Faizal"));
  assert.ok(html.includes("Prithiviraj"));
  assert.ok(html.includes("Hallora"));
}

function testServiceExportsMutualApis() {
  const svc = require("../services/facultyTransferService");
  assert.equal(typeof svc.approveRequest, "function");
  assert.equal(typeof svc.rejectRequest, "function");
  assert.equal(typeof svc.cancelRequest, "function");
  assert.equal(typeof svc.listEligibleFacultyForAssignment, "function");
  assert.equal(typeof svc.createRequest, "function");
  assert.equal(typeof svc.listRequests, "function");
}

function testRouteStackLoads() {
  require("../routes/facultyTransferRoutes");
}

testAdminSubject();
testAdminBody();
testServiceExportsMutualApis();
testRouteStackLoads();

console.log("✅ Mutual faculty transfer regression checks passed");
process.exit(0);
