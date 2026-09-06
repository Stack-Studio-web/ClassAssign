/**
 * Offline validation for shared HOD workspace helpers (no DB).
 */
const assert = require("assert");
const {
  andClause,
  whereClause,
  ownerInAnd,
  ownerInWhere,
  studentScopeWhere,
  batchScopeAnd,
  ownerWhereFromOpts,
  ownerAndFromOpts,
} = require("../utils/ownerFilter");
const { canMutateOwnedRecord } = require("../utils/rbac");

function testOwnerIn() {
  const a = ownerInAnd([10, 20, 10], "");
  assert.ok(a.sql.includes("IN ("));
  assert.deepStrictEqual(a.params, [10, 20]);

  const w = ownerInWhere([5], "st.");
  assert.ok(w.sql.startsWith(" WHERE"));
  assert.ok(w.sql.includes("st.owner_user_id"));
}

function testSharedReadFilter() {
  const fi = whereClause("faculty_incharge", 2, "", [1, 2, 3]);
  assert.ok(fi.sql.includes("IN ("));
  assert.deepStrictEqual(fi.params, [1, 2, 3]);

  const alone = whereClause("faculty_incharge", 2);
  assert.ok(alone.sql.includes("="));
  assert.deepStrictEqual(alone.params, [2]);

  const hod = ownerWhereFromOpts({
    role: "hod",
    ownerUserId: 1,
    ownerIds: [1, 2, 3],
    department: "CSE",
  });
  assert.ok(hod.sql.includes("IN ("));
  assert.deepStrictEqual(hod.params, [1, 2, 3]);

  const hodDeptFallback = ownerWhereFromOpts({
    role: "hod",
    ownerUserId: 1,
    department: "CSE",
  });
  assert.ok(hodDeptFallback.sql.includes("department"));
  assert.deepStrictEqual(hodDeptFallback.params, ["CSE"]);
}

function testStudentBatchScope() {
  const st = studentScopeWhere("faculty_incharge", 2, "CSE", "st.", [2, 9]);
  assert.ok(st.sql.includes("IN ("));
  assert.deepStrictEqual(st.params, [2, 9]);

  const bat = batchScopeAnd("hod", 1, "CSE", "b.", [1, 2]);
  assert.ok(bat.sql.includes("IN ("));
  assert.deepStrictEqual(bat.params, [1, 2]);
}

function testMutateWithinWorkspace() {
  assert.strictEqual(canMutateOwnedRecord("faculty_incharge", 9, 2, [2, 9]), true);
  assert.strictEqual(canMutateOwnedRecord("faculty_incharge", 9, 2, [2, 3]), false);
  assert.strictEqual(canMutateOwnedRecord("hod", 9, 1, [1, 9]), false);
  assert.strictEqual(canMutateOwnedRecord("admin", 9, 1, null), true);
}

function testAdminUnfiltered() {
  const a = andClause("admin", 1, "", null);
  assert.strictEqual(a.sql, "");
  assert.deepStrictEqual(a.params, []);
}

testOwnerIn();
testSharedReadFilter();
testStudentBatchScope();
testMutateWithinWorkspace();
testAdminUnfiltered();

// Load modules that were patched for syntax errors
require("../models/Faculty");
require("../models/Timetable");
require("../models/Student");
require("../models/Batch");
require("../models/SeatingPlan");
require("../models/venue");
require("../models/IneligibleStudent");
require("../models/Mentor");
require("../utils/ensureHodWorkspaceScope");
require("../routes/facultyRoutes");
require("../routes/seatingRoutes");
require("../routes/timetableRoutes");
require("../routes/venueRoutes");
require("../routes/studentRoutes");
require("../routes/academicRoutes");
require("../routes/ineligibilityRoutes");
require("../routes/microsoftAuthRoutes");
require("../routes/authRoutes");

console.log("✅ Shared HOD workspace helper + module load validation passed");
process.exit(0);
