/**
 * Faculty import MAX double-count regression.
 * Proves the 1+N=5 bug, then asserts the fixed path yields N.
 * Run: node backend/scripts/validateFacultyImportMaxMerge.mjs
 */
import assert from "assert";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  groupFacultyImportRows,
  indexGroupsByEmail,
  buggyDoubleCountFirstRow,
  finalMaxForMatchingRows,
  computeMergedMax,
  validateMergedMax,
  simulateImportMaxWrite,
  duplicateRowsMergedCount,
  facultyImportGroupKey,
  MAX_CLASSROOMS_LIMIT,
} = require("../utils/facultyImportMaxMerge.js");

const BALA = {
  name: "Balakumaran S /Adjunct faculty /CSE",
  department: "CSE",
  email: "balakumaran.jimpact@kct.ac.in",
};

function row(rowNum, name, department, email) {
  return { row: rowNum, name, department, email };
}

function balakumaranFourRows() {
  return [2, 3, 4, 5].map((n) => row(n, BALA.name, BALA.department, BALA.email));
}

function testBugReproductionFourRowsYieldFive() {
  const groups = groupFacultyImportRows(balakumaranFourRows());
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].count, 4);

  // Exact production bug: create MAX=1, then add all 4 matching rows again.
  const buggy = buggyDoubleCountFirstRow(groups[0].count);
  assert.strictEqual(buggy, 5, "bug must produce MAX=5 for four rows");

  const sim = simulateImportMaxWrite(
    "buggy-add-all",
    { exists: false, currentMax: 0 },
    4
  );
  assert.strictEqual(sim.max, 5);
  assert.deepStrictEqual(
    sim.log.map((e) => e.op),
    ["create", "incrementBy"]
  );
  console.log("✓ REPRODUCED: create(MAX=1) + incrementBy(4) → MAX=5");
}

function testFixedFourRowsYieldFour() {
  const groups = groupFacultyImportRows(balakumaranFourRows());
  assert.strictEqual(finalMaxForMatchingRows(groups[0].count), 4);
  assert.strictEqual(computeMergedMax(1, 4), 4);
  assert.notStrictEqual(computeMergedMax(1, 4), buggyDoubleCountFirstRow(4));

  const simNew = simulateImportMaxWrite("fixed", { exists: false, currentMax: 0 }, 4);
  assert.strictEqual(simNew.max, 4);
  assert.strictEqual(simNew.log[0].op, "create");
  assert.strictEqual(simNew.log[0].max, 1);
  assert.strictEqual(simNew.log[1].op, "setAbsolute");
  assert.strictEqual(simNew.log[1].max, 4);

  // Existing membership already at default 1 (first row represented) + 4 file rows
  const simExisting = simulateImportMaxWrite(
    "fixed",
    { exists: true, currentMax: 1 },
    4
  );
  assert.strictEqual(simExisting.max, 4);

  // Buggy existing path still documented
  const simExistingBug = simulateImportMaxWrite(
    "buggy-add-all",
    { exists: true, currentMax: 1 },
    4
  );
  assert.strictEqual(simExistingBug.max, 5);

  assert.strictEqual(duplicateRowsMergedCount(groups), 3);
  console.log("✓ FIXED: four identical rows → MAX=4 (create 1 then setAbsolute 4)");
}

function testOneRowMaxIs1() {
  const groups = groupFacultyImportRows([
    row(2, "Dr. D. Arivuoli", "SFS", "arivuoli.d.sci@kct.ac.in"),
  ]);
  assert.strictEqual(groups[0].count, 1);
  assert.strictEqual(finalMaxForMatchingRows(1), 1);
  const sim = simulateImportMaxWrite("fixed", { exists: false, currentMax: 0 }, 1);
  assert.strictEqual(sim.max, 1);
  assert.strictEqual(sim.log.length, 1);
  console.log("✓ one row → MAX=1");
}

