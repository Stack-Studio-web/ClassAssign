/**
 * CAT 1 / CAT 2 → SA1 / SA2 normalization + report alias support.
 * Run: node backend/scripts/validateExamTypeNormalize.mjs
 */
import assert from "assert";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const {
  normalizeExamType,
  toTimetableExamType,
  examTypesMatch,
  examTypeAliases,
  normalizeExamTypeKey,
  collapseExamTypeOptions,
  expandExamTypesForSql,
  sqlExamTypeIn,
} = require("../utils/examTypeNormalize.js");

const {
  parseTimetableRow,
  validateTimetableRows,
} = require("../utils/timetableBulkImport.js");

const { examTypesForAssessment } = require("../utils/coeExportHelpers.js");

function futureYmd(daysAhead = 14) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function importRow(examType) {
  return {
    Date: futureYmd(21),
    "Start Time": "09:00",
    "End Time": "11:00",
    Session: "FN",
    Department: "BCS",
    "Course Code": "24BCS102",
    "Course Name": "Database Management Systems",
    Batch: "2024-2028",
    "Exam Type": examType,
  };
}

function testNormalizeVariants() {
  const sa1Inputs = [
    "CAT 1",
    "CAT1",
    "CAT-1",
    "cat 1",
    "Cat1",
    "SA1",
    "SA 1",
    "SA-1",
    " sa1 ",
  ];
  for (const input of sa1Inputs) {
    assert.strictEqual(
      normalizeExamType(input),
      "SA1",
      `normalizeExamType(${JSON.stringify(input)})`
    );
    assert.strictEqual(toTimetableExamType(input), "SA1");
  }

  const sa2Inputs = [
    "CAT 2",
    "CAT2",
    "CAT-2",
    "cat2",
    "SA2",
    "SA 2",
    "SA-2",
  ];
  for (const input of sa2Inputs) {
    assert.strictEqual(normalizeExamType(input), "SA2");
    assert.strictEqual(toTimetableExamType(input), "SA2");
  }

  assert.strictEqual(toTimetableExamType("SEM"), "SEM");
  assert.strictEqual(toTimetableExamType("Semester"), "SEM");
  assert.strictEqual(normalizeExamType("Model"), "Model");
  assert.strictEqual(normalizeExamType("Retest"), "Retest");
  assert.strictEqual(toTimetableExamType("Model"), null);
  assert.strictEqual(normalizeExamType("LAB-FN"), "LAB-FN");
  console.log("✓ normalize variants (CAT→SA1/SA2, unrelated preserved)");
}

function testMatchingAndAliases() {
  assert.ok(examTypesMatch("CAT 1", "SA1"));
  assert.ok(examTypesMatch("CAT1", "SA 1"));
  assert.ok(examTypesMatch("CAT-2", "SA2"));
  assert.ok(examTypesMatch("SA2", "CAT 2"));
  assert.ok(!examTypesMatch("SA1", "SA2"));
  assert.ok(!examTypesMatch("CAT 1", "CAT 2"));
  assert.ok(examTypesMatch("Model", "model"));
  assert.ok(!examTypesMatch("Model", "SA1"));

  assert.ok(examTypeAliases("CAT 1").includes("SA1"));
  assert.ok(examTypeAliases("CAT 1").includes("CAT1"));
  assert.ok(examTypeAliases("SA2").includes("CAT 2"));

  assert.strictEqual(normalizeExamTypeKey("CAT 1"), "SA1");
  assert.strictEqual(normalizeExamTypeKey("SA1"), "SA1");
  assert.strictEqual(normalizeExamTypeKey("CAT2"), "SA2");

  const collapsed = collapseExamTypeOptions(["CAT 1", "SA1", "CAT1", "Model", "SA2", "CAT 2"]);
  assert.deepStrictEqual(collapsed, ["SA1", "Model", "SA2"]);

  const expanded = expandExamTypesForSql(["CAT 1"]);
  assert.ok(expanded.includes("SA1"));
  assert.ok(expanded.includes("CAT1"));
  assert.ok(expanded.includes("CAT 1"));

  const sql = sqlExamTypeIn("exam_type", "CAT 1");
  assert.ok(sql.clause.includes("IN"));
  assert.ok(sql.params.includes("SA1"));
  assert.ok(sql.params.includes("CAT1"));
  console.log("✓ matching, aliases, collapse, SQL IN");
}

