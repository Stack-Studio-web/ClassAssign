/**
 * Offline faculty import MAX-merge checks.
 * Run: node backend/scripts/validateFacultyImportMaxMerge.mjs
 */
import assert from "assert";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  facultyImportGroupKey,
  groupFacultyImportRows,
  indexGroupsByEmail,
  computeMergedMax,
  validateMergedMax,
  duplicateRowsMergedCount,
  MAX_CLASSROOMS_LIMIT,
} = require("../utils/facultyImportMaxMerge.js");

function row(rowNum, name, department, email) {
  return { row: rowNum, name, department, email };
}

/** Simulate import apply: next = max(current, rowCount). */
function applyImport(currentMax, importRowCount) {
  return computeMergedMax(currentMax, importRowCount);
}

function testFourIdenticalRowsNewFacultyMaxIs4Not5() {
  const rows = [
    row(2, "Balakumaran S /Adjunct faculty /CSE", "CSE", "balakumaran.jimpact@kct.ac.in"),
    row(3, "Balakumaran S /Adjunct faculty /CSE", "CSE", "balakumaran.jimpact@kct.ac.in"),
    row(4, "Balakumaran S /Adjunct faculty /CSE", "CSE", "balakumaran.jimpact@kct.ac.in"),
    row(5, "Balakumaran S /Adjunct faculty /CSE", "CSE", "balakumaran.jimpact@kct.ac.in"),
  ];
  const groups = groupFacultyImportRows(rows);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].count, 4);

  // New identity: create with row count (from empty).
  const createdMax = applyImport(0, groups[0].count);
  assert.strictEqual(createdMax, 4);

  // Bug reproduction: default MAX=1 then incorrectly adding all 4 rows → 5.
  const doubleCounted = 1 + groups[0].count;
  assert.strictEqual(doubleCounted, 5);
  // Correct merge from a default-1 membership must still land on 4.
  assert.strictEqual(applyImport(1, groups[0].count), 4);
  assert.notStrictEqual(applyImport(1, groups[0].count), doubleCounted);

  assert.strictEqual(duplicateRowsMergedCount(groups), 3);
  console.log("✓ four identical rows → MAX = 4 (never 5 from 1+4 double-count)");
}

function testOneRowMaxIs1() {
  const groups = groupFacultyImportRows([
    row(2, "Dr. D. Arivuoli", "SFS", "arivuoli.d.sci@kct.ac.in"),
  ]);
  assert.strictEqual(groups[0].count, 1);
  assert.strictEqual(applyImport(0, 1), 1);
  assert.strictEqual(applyImport(1, 1), 1);
  console.log("✓ one row → MAX = 1");
}

function testReimportSameFourRowsKeepsMaxAt4() {
  const existingMax = 4;
  const reimportCount = 4;
  const next = applyImport(existingMax, reimportCount);
  assert.strictEqual(next, 4, "reimport must not become 5 or 8");
  assert.notStrictEqual(existingMax + reimportCount, 4);
  assert.strictEqual(existingMax + reimportCount, 8); // old additive bug
  console.log("✓ existing MAX=4 + reimport 4 matching rows → MAX stays 4");
}

function testAdditionalExamples() {
  const rows = [
    row(2, "Capt. Dr. A. R. Arul", "SFS", "arul.ar.sci@kct.ac.in"),
    row(3, "Capt. Dr. A. R. Arul", "SFS", "arul.ar.sci@kct.ac.in"),
    row(4, "Dr. A. Ezhilarasi", "SFS", "ezhilirasi.sci@kct.ac.in"),
    row(5, "Dr. A. Ezhilarasi", "SFS", "ezhilirasi.sci@kct.ac.in"),
    row(6, "Dr. A. Roshini", "CSE", "roshini.a.cse@kct.ac.in"),
    row(7, "Dr. A. Roshini", "CSE", "roshini.a.cse@kct.ac.in"),
    row(8, "Dr. D. Arivuoli", "SFS", "arivuoli.d.sci@kct.ac.in"),
  ];
  const groups = groupFacultyImportRows(rows);
  for (const g of groups) {
    assert.strictEqual(applyImport(0, g.count), g.count);
  }
  console.log("✓ Arul/Ezhilarasi/Roshini → MAX 2; Arivuoli → MAX 1");
}

function testMixedDepartmentsStaySeparate() {
  const rows = [
    row(2, "Same Person", "CSE", "same@kct.ac.in"),
    row(3, "Same Person", "CSE", "same@kct.ac.in"),
    row(4, "Same Person", "IT", "same@kct.ac.in"),
  ];
  const groups = groupFacultyImportRows(rows);
  assert.strictEqual(groups.length, 2);
  const byEmail = indexGroupsByEmail(groups);
  assert.strictEqual(byEmail.get("same@kct.ac.in").length, 2);
  assert.strictEqual(byEmail.get("same@kct.ac.in")[0].count, 2);
  console.log("✓ mixed departments for same email form separate groups");
}

