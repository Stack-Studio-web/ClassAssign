/**
 * Offline checks for cross-department faculty sharing helpers (no database).
 * Run: node backend/scripts/validateFacultyMembershipUnit.js
 */
const assert = require("assert");
const {
  bucketKey,
  indexBuckets,
  scopedCounters,
  membershipLabels,
  attributionUserIdFromOpts,
  normalizeName,
} = require("../utils/facultyMembership");
const {
  buildTimeConflictMessage,
  conflictViewerFromOpts,
  presentConflictForViewer,
} = require("../utils/facultyTimeConflict");
const Faculty = require("../models/Faculty");

function testScopedCountersKeepSemantics() {
  const c = scopedCounters(
    { maxClassrooms: 5, transferCount: 2, isAvailable: true },
    { total: 5, allocation: 3, completed: 2, attendanceCompleted: 2, reportCompleted: 2 }
  );
  assert.strictEqual(c.max_classrooms, 5);
  assert.strictEqual(c.allocation, 3);
  assert.strictEqual(c.completed, 2);
  assert.strictEqual(c.remaining, 2, "Rem = Max − Alloc (Done does not reduce Rem)");
  assert.strictEqual(c.transfer_count, 2);
  const empty = scopedCounters({ maxClassrooms: 4 }, null);
  assert.deepStrictEqual(
    [empty.max_classrooms, empty.allocation, empty.completed, empty.remaining],
    [4, 0, 0, 4]
  );
  console.log("✓ scoped counters keep Max/Alloc/Done/Rem semantics");
}

function testBucketsAndMergeAreDepartmentScoped() {
  const buckets = [
    { facultyId: 7, membershipId: null, total: 5, allocation: 3, completed: 2, attendanceCompleted: 2, reportCompleted: 2 },
    { facultyId: 7, membershipId: 91, total: 2, allocation: 1, completed: 1, attendanceCompleted: 1, reportCompleted: 1 },
  ];
  const idx = indexBuckets(buckets);
  assert.strictEqual(idx.get(7).get(bucketKey(null)).allocation, 3);
  assert.strictEqual(idx.get(7).get(bucketKey(91)).allocation, 1);

  const base = {
    id: 7, public_uuid: "u-7", name: "Arun Kumar", email: "arun@kct.ac.in", department: "CSE",
    max_classrooms: 5, is_available: true, transfer_count: 0,
    home_department: "CSE", shared_departments: ["IT"],
  };
  const [cse] = Faculty._mergeScopedRows([{ ...base, is_home: true }], buckets);
  const [it] = Faculty._mergeScopedRows(
    [{ ...base, is_home: false, shared_membership_id: 91, shared_max: 4, shared_available: true, shared_transfer_count: 1, shared_department: "IT" }],
    buckets
  );
  assert.deepStrictEqual(
    [cse.maxClassrooms, cse.allocation, cse.completed, cse.remaining, cse.membershipType],
    [5, 3, 2, 2, "home"]
  );
  assert.deepStrictEqual(
    [it.maxClassrooms, it.allocation, it.completed, it.remaining, it.transferCount, it.membershipType],
    [4, 1, 1, 3, 1, "shared"]
  );
  assert.deepStrictEqual(cse.departments, ["CSE", "IT"]);
  assert.deepStrictEqual(it.departments, ["CSE", "IT"]);
  assert.strictEqual(cse.uuid, it.uuid, "same identity in both departments");
  assert.strictEqual(it.canEditIdentity, false);
  console.log("✓ per-department buckets merge into one row per identity");
}

function testMembershipLabels() {
  assert.deepStrictEqual(membershipLabels("cse", ["IT", "AIDS", "it"]), ["CSE", "AIDS", "IT"]);
  assert.deepStrictEqual(membershipLabels(null, ["IT"]), ["IT"]);
  assert.deepStrictEqual(membershipLabels("MECH", []), ["MECH"]);
  console.log("✓ department membership labels");
}

function testAttributionMirrorsInsertField() {
  assert.strictEqual(attributionUserIdFromOpts({ role: "faculty_incharge", ownerUserId: 12 }), 12);
  assert.strictEqual(attributionUserIdFromOpts({ role: "admin", ownerUserId: 1 }), 1);
  assert.strictEqual(attributionUserIdFromOpts({ role: "hod", ownerUserId: 3 }), null);
  assert.strictEqual(attributionUserIdFromOpts({}), null);
  console.log("✓ attribution user mirrors seating_plans owner stamping");
}

function testConflictMessageAndVisibility() {
  const conflict = {
    facultyName: "Arun Kumar",
    venueName: "AD207",
    examDate: "2026-10-24",
    examStartTime: "09:00",
    examEndTime: "11:00",
    ownerUserId: 10,
    assignedDepartment: "CSE",
  };
  conflict.message = buildTimeConflictMessage(conflict);
  assert.strictEqual(
    conflict.message,
    "Arun Kumar is already assigned by CSE to an exam on 24/10/2026 at AD207 (9:00 AM–11:00 AM). Please select another faculty member."
  );

  const cseViewer = conflictViewerFromOpts({ role: "faculty_incharge", ownerIds: [10, 11] });
  assert.strictEqual(presentConflictForViewer(conflict, cseViewer), conflict);

  const itViewer = conflictViewerFromOpts({ role: "faculty_incharge", ownerIds: [20] });
  const shown = presentConflictForViewer(conflict, itViewer);
  assert.strictEqual(shown.venueName, null);
  assert.strictEqual(shown.crossDepartment, true);
  assert.ok(!shown.message.includes("AD207"));
  assert.ok(shown.message.includes("by CSE") && shown.message.includes("24/10/2026"));
  assert.ok(shown.message.includes("9:00 AM–11:00 AM"));

  const admin = conflictViewerFromOpts({ role: "admin" });
  assert.ok(presentConflictForViewer(conflict, admin).message.includes("AD207"));
  console.log("✓ conflict message from stored fields; other departments' venue hidden");
}

function testNameNormalization() {
  assert.strictEqual(normalizeName("  Arun   KUMAR "), normalizeName("arun kumar"));
  assert.notStrictEqual(normalizeName("Dr. Arun"), normalizeName("Arun"));
  console.log("✓ name comparison for detail-mismatch detection");
}

testScopedCountersKeepSemantics();
testBucketsAndMergeAreDepartmentScoped();
testMembershipLabels();
testAttributionMirrorsInsertField();
testConflictMessageAndVisibility();
testNameNormalization();
console.log("\nAll offline faculty membership checks passed.");
process.exit(0);