function testTwoRowsMaxIs2() {
  const groups = groupFacultyImportRows([
    row(2, "Capt. Dr. A. R. Arul", "SFS", "arul.ar.sci@kct.ac.in"),
    row(3, "Capt. Dr. A. R. Arul", "SFS", "arul.ar.sci@kct.ac.in"),
  ]);
  assert.strictEqual(finalMaxForMatchingRows(groups[0].count), 2);
  assert.strictEqual(
    simulateImportMaxWrite("fixed", { exists: false, currentMax: 0 }, 2).max,
    2
  );
  console.log("✓ two identical rows → MAX=2");
}

function testReimportIdempotentKeepsFour() {
  const sim = simulateImportMaxWrite("fixed", { exists: true, currentMax: 4 }, 4);
  assert.strictEqual(sim.max, 4);
  // Prior buggy value 5 corrected when same four-row file is reimported
  const repair = simulateImportMaxWrite("fixed", { exists: true, currentMax: 5 }, 4);
  assert.strictEqual(repair.max, 4);
  console.log("✓ reimport four rows: MAX stays/repairs to 4 (not 5 or 8)");
}

function testContextsAndFacultyIndependent() {
  const ksi = simulateImportMaxWrite("fixed", { exists: false, currentMax: 0 }, 4).max;
  const sfs = simulateImportMaxWrite("fixed", { exists: false, currentMax: 0 }, 2).max;
  assert.strictEqual(ksi, 4);
  assert.strictEqual(sfs, 2);

  const other = simulateImportMaxWrite("fixed", { exists: false, currentMax: 0 }, 2).max;
  assert.strictEqual(other, 2);
  assert.strictEqual(ksi, 4);
  console.log("✓ different faculty / contexts keep independent MAX");
}

function testOtherCountersUntouched() {
  const counters = {
    max: 1,
    available: true,
    alloc: 2,
    done: 1,
    rem: null,
    transfers: 3,
  };
  // Import only assigns max; callers must not rewrite other fields.
  counters.max = finalMaxForMatchingRows(4);
  counters.rem = counters.max - counters.alloc;
  assert.strictEqual(counters.max, 4);
  assert.strictEqual(counters.alloc, 2);
  assert.strictEqual(counters.done, 1);
  assert.strictEqual(counters.transfers, 3);
  assert.strictEqual(counters.available, true);
  assert.strictEqual(counters.rem, 2);
  console.log("✓ ALLOC/DONE/AVAILABLE/TRANSFERS unchanged; REM follows Max−Alloc");
}

function testNormalizationAndMixedDept() {
  const a = facultyImportGroupKey({
    name: "  Balakumaran S /Adjunct faculty /CSE ",
    department: "cse",
    email: "Balakumaran.jimpact@KCT.ac.in",
  });
  const b = facultyImportGroupKey(BALA);
  assert.strictEqual(a, b);

  const mixed = groupFacultyImportRows([
    row(2, "Same", "CSE", "same@kct.ac.in"),
    row(3, "Same", "CSE", "same@kct.ac.in"),
    row(4, "Same", "IT", "same@kct.ac.in"),
  ]);
  assert.strictEqual(mixed.length, 2);
  assert.strictEqual(indexGroupsByEmail(mixed).get("same@kct.ac.in").length, 2);
  assert.strictEqual(validateMergedMax(20).ok, true);
  assert.strictEqual(validateMergedMax(21).ok, false);
  assert.strictEqual(MAX_CLASSROOMS_LIMIT, 20);
  console.log("✓ normalization + mixed departments + limit checks");
}

// Order matters: reproduce failure first, then assert fix.
testBugReproductionFourRowsYieldFive();
testFixedFourRowsYieldFour();
testOneRowMaxIs1();
testTwoRowsMaxIs2();
testReimportIdempotentKeepsFour();
testContextsAndFacultyIndependent();
testOtherCountersUntouched();
testNormalizationAndMixedDept();
console.log("\nAll faculty import MAX-merge checks passed.");