function testImportNormalization() {
  for (const [input, expected] of [
    ["CAT 1", "SA1"],
    ["CAT1", "SA1"],
    ["CAT-1", "SA1"],
    ["SA1", "SA1"],
    ["SA 1", "SA1"],
    ["CAT 2", "SA2"],
    ["CAT2", "SA2"],
    ["CAT-2", "SA2"],
    ["SA2", "SA2"],
    ["SEM", "SEM"],
  ]) {
    const parsed = parseTimetableRow(importRow(input), 2);
    assert.strictEqual(parsed.errors.length, 0, `${input}: ${parsed.errors.join("; ")}`);
    assert.strictEqual(parsed.examType, expected, `import ${input} → ${expected}`);
  }

  const bad = parseTimetableRow(importRow("MIDTERM"), 2);
  assert.ok(bad.errors.some((e) => /Exam Type/i.test(e)));
  assert.notStrictEqual(toTimetableExamType("MIDTERM"), "MIDTERM");
  console.log("✓ timetable import stores SA1/SA2");
}

async function testImportDoesNotDuplicateAliases() {
  const helpers = {
    findBatchByName: async (name) => ({ id: 1, name }),
    courseExistsForDeptBatch: async () => ({ ok: true, batchId: 1 }),
    departmentExists: async () => true,
  };

  const result = await validateTimetableRows(
    [importRow("CAT 1"), importRow("SA1")],
    {},
    helpers
  );
  assert.strictEqual(result.errorCount, 0);
  assert.strictEqual(result.rows[0].examType, "SA1");
  assert.strictEqual(result.rows[1].examType, "SA1");
  // Same normalized type — allotment/report alias equality
  assert.ok(examTypesMatch(result.rows[0].examType, result.rows[1].examType));
  console.log("✓ CAT 1 and SA1 import to same canonical type (no alias split)");
}

function testCoeAssessmentAliases() {
  const cat1 = examTypesForAssessment("CAT 1");
  assert.ok(cat1.includes("SA1"));
  assert.ok(cat1.includes("CAT1") || cat1.includes("CAT 1"));

  const sa1 = examTypesForAssessment("SA1");
  assert.ok(sa1.includes("CAT 1") || sa1.includes("CAT1"));

  const cat2 = examTypesForAssessment("CAT 2");
  assert.ok(cat2.includes("SA2"));

  // Summative must not collide with SA1/SA2 CAT aliases
  const sumI = examTypesForAssessment("SUMMATIVE ASSESSMENT - I");
  assert.ok(!sumI.includes("SA1"), "Summative I should not use SA1 after CAT rename");
  assert.ok(sumI.includes("SEM") || sumI.includes("SEM1"));
  console.log("✓ COE assessment aliases (CAT↔SA; summative without SA collision)");
}

function testHistoricalAccessibility() {
  // Historical stored value "CAT 1" remains findable via SA1 filter
  assert.ok(examTypesMatch("CAT 1", "SA1"));
  assert.ok(examTypesMatch("CAT2", "SA2"));
  const filterSql = sqlExamTypeIn("sp.exam_type", "SA1");
  assert.ok(filterSql.params.includes("CAT 1"));
  assert.ok(filterSql.params.includes("CAT1"));
  assert.ok(filterSql.params.includes("SA1"));
  console.log("✓ historical CAT 1/CAT 2 remain accessible via SA filters");
}

async function main() {
  testNormalizeVariants();
  testMatchingAndAliases();
  testImportNormalization();
  await testImportDoesNotDuplicateAliases();
  testCoeAssessmentAliases();
  testHistoricalAccessibility();
  console.log("\nAll exam-type normalization checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
