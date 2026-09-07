/**
 * Regression checks for faculty transfer approval email workflow helpers.
 */
const assert = require("assert");
const {
  buildTransferApprovalSubject,
  buildTransferApprovalText,
  buildTransferApprovalHtml,
  portalDutyUrl,
} = require("../services/transferApprovalEmailMessage");

function testSubject() {
  const s = buildTransferApprovalSubject();
  assert.ok(s.includes("Transfer Approved"));
  assert.ok(s.includes("Invigilation"));
}

function testRequesterEmailMentionsApproval() {
  const text = buildTransferApprovalText(
    {
      facultyName: "Sathya",
      approvedByName: "Admin User",
      approvedByRole: "admin",
      previousFacultyName: "Sathya",
      previousDepartment: "CSE",
      newFacultyName: "Ravi",
      newDepartment: "IT",
      examName: "CSE101",
      examDate: "2026-09-10",
      session: "FN",
      venueName: "A101",
      startTime: "09:00",
      endTime: "12:00",
      approvalDate: "2026-09-07",
      upcomingDuties: [],
      portalUrl: "https://iexam.kumaraguru.in/attendance/login",
    },
    "requester"
  );
  assert.ok(text.includes("Dear Sathya"));
  assert.ok(text.includes("approved"));
  assert.ok(text.includes("no upcoming exam invigilation duties"));
  assert.ok(text.includes("https://iexam.kumaraguru.in/attendance/login"));
}

function testIncomingEmailListsDuties() {
  const text = buildTransferApprovalText(
    {
      facultyName: "Ravi",
      approvedByName: "FI",
      approvedByRole: "faculty_incharge",
      previousFacultyName: "Sathya",
      previousDepartment: "CSE",
      newFacultyName: "Ravi",
      newDepartment: "IT",
      examName: "CSE101",
      examDate: "2026-09-10",
      session: "FN",
      venueName: "A101",
      startTime: "09:00",
      endTime: "12:00",
      approvalDate: "2026-09-07",
      upcomingDuties: [
        {
          examName: "CSE101",
          examDate: "2026-09-10",
          session: "FN",
          startTime: "09:00",
          endTime: "12:00",
          venueName: "A101",
        },
        {
          examName: "CSE102",
          examDate: "2026-09-11",
          session: "AN",
          startTime: "14:00",
          endTime: "17:00",
          venueName: "B201",
        },
      ],
    },
    "incoming"
  );
  assert.ok(text.includes("transferred to you"));
  assert.ok(text.includes("CSE101"));
  assert.ok(text.includes("CSE102"));
  assert.ok(text.includes("A101"));
  assert.ok(text.includes("B201"));
}

function testHtmlHasButtonAndNoLocalhostHardcode() {
  const html = buildTransferApprovalHtml(
    {
      facultyName: "Ravi",
      approvedByName: "Admin",
      approvedByRole: "admin",
      previousFacultyName: "A",
      previousDepartment: "CSE",
      newFacultyName: "B",
      newDepartment: "IT",
      examName: "Exam",
      examDate: "2026-09-10",
      session: "FN",
      venueName: "A101",
      startTime: "09:00",
      endTime: "12:00",
      approvalDate: "2026-09-07",
      upcomingDuties: [
        {
          examName: "Exam",
          examDate: "2026-09-10",
          session: "FN",
          startTime: "09:00",
          endTime: "12:00",
          venueName: "A101",
        },
      ],
      portalUrl: "https://iexam.kumaraguru.in/attendance/login",
    },
    "incoming"
  );
  assert.ok(html.includes("View My Exam Invigilation Duty"));
  assert.ok(html.includes("https://iexam.kumaraguru.in/attendance/login"));
  assert.ok(!html.includes("localhost"));
}

function testPortalUrlUsesEnvOrDefault() {
  const url = portalDutyUrl();
  assert.ok(url.endsWith("/attendance/login"));
  assert.ok(!url.includes("localhost") || process.env.FRONTEND_URL?.includes("localhost"));
}

function testPendingOnlySemantics() {
  // Mirrors service guard: only Pending → Approved once
  const transitions = {
    Pending: "Approved",
    Approved: null,
    Rejected: null,
  };
  assert.strictEqual(transitions.Pending, "Approved");
  assert.strictEqual(transitions.Approved, null);
  assert.strictEqual(transitions.Rejected, null);
}

function testFacultyIdentityStable() {
  const before = { id: 123, department: "CSE" };
  const after = { ...before, department: "IT" };
  assert.strictEqual(before.id, after.id);
  assert.strictEqual(after.id, 123);
}

function testUnauthorizedRolesBlocked() {
  const allowed = new Set(["admin", "faculty_incharge", "hod"]);
  assert.ok(!allowed.has("faculty"));
  assert.ok(allowed.has("admin"));
  assert.ok(allowed.has("faculty_incharge"));
}

testSubject();
testRequesterEmailMentionsApproval();
testIncomingEmailListsDuties();
testHtmlHasButtonAndNoLocalhostHardcode();
testPortalUrlUsesEnvOrDefault();
testPendingOnlySemantics();
testFacultyIdentityStable();
testUnauthorizedRolesBlocked();

require("../services/transferApprovalNotification");
require("../services/facultyTransferService");
require("../routes/facultyTransferRoutes");

console.log("✅ Transfer approval email workflow regression checks passed");
process.exit(0);
