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

function testBalakumaranFourRows() {
  const rows = [
    row(2, "Balakumaran S /Adjunct faculty /CSE", "CSE", "balakumaran.jimpact@kct.ac.in"),
    row(3, "Balakumaran S /Adjunct faculty /CSE", "CSE", "balakumaran.jimpact@kct.ac.in"),
    row(4, "Balakumaran S /Adjunct faculty /CSE", "CSE", "balakumaran.jimpact@kct.ac.in"),
    row(5, "Balakumaran S /Adjunct faculty /CSE", "CSE", "balakumaran.jimpact@kct.ac.in"),
  ];
  const groups = groupFacultyImportRows(rows);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].count, 4);
  assert.strictEqual(groups[0].email, "balakumaran.jimpact@kct.ac.in");
  assert.strictEqual(validateMergedMax(groups[0].count).ok, true);
  assert.strictEqual(duplicateRowsMergedCount(groups), 3);
  console.log("✓ four identical Balakumaran rows → one group, MAX init 4, 3 duplicates merged");
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
  const byEmail = Object.fromEntries(groups.map((g) => [g.email, g.count]));
  assert.strictEqual(byEmail["arul.ar.sci@kct.ac.in"], 2);
  assert.strictEqual(byEmail["ezhilirasi.sci@kct.ac.in"], 2);
  assert.strictEqual(byEmail["roshini.a.cse@kct.ac.in"], 2);
  assert.strictEqual(byEmail["arivuoli.d.sci@kct.ac.in"], 1);
  assert.strictEqual(groups.length, 4);
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
  // Import keeps first group only for one identity per email in a context.
  assert.strictEqual(byEmail.get("same@kct.ac.in")[0].department, "CSE");
  assert.strictEqual(byEmail.get("same@kct.ac.in")[0].count, 2);
  console.log("✓ mixed departments for same email form separate groups (second rejected at import)");
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

function testExistingIncrementAndLimit() {
  assert.strictEqual(computeMergedMax(1, 4), 5);
  assert.strictEqual(computeMergedMax(2, 2), 4);
  assert.strictEqual(computeMergedMax(0, 1), 1);
  assert.strictEqual(validateMergedMax(20).ok, true);
  assert.strictEqual(validateMergedMax(21).ok, false);
  assert.strictEqual(validateMergedMax(0).ok, false);
  assert.match(validateMergedMax(21).message, /1–20/);
  assert.strictEqual(MAX_CLASSROOMS_LIMIT, 20);

  // Repeated import: existing MAX 2 + two matching rows → 4
  const next = computeMergedMax(2, 2);
  assert.strictEqual(next, 4);
  assert.strictEqual(validateMergedMax(next).ok, true);
  console.log("✓ existing MAX increments; values above 20 rejected");
}

/**
 * Simulate context-scoped counters (home vs shared) and concurrent increments
 * with exclusive locking semantics.
 */
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

  function increment(scope, delta) {
    return withLock(scope, (row) => {
      const next = row.max + delta;
      if (next > 20) return { ok: false, code: "MAX_LIMIT" };
      row.max = next;
      return { ok: true, nextMax: next, available: row.available, alloc: row.alloc, done: row.done, transfers: row.transfers };
    });
  }

  // New shared membership initialized to 4 (absolute), other counters untouched
  withLock("shared", (row) => {
    row.max = 4;
  });
  assert.strictEqual(store.shared.max, 4);
  assert.strictEqual(store.shared.alloc, 2);
  assert.strictEqual(store.shared.done, 1);
  assert.strictEqual(store.shared.transfers, 3);
  assert.strictEqual(store.shared.available, true);

  // Home existing: +2 from repeated import
  const homeBump = increment("home", 2);
  assert.strictEqual(homeBump.ok, true);
  assert.strictEqual(store.home.max, 3);
  assert.strictEqual(store.home.alloc, 0);
  assert.strictEqual(store.home.available, true);

  // Concurrent second lock fails while first held
  let contended = false;
  store.lock = "home";
  try {
    increment("home", 1);
  } catch (e) {
    contended = e.message === "lock contention";
  }
  store.lock = null;
  assert.strictEqual(contended, true);

  // Sequential concurrent-style imports serialize correctly
  assert.strictEqual(increment("home", 1).nextMax, 4);
  assert.strictEqual(increment("shared", 1).nextMax, 5);
  assert.strictEqual(store.shared.transfers, 3, "transfers untouched");
  console.log("✓ home/shared counters independent; locking serializes concurrent increments");
}

function testDifferentAcademicContextsIndependent() {
  // Two contexts hold independent MAX for the same email identity.
  const contexts = {
    KSI: { max: 1 },
    SFS: { max: 1 },
  };
  // Import 3 matching rows into KSI for an existing shared/home row
  contexts.KSI.max = computeMergedMax(contexts.KSI.max, 3);
  // Import 2 matching rows into SFS (separate membership)
  contexts.SFS.max = 2; // new membership absolute init
  assert.strictEqual(contexts.KSI.max, 4);
  assert.strictEqual(contexts.SFS.max, 2);
  console.log("✓ different Academic Contexts keep independent MAX values");
}

testBalakumaranFourRows();
testAdditionalExamples();
testMixedDepartmentsStaySeparate();
testNameNormalization();
testExistingIncrementAndLimit();
testContextScopedCountersAndConcurrency();
testDifferentAcademicContextsIndependent();
console.log("\nAll faculty import MAX-merge checks passed.");
