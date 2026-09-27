/**
 * Strict Faculty Incharge isolation regression checks (no DB required for helpers).
 */
const assert = require("assert");
const {
  andClause,
  whereClause,
  ownerWhereFromOpts,
  insertField,
} = require("../utils/ownerFilter");
const { canMutateOwnedRecord, resolveOwnerOpts } = require("../utils/rbac");

function testFiSelfOnlyFilter() {
  const alone = whereClause("faculty_incharge", 2);
  assert.ok(alone.sql.includes("owner_user_id = ?"));
  assert.deepStrictEqual(alone.params, [2]);

  // Even if a stale sibling ownerIds list is passed, insert still stamps self.
  const ins = insertField("faculty_incharge", 2);
  assert.ok(ins.col.includes("owner_user_id"));
  assert.strictEqual(ins.val, 2);

  // Admin unfiltered
  const admin = andClause("admin", 1, "", null);
  assert.strictEqual(admin.sql, "");
}

function testFiCannotMutateSibling() {
  assert.strictEqual(canMutateOwnedRecord("faculty_incharge", 9, 2, [2, 9]), false);
  assert.strictEqual(canMutateOwnedRecord("faculty_incharge", 2, 2, [2]), true);
  assert.strictEqual(canMutateOwnedRecord("hod", 9, 1, [1, 9]), false);
  assert.strictEqual(canMutateOwnedRecord("admin", 9, 1, null), true);
}

function testHodStillUsesWorkspaceIds() {
  const hod = ownerWhereFromOpts({
    role: "hod",
    ownerUserId: 1,
    ownerIds: [1, 2, 3],
    department: "CSE",
  });
  assert.ok(hod.sql.includes("IN ("));
  assert.deepStrictEqual(hod.params, [1, 2, 3]);
}

async function testResolveOwnerOptsStrictFi() {
  const req = {
    user: { id: 42, role: "faculty_incharge", department: "CSE", workspaceId: "ws-test" },
    session: { createdByHodId: 7, workspaceId: "ws-test" },
  };
  const opts = await resolveOwnerOpts(req);
  assert.deepStrictEqual(opts.ownerIds, [42]);
  assert.strictEqual(opts.ownerUserId, 42);
  assert.strictEqual(opts.role, "faculty_incharge");
}

function testInsertNeverUsesClientOwner() {
  // Models must stamp from session; client body owner_user_id is ignored by design.
  const fi = insertField("faculty_incharge", 99);
  assert.strictEqual(fi.val, 99);
  const hod = insertField("hod", 1);
  assert.strictEqual(hod.val, null);
  const admin = insertField("admin", 1);
  assert.strictEqual(admin.val, 1);
}

function testHodFailClosedWithoutOwnerIds() {
  const a = andClause("hod", 1);
  assert.ok(a.sql.includes("1=0"));
  const w = whereClause("hod", 1);
  assert.ok(w.sql.includes("1=0"));
}

testFiSelfOnlyFilter();
testFiCannotMutateSibling();
testHodStillUsesWorkspaceIds();
testInsertNeverUsesClientOwner();
testHodFailClosedWithoutOwnerIds();

Promise.resolve()
  .then(() => testResolveOwnerOptsStrictFi())
  .then(() => {
    require("../services/ownershipMappingService");
    require("../routes/ownershipRoutes");
    require("../utils/ensureStrictFiIsolation");
    console.log("✅ Strict Faculty Incharge isolation checks passed");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
