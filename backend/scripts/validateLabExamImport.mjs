/**
 * Offline LAB student import + faculty mapping checks.
 * Run: node backend/scripts/validateLabExamImport.mjs
 */
import assert from "assert";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  parseLabStudentRows: parse,
  summarizeFacultyCounts: summarize,
} = require("../utils/labStudentImport.js");

function testValidAndInvalidRows() {
  const { valid, invalid } = parse([
    {
      "Register Number": "24BIT001",
      "Course-1": "24CSI013",
      "Email ID": "faizal@kct.ac.in",
    },
    {
      "Register Number": "24BIT002",
      "Course-1": "24CSI013",
      "Email ID": "mani@kct.ac.in",
    },
    {
      "Register Number": "",
      "Course-1": "24CSI013",
      "Email ID": "x@kct.ac.in",
    },
    {
      "Register Number": "24BIT001",
      "Course-1": "24CSI013",
      "Email ID": "other@kct.ac.in",
    },
    {
      RegisterNumber: "24BIT003",
      Course1: "24CSI013",
      EmailID: "  FAIZAL@KCT.AC.IN ",
    },
  ]);

  assert.strictEqual(valid.length, 3);
  assert.ok(invalid.some((r) => /Missing/i.test(r.reason)));
  assert.ok(invalid.some((r) => /Duplicate/i.test(r.reason)));
  assert.strictEqual(valid[2].facultyEmail, "faizal@kct.ac.in");
  console.log("✓ valid/invalid rows + email normalize + duplicates");
}

function testFacultyCounts() {
  const { valid } = parse([
    { "Register Number": "S1", "Course-1": "C1", "Email ID": "faizal@kct.ac.in" },
    { "Register Number": "S2", "Course-1": "C1", "Email ID": "faizal@kct.ac.in" },
    { "Register Number": "S3", "Course-1": "C1", "Email ID": "faizal@kct.ac.in" },
    { "Register Number": "S4", "Course-1": "C1", "Email ID": "mani@kct.ac.in" },
    { "Register Number": "S5", "Course-1": "C1", "Email ID": "faizal@kct.ac.in" },
    { "Register Number": "S6", "Course-1": "C1", "Email ID": "mani@kct.ac.in" },
  ]);
  const summary = summarize(valid);
  const faizal = summary.find((g) => g.facultyEmail === "faizal@kct.ac.in");
  const mani = summary.find((g) => g.facultyEmail === "mani@kct.ac.in");
  assert.strictEqual(faizal.studentCount, 4);
  assert.strictEqual(mani.studentCount, 2);
  assert.strictEqual(faizal.registerNumbers.length, 4);
  console.log("✓ faculty student counts from email mapping");
}

function testMultipleFacultySameSlot() {
  const { valid } = parse([
    { "Register Number": "A1", "Course-1": "LAB1", "Email ID": "a@kct.ac.in" },
    { "Register Number": "B1", "Course-1": "LAB1", "Email ID": "b@kct.ac.in" },
  ]);
  assert.strictEqual(summarize(valid).length, 2);
  console.log("✓ multiple faculty in same slot");
}

function testRangeOrderingSemantics() {
  const regns = ["24BIT010", "24BIT002", "24BIT001"];
  const ordered = [...regns].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  assert.deepStrictEqual(ordered, ["24BIT001", "24BIT002", "24BIT010"]);
  const from = "24BIT001";
  const to = "24BIT002";
  const start = ordered.indexOf(from);
  const end = ordered.indexOf(to);
  const range = ordered.slice(start, end + 1);
  assert.deepStrictEqual(range, ["24BIT001", "24BIT002"]);
  console.log("✓ register range uses numeric-aware ordering");
}

testValidAndInvalidRows();
testFacultyCounts();
testMultipleFacultySameSlot();
testRangeOrderingSemantics();
console.log("\nAll LAB exam import checks passed.");
