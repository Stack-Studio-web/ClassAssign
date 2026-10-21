/**
 * Offline timetable bulk-import course ↔ department ↔ batch checks.
 * Batch names (e.g. 2026-2030) repeat across departments/semesters; import must use the
 * batch the department's course students are linked to (same as Manual Entry listBatchesForCourse).
 * Run: node backend/scripts/validateTimetableImportBatchLink.mjs
 */
import assert from "assert";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  resolveLinkedBatch,
  normalizeBatchName,
  validateTimetableRows,
} = require("../utils/timetableBulkImport.js");

// One "2026-2030" batch per department (ids ascending = creation order).
const BATCHES = [
  { id: 11, name: "2026-2030", department: "BAE" },
  { id: 12, name: "2026-2030", department: "BAU" },
  { id: 13, name: "2026-2030", department: "BBT" },
  { id: 14, name: "2026-2030", department: "BCE" },
  { id: 15, name: "2026-2030", department: "BEE" },
  { id: 16, name: "2026-2030", department: "BME" },
  { id: 17, name: "2026-2030", department: "BMC" },
  { id: 18, name: "2026-2030", department: "BTT" },
  { id: 19, name: "2026-2030", department: "BCS" },
  // Newer same-named batch in another semester — findByNameInScope would prefer this id.
  { id: 99, name: "2026-2030", department: "OTHER" },
];

const STUDENTS = [
  ...["BAE", "BAU", "BCE", "BME", "BMC", "BTT"].map((d, i) => ({
    regn_no: `26${d}00${i}`,
    department: d,
    course_description: "24MEI101",
    course_name: "Engineering Graphics",
    batch_id: BATCHES.find((b) => b.department === d).id,
  })),
  ...["BBT", "BEE"].map((d, i) => ({
    regn_no: `26${d}01${i}`,
    department: i === 0 ? "" : d, // BBT matched only via regn prefix
    course_description: "24MEI103",
    course_name: "Basic Workshop",
    batch_id: BATCHES.find((b) => b.department === d).id,
  })),
  {
    regn_no: "26BEE020",
    department: "BEE",
    course_description: "24MET105",
    course_name: "Engineering Mechanics",
    batch_id: 15,
  },
  // Whitespace / case variant still belongs to BAE + 2026-2030
  {
    regn_no: "26BAE099",
    department: "BAE",
    course_description: " 24mei101 ",
    course_name: "Engineering Graphics",
    batch_id: 11,
  },
];

function deptMatches(st, dept) {
  if (String(st.department || "").trim().toUpperCase() === dept) return true;
  const m = String(st.regn_no || "").trim().toUpperCase().match(/^[0-9]{2}([A-Z]+)/);
  return Boolean(m && m[1] === dept);
}

function courseMatches(st, courseCode) {
  return String(st.course_description || "").trim().toUpperCase() === String(courseCode || "").trim().toUpperCase();
}

/** In-memory equivalent of timetableFormOptions.listBatchesForCourse. */
function listBatchesForCourse(department, courseCode) {
  const dept = department.toUpperCase();
  const ids = new Set(
    STUDENTS.filter(
      (st) => courseMatches(st, courseCode) && deptMatches(st, dept) && st.batch_id != null
    ).map((st) => st.batch_id)
  );
  return BATCHES.filter((b) => ids.has(b.id)).map((b) => ({ id: b.id, name: b.name }));
}

function listCoursesByDepartment(department) {
  const dept = department.toUpperCase();
  const map = new Map();
  for (const st of STUDENTS) {
    if (!deptMatches(st, dept)) continue;
    const code = String(st.course_description || "").trim();
    if (!code) continue;
    map.set(code.toUpperCase(), { courseCode: code.trim(), courseName: st.course_name });
  }
  return [...map.values()];
}

/** Batch.findByNameInScope: newest batch with that name, department-agnostic. */
function findBatchByNameGlobal(name) {
  const wanted = normalizeBatchName(name);
  const hits = BATCHES.filter((b) => normalizeBatchName(b.name) === wanted);
  const row = hits.sort((a, b) => b.id - a.id)[0];
  return row ? { id: row.id, name: row.name } : null;
}

/**
 * Mirrors runTimetableValidation findBatchByName: prefer dept+course linked batch
 * (Manual Entry), then fall back to global same-name lookup.
 */
