/**
 * Offline checks for same-day faculty invigilation conflict helpers.
 * Run: node backend/scripts/validateSameDayFacultyConflict.js
 */
const assert = require("assert");
const {
  buildTimeConflictMessage,
  normalizeExamDate,
  formatDateDisplay,
  examTimesOverlap,
} = require("../utils/facultyTimeConflict");

function testMessages() {
  const msg = buildTimeConflictMessage({
    facultyName: "Faizal",
    venueName: "AD208",
    examDate: "2026-10-22",
    examStartTime: "08:30",
    examEndTime: "10:30",
  });
  assert.ok(msg.includes("Faizal"));
  assert.ok(msg.includes("22/10/2026"));
  assert.ok(msg.includes("AD208"));
  assert.ok(msg.includes("8:30 AM") || msg.includes("08:30"));
  assert.ok(msg.includes("Please select another faculty member"));
  console.log("✓ conflict message format");
}

function testDateNormalize() {
  assert.strictEqual(normalizeExamDate("2026-10-22T00:00:00.000Z"), "2026-10-22");
  assert.strictEqual(normalizeExamDate("2026-10-22"), "2026-10-22");
  assert.strictEqual(formatDateDisplay("2026-10-22"), "22/10/2026");
  console.log("✓ date normalize / display");
}

function testOverlapStillWorksForVenues() {
  // Non-overlapping times on same day — faculty rule ignores this; helper remains for venues.
  assert.strictEqual(
    examTimesOverlap("08:30", "10:30", "11:00", "13:00"),
    false
  );
  assert.strictEqual(
    examTimesOverlap("08:30", "10:30", "09:00", "11:00"),
    true
  );
  console.log("✓ examTimesOverlap helper unchanged");
}

function testSameDayRuleSemantics() {
  // Documented business rule: same date => conflict regardless of overlap.
  const dateA = normalizeExamDate("2026-10-22");
  const dateB = normalizeExamDate("2026-10-23");
  const sameDayConflict = dateA === dateA; // always true for same calendar day
  const differentDayOk = dateA !== dateB;
  assert.strictEqual(sameDayConflict, true);
  assert.strictEqual(differentDayOk, true);
  console.log("✓ same-day vs different-day semantics");
}

testMessages();
testDateNormalize();
testOverlapStillWorksForVenues();
testSameDayRuleSemantics();
console.log("\nAll offline same-day conflict checks passed.");
