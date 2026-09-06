/**
 * Regression checks for faculty deactivate/reactivate identity + HOD workspace helpers.
 * No DB required for pure identity selection; loads modules for syntax.
 */
const assert = require("assert");
const {
  normalizeFacultyEmail,
  pickCanonicalFaculty,
  pickFacultyForLogin,
} = require("../utils/facultyIdentity");
const { ownerInAnd, whereClause } = require("../utils/ownerFilter");
const { canMutateOwnedRecord } = require("../utils/rbac");

function testNormalize() {
  assert.strictEqual(normalizeFacultyEmail("  Sathyavathi@KCT.ac.in "), "sathyavathi@kct.ac.in");
}

function testExistingFacultyLoginPicksHistoryRichActive() {
  // Test 1 — Existing faculty with allotment preferred when duplicates exist
  const chosen = pickFacultyForLogin([
    { id: 200, email: "a@kct.ac.in", is_active: true, assign_count: 0, seating_count: 0 },
    { id: 123, email: "a@kct.ac.in", is_active: true, assign_count: 5, seating_count: 3 },
  ]);
  assert.strictEqual(chosen.id, 123, "should prefer active faculty with allotments");
}

function testDeactivatedFallsBackWhenNoActive() {
  // Test 2 — Only deactivated rows: history-rich id still resolvable (login gated elsewhere)
  const chosen = pickFacultyForLogin([
    { id: 123, email: "a@kct.ac.in", is_active: false, assign_count: 9, seating_count: 9 },
  ]);
  assert.strictEqual(chosen.id, 123);
  assert.strictEqual(chosen.is_active, false);
}

function testReactivateCanonicalKeepsHistoryId() {
  // Test 3 — Reactivation should target the history-rich row when choosing among inactive
  const chosen = pickCanonicalFaculty([
    { id: 200, email: "a@kct.ac.in", is_active: false, assign_count: 0, seating_count: 0 },
    { id: 123, email: "a@kct.ac.in", is_active: false, assign_count: 4, seating_count: 2 },
  ]);
  assert.strictEqual(chosen.id, 123, "reactivation canonical must be original allotment owner");
}

function testNoDuplicatePreferenceStableId() {
  // Test 4 — Same email always resolves to one stable id (oldest if tied)
  const a = pickCanonicalFaculty([
    { id: 10, is_active: true, assign_count: 1, seating_count: 0 },
    { id: 20, is_active: true, assign_count: 1, seating_count: 0 },
  ]);
  assert.strictEqual(a.id, 10);
}

function testHodSharedOwnerIdsStillWork() {
  // Test 5 — HOD shared owner IN-list unchanged
  const clause = whereClause("faculty_incharge", 2, "", [1, 2, 3]);
  assert.ok(clause.sql.includes("IN ("));
  assert.deepStrictEqual(clause.params, [1, 2, 3]);
  const inAnd = ownerInAnd([1, 2], "");
  assert.deepStrictEqual(inAnd.params, [1, 2]);
  assert.strictEqual(canMutateOwnedRecord("faculty_incharge", 3, 2, [1, 2, 3]), true);
}

function testAllotmentHistoryNotDiscardedByPicker() {
  // Test 6 — History-rich inactive still selectable for reconciliation/canonical
  const chosen = pickCanonicalFaculty([
    { id: 123, is_active: false, assign_count: 7, seating_count: 2 },
    { id: 999, is_active: false, assign_count: 0, seating_count: 0 },
  ]);
  assert.strictEqual(chosen.id, 123);
  assert.strictEqual(chosen.assign_count, 7);
}

testNormalize();
testExistingFacultyLoginPicksHistoryRichActive();
testDeactivatedFallsBackWhenNoActive();
testReactivateCanonicalKeepsHistoryId();
testNoDuplicatePreferenceStableId();
testHodSharedOwnerIdsStillWork();
testAllotmentHistoryNotDiscardedByPicker();

require("../utils/ensureFacultyEmailIdentity");
require("../models/Faculty");
require("../services/attendanceService");
require("../services/facultyTransferService");
require("../routes/facultyRoutes");
require("../routes/import");

console.log("✅ Faculty reactivation identity regression checks passed");
process.exit(0);