function findBatchByName(name, department, courseCode) {
  const wanted = normalizeBatchName(name);
  if (department && courseCode && wanted) {
    const linked = listBatchesForCourse(department, courseCode);
    const resolved = resolveLinkedBatch(linked, name, null);
    if (resolved.batch) return { id: resolved.batch.id, name: resolved.batch.name };
  }
  return findBatchByNameGlobal(name);
}

/** Original importer bug: treated Batch cell as register-number prefix. */
async function oldRegnPrefixCheck(courseCode, department, batch) {
  const students = STUDENTS.filter(
    (st) => courseMatches(st, courseCode) && deptMatches(st, department)
  );
  if (!students.length) {
    return {
      ok: false,
      message: `Course Code ${courseCode} was not found for Department ${department} in the selected academic context.`,
    };
  }
  const batchUpper = String(batch || "").toUpperCase();
  const inBatch = students.some((s) =>
    String(s.regn_no || "").toUpperCase().startsWith(batchUpper)
  );
  return inBatch
    ? { ok: true }
    : {
        ok: false,
        message: `Course Code ${courseCode} is not linked to Batch ${batch} for Department ${department}.`,
      };
}

/** Previous importer rule: students.batch_id must equal the name-resolved batch id. */
async function oldCourseCheck(courseCode, department, batch, batchId) {
  const ok = STUDENTS.some(
    (st) =>
      courseMatches(st, courseCode) &&
      st.batch_id === Number(batchId) &&
      deptMatches(st, department)
  );
  return ok
    ? { ok: true }
    : { ok: false, message: `Course Code ${courseCode} is not linked to Batch ${batch} for Department ${department}.` };
}

/** Fixed importer rule (mirrors runTimetableValidation / Manual Entry). */
async function newCourseCheck(courseCode, department, batch, batchId) {
  const linked = listBatchesForCourse(department, courseCode);
  const resolved = resolveLinkedBatch(linked, batch, batchId);
  if (resolved.ambiguous) return { ok: false, message: `Batch ${batch} is ambiguous` };
  if (resolved.batch) return { ok: true, batchId: resolved.batch.id };
  const courses = listCoursesByDepartment(department);
  const hasCourse = courses.some(
    (c) => String(c.courseCode).trim().toUpperCase() === String(courseCode).trim().toUpperCase()
  );
  if (!hasCourse) {
    return {
      ok: false,
      message: `Course Code ${courseCode} was not found for Department ${department} in the selected academic context.`,
    };
  }
  return {
    ok: false,
    message: `Course Code ${courseCode} is not linked to Batch ${batch} for Department ${department}.`,
  };
}

function row(department, courseCode, courseName = "Course", batch = "2026-2030") {
  return {
    Date: "2026-12-01",
    "Start Time": "09:30",
    "End Time": "11:00",
    Session: "FN",
    Department: department,
    "Course Code": courseCode,
    "Course Name": courseName,
    Batch: batch,
    "Exam Type": "CAT1",
  };
}

/** Exact failing rows from the report (row 30 duplicates BEE+24MEI103). */
const REPORTED_ROWS = [
  ["BAE", "24MEI101", "Engineering Graphics"],
  ["BAU", "24MEI101", "Engineering Graphics"],
  ["BBT", "24MEI103", "Basic Workshop"],
  ["BCE", "24MEI101", "Engineering Graphics"],
  ["BEE", "24MEI103", "Basic Workshop"],
  ["BEE", "24MET105", "Engineering Mechanics"],
  ["BEE", "24MEI103", "Basic Workshop"],
  ["BME", "24MEI101", "Engineering Graphics"],
  ["BMC", "24MEI101", "Engineering Graphics"],
  ["BTT", "24MEI101", "Engineering Graphics"],
];

const helpers = (courseExistsForDeptBatch, findBatch = findBatchByName) => ({
  findBatchByName: async (name, department, courseCode) => findBatch(name, department, courseCode),
  courseExistsForDeptBatch,
  departmentExists: async () => true,
});