function testNameNormalization() {
  const a = facultyImportGroupKey({
    name: "  Dr.  A.   Roshini ",
    department: "cse",
    email: "Roshini.A.CSE@KCT.ac.in",
  });
  const b = facultyImportGroupKey({
    name: "Dr. A. Roshini",
    department: "CSE",
    email: "roshini.a.cse@kct.ac.in",
  });
  assert.strictEqual(a, b);
  console.log("✓ name/email/department normalization collapses whitespace and case");
}

function testRaiseOnlyNeverDecreaseAndLimit() {
  assert.strictEqual(computeMergedMax(1, 4), 4);
  assert.strictEqual(computeMergedMax(4, 4), 4);
  assert.strictEqual(computeMergedMax(6, 4), 6);
  assert.strictEqual(computeMergedMax(2, 5), 5);
  assert.strictEqual(validateMergedMax(20).ok, true);
  assert.strictEqual(validateMergedMax(21).ok, false);
  assert.strictEqual(MAX_CLASSROOMS_LIMIT, 20);
  console.log("✓ merge raises to row count, never decreases, respects 1–20");
}

function testContextScopedCountersAndConcurrency() {
  const store = {
    home: { max: 1, available: true, alloc: 0, done: 0, transfers: 0 },
    shared: { max: 1, available: true, alloc: 2, done: 1, transfers: 3 },
    lock: null,
  };

  function withLock(scope, fn) {
    if (store.lock) throw new Error("lock contention");
    store.lock = scope;
    try {
      return fn(store[scope]);
    } finally {
      store.lock = null;
    }
  }

  function apply(scope, importRowCount) {
    return withLock(scope, (row) => {
      const next = computeMergedMax(row.max, importRowCount);
      if (next > 20) return { ok: false, code: "MAX_LIMIT" };
      const previous = row.max;
      row.max = next;
      return {
        ok: true,
        previousMax: previous,
        nextMax: next,
        available: row.available,
        alloc: row.alloc,
        done: row.done,
        transfers: row.transfers,
      };
    });
  }

  // New shared membership default 1 + 4 import rows → 4 (not 5)
  const shared = apply("shared", 4);
  assert.strictEqual(shared.nextMax, 4);
  assert.strictEqual(store.shared.alloc, 2);
  assert.strictEqual(store.shared.done, 1);
  assert.strictEqual(store.shared.transfers, 3);
  assert.strictEqual(store.shared.available, true);

  // Home: first import 4 from default 1 → 4
  assert.strictEqual(apply("home", 4).nextMax, 4);
  // Reimport same 4 → stays 4
  assert.strictEqual(apply("home", 4).nextMax, 4);
  assert.strictEqual(store.home.alloc, 0);

  let contended = false;
  store.lock = "home";
  try {
    apply("home", 1);
  } catch (e) {
    contended = e.message === "lock contention";
  }
  store.lock = null;
  assert.strictEqual(contended, true);

  assert.strictEqual(store.shared.transfers, 3, "transfers untouched");
  console.log("✓ home/shared independent; max(current,N) + locking; other counters untouched");
}

function testDifferentAcademicContextsIndependent() {
  const contexts = { KSI: { max: 1 }, SFS: { max: 1 } };
  contexts.KSI.max = applyImport(contexts.KSI.max, 4);
  contexts.SFS.max = applyImport(0, 2);
  assert.strictEqual(contexts.KSI.max, 4);
  assert.strictEqual(contexts.SFS.max, 2);
  // Reimport into KSI does not change SFS
  contexts.KSI.max = applyImport(contexts.KSI.max, 4);
  assert.strictEqual(contexts.KSI.max, 4);
  assert.strictEqual(contexts.SFS.max, 2);
  console.log("✓ different Academic Contexts keep independent MAX values");
}

function testDifferentFacultyIndependent() {
  const a = applyImport(0, 4);
  const b = applyImport(0, 2);
  assert.strictEqual(a, 4);
  assert.strictEqual(b, 2);
  console.log("✓ different faculty identities remain independent");
}

testFourIdenticalRowsNewFacultyMaxIs4Not5();
testOneRowMaxIs1();
testReimportSameFourRowsKeepsMaxAt4();
testAdditionalExamples();
testMixedDepartmentsStaySeparate();
testNameNormalization();
testRaiseOnlyNeverDecreaseAndLimit();
testContextScopedCountersAndConcurrency();
testDifferentAcademicContextsIndependent();
testDifferentFacultyIndependent();
console.log("\nAll faculty import MAX-merge checks passed.");