async function testOldRegnPrefixReproducesBug() {
  const result = await validateTimetableRows(
    REPORTED_ROWS.map(([d, c, n]) => row(d, c, n)),
    {},
    helpers(oldRegnPrefixCheck, findBatchByNameGlobal)
  );
  assert.strictEqual(result.errorCount, REPORTED_ROWS.length, "regn-prefix rule rejects every reported row");
  assert.match(
    result.rows[0].error,
    /Course Code 24MEI101 is not linked to Batch 2026-2030 for Department BAE\./
  );
  console.log("✓ original regn.startsWith(batchName) rule reproduces the reported rejection");
}

async function testOldBatchIdRuleReproducesBug() {
  const result = await validateTimetableRows(
    REPORTED_ROWS.map(([d, c, n]) => row(d, c, n)),
    {},
    helpers(oldCourseCheck, findBatchByNameGlobal)
  );
  assert.strictEqual(result.errorCount, REPORTED_ROWS.length, "old batch_id rule rejects every reported row");
  assert.match(
    result.rows[0].error,
    /Course Code 24MEI101 is not linked to Batch 2026-2030 for Department BAE\./
  );
  console.log("✓ old rule reproduces the reported rejection (name resolves to another department's batch)");
}

async function testReportedRowsValidWithFix() {
  const result = await validateTimetableRows(
    REPORTED_ROWS.map(([d, c, n]) => row(d, c, n)),
    {},
    helpers(newCourseCheck)
  );
  assert.strictEqual(result.errorCount, 0, JSON.stringify(result.rows.filter((r) => r.error)));
  assert.strictEqual(result.canImport, true);
  assert.strictEqual(result.validCount, 10);
  for (const r of result.rows) {
    const own = BATCHES.find((b) => b.department === r.department);
    assert.strictEqual(r.batchId, own.id, `${r.department} links to its own batch id`);
  }
  console.log("✓ all 10 reported rows validate and link to the department's own batch_id");
}

async function testCourseScopedFindBatchIgnoresGlobalNewest() {
  const found = findBatchByName("2026-2030", "BAE", "24MEI101");
  assert.strictEqual(found.id, 11, "course-scoped find returns BAE batch, not global id 99");
  const global = findBatchByNameGlobal("2026-2030");
  assert.strictEqual(global.id, 99, "sanity: global newest is still 99");
  console.log("✓ course-scoped findBatchByName ignores newer same-named batch in another department");
}

async function testUnlinkedCombinationsStillRejected() {
  const result = await validateTimetableRows(
    [
      row("BEE", "24MEI101"), // BEE has no 24MEI101 students
      row("BCS", "24MEI101"), // BCS batch exists, no students in course
      row("BAE", "24MET105"),
    ],
    {},
    helpers(newCourseCheck)
  );
  assert.strictEqual(result.errorCount, 3);
  assert.strictEqual(result.canImport, false);
  for (const r of result.rows) {
    assert.match(
      r.error,
      /is not linked to Batch 2026-2030 for Department|was not found for Department/
    );
  }
  console.log("✓ combinations without enrolled students are still rejected");
}

async function testNonexistentCourseAndBatch() {
  const missingCourse = await validateTimetableRows(
    [row("BAE", "99ZZZ999")],
    {},
    helpers(newCourseCheck)
  );
  assert.strictEqual(missingCourse.errorCount, 1);
  assert.match(missingCourse.rows[0].error, /was not found for Department BAE/);

  const missingBatch = await validateTimetableRows(
    [row("BAE", "24MEI101", "Course", "2030-2034")],
    {},
    helpers(newCourseCheck)
  );
  assert.strictEqual(missingBatch.errorCount, 1);
  assert.match(missingBatch.rows[0].error, /Batch "2030-2034" does not exist/);
  console.log("✓ nonexistent course and batch still rejected with distinct messages");
}

async function testWhitespaceAndCaseInCourseCode() {
  const result = await validateTimetableRows(
    [row("BAE", " 24mei101 ")],
    {},
    helpers(newCourseCheck)
  );
  assert.strictEqual(result.errorCount, 0, JSON.stringify(result.rows));
  assert.strictEqual(result.rows[0].batchId, 11);
  console.log("✓ leading/trailing whitespace and course-code case are accepted");
}

async function testWhitespaceInBatchName() {
  const result = await validateTimetableRows(
    [row("BAE", "24MEI101", "Engineering Graphics", " 2026-2030 ")],
    {},
    helpers(newCourseCheck)
  );
  assert.strictEqual(result.errorCount, 0, JSON.stringify(result.rows));
  assert.strictEqual(result.rows[0].batchId, 11);
  console.log("✓ leading/trailing whitespace in batch name is accepted");
}

async function testMixedValidAndInvalidRows() {
  const result = await validateTimetableRows(
    [row("BAE", "24MEI101"), row("BEE", "24MEI101"), row("BEE", "24MET105")],
    {},
    helpers(newCourseCheck)
  );
  assert.strictEqual(result.validCount, 2);
  assert.strictEqual(result.errorCount, 1);
  assert.strictEqual(result.canImport, false);
  assert.match(result.rows[1].error, /is not linked to Batch|was not found for Department/);
  console.log("✓ mixed valid/invalid rows keep import blocked");
}

async function testCourseInOtherDepartmentRejected() {
  // 24MET105 exists for BEE, not BAE
  const result = await validateTimetableRows(
    [row("BAE", "24MET105")],
    {},
    helpers(newCourseCheck)
  );
  assert.strictEqual(result.errorCount, 1);
  assert.match(result.rows[0].error, /was not found for Department BAE|is not linked to Batch/);
  console.log("✓ course assigned only to another department is rejected");
}

async function testMissingBatchNameStillRejected() {
  const r = row("BAE", "24MEI101");
  r.Batch = "2030-2034";
  const result = await validateTimetableRows([r], {}, helpers(newCourseCheck));
  assert.strictEqual(result.errorCount, 1);
  assert.match(result.rows[0].error, /Batch "2030-2034" does not exist/);
  console.log("✓ unknown batch name still reports 'does not exist'");
}

async function testSharedCourseAcrossDepartments() {
  // 24MEI101 is shared across BAE/BAU/BCE/… — each links to its own batch id
  const result = await validateTimetableRows(
    [
      row("BAE", "24MEI101", "Engineering Graphics"),
      row("BAU", "24MEI101", "Engineering Graphics"),
      row("BCE", "24MEI101", "Engineering Graphics"),
    ],
    {},
    helpers(newCourseCheck)
  );
  assert.strictEqual(result.errorCount, 0);
  assert.deepStrictEqual(
    result.rows.map((r) => r.batchId),
    [11, 12, 14]
  );
  console.log("✓ shared course across departments links each to its own batch");
}

function testResolveLinkedBatch() {
  const linked = [
    { id: 5, name: "2026-2030" },
    { id: 9, name: " 2026-2030 " },
    { id: 7, name: "2025-2029" },
  ];
  assert.deepStrictEqual(resolveLinkedBatch(linked, "2025-2029").batch.id, 7);
  assert.strictEqual(resolveLinkedBatch(linked, "2026-2030", 9).batch.id, 9);
  assert.strictEqual(resolveLinkedBatch(linked, "2026-2030", 1).ambiguous, true);
  assert.strictEqual(resolveLinkedBatch(linked, "2024-2028").batch, null);
  assert.strictEqual(resolveLinkedBatch([], "2026-2030").batch, null);
  assert.strictEqual(resolveLinkedBatch(linked, "").batch, null);
  assert.strictEqual(resolveLinkedBatch([{ id: 3, name: "2026–2030" }], "2026-2030").batch.id, 3);
  assert.strictEqual(normalizeBatchName(" 2026–2030 "), "2026-2030");
  assert.strictEqual(normalizeBatchName("2026-2030\u200B"), "2026-2030");
  console.log("✓ resolveLinkedBatch: case/trim/dash/zwsp match, formal-id tie-break, ambiguity");
}

await testOldRegnPrefixReproducesBug();
await testOldBatchIdRuleReproducesBug();
await testCourseScopedFindBatchIgnoresGlobalNewest();
await testReportedRowsValidWithFix();
await testSharedCourseAcrossDepartments();
await testUnlinkedCombinationsStillRejected();
await testNonexistentCourseAndBatch();
await testWhitespaceAndCaseInCourseCode();
await testWhitespaceInBatchName();
await testMixedValidAndInvalidRows();
await testCourseInOtherDepartmentRejected();
await testMissingBatchNameStillRejected();
testResolveLinkedBatch();
console.log("\nAll timetable import batch-link checks passed.");
