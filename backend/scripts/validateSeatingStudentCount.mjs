/**
 * Total Students in Hall must count assigned students, not physical capacity / blocked seats.
 * Run: node backend/scripts/validateSeatingStudentCount.mjs
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const {
  countAssignedStudentsInHall,
  getAssignedRollsFromCell,
  isAssignedStudentRegn,
} = await import("../../src/lib/seatingStudentCount.js");

function makeScHall({ seated = 42, rows = 7, blockedPerRow = true } = {}) {
  const layout = [3, 2, 2, 3];
  const blocked = [
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
  ];
  let n = 0;
  const arrangement = [];
  for (let r = 0; r < rows; r++) {
    const row = layout.map((seats, g) => {
      const cell = Array.from({ length: seats }, (_, p) => {
        if (blockedPerRow && blocked.some(([bg, bp]) => bg === g && bp === p)) {
          return { blocked: true, regn_no: "0" };
        }
        if (n < seated) {
          n += 1;
          return { regn_no: `26BCS${String(100 + n).padStart(3, "0")}`, course: "24MAI118" };
        }
        return null;
      });
      return cell;
    });
    arrangement.push(row);
  }
  return {
    venueName: "SC307",
    benchConfig: layout,
    seatingArrangement: arrangement,
  };
}

function testAssignedRegnRules() {
  assert.strictEqual(isAssignedStudentRegn("26BCS101"), true);
  assert.strictEqual(isAssignedStudentRegn("0"), false);
  assert.strictEqual(isAssignedStudentRegn("0", { blocked: true, regn_no: "0" }), false);
  assert.strictEqual(isAssignedStudentRegn(""), false);
  assert.strictEqual(isAssignedStudentRegn("Empty"), false);
  assert.deepStrictEqual(
    getAssignedRollsFromCell([
      { regn_no: "26BCS101" },
      { blocked: true, regn_no: "0" },
      null,
      { regn_no: "26BCS102" },
    ]),
    ["26BCS101", "26BCS102"]
  );
  console.log("✓ assigned-regn rules exclude blocked 0 / empty");
}

function testFortyTwoNotSeventy() {
  const hall = makeScHall({ seated: 42, rows: 7 });
  // Physical positions = 7 * 10 = 70; blocked = 28; assigned = 42
  const physical = 7 * 10;
  const { total, batchCounts } = countAssignedStudentsInHall(hall);
  assert.strictEqual(physical, 70);
  assert.strictEqual(total, 42);
  assert.notStrictEqual(total, physical);
  assert.ok(Object.values(batchCounts).reduce((s, n) => s + n, 0) <= total);
  console.log("✓ 42 assigned → Total Students in Hall: 42 (not 70)");
}

function testPartialAndEmpty() {
  assert.strictEqual(countAssignedStudentsInHall(makeScHall({ seated: 27 })).total, 27);
  assert.strictEqual(countAssignedStudentsInHall(makeScHall({ seated: 35 })).total, 35);
  assert.strictEqual(countAssignedStudentsInHall(makeScHall({ seated: 0 })).total, 0);
  console.log("✓ 27 / 35 / 0 assigned counts");
}

function testMultiHallIndependent() {
  const a = makeScHall({ seated: 42 });
  a.venueName = "SC307";
  const b = makeScHall({ seated: 27 });
  b.venueName = "SC314";
  assert.strictEqual(countAssignedStudentsInHall(a).total, 42);
  assert.strictEqual(countAssignedStudentsInHall(b).total, 27);
  console.log("✓ multi-hall counts are independent");
}

function testBlockedNeverInflate() {
  const hall = makeScHall({ seated: 10, rows: 7, blockedPerRow: true });
  const { total, rolls } = countAssignedStudentsInHall(hall);
  assert.strictEqual(total, 10);
  assert.ok(rolls.every((r) => r !== "0"));
  console.log("✓ blocked positions never increase student count");
}

function testWiring() {
  const print = read("src/pages/PrintLayout.jsx");
  assert.match(print, /countAssignedStudentsInHall/);
  assert.match(print, /Total Students in Hall/);
  assert.doesNotMatch(
    print,
    /filter\(item => item && \(item\.regn_no \?\? item\.regnNo\)\)/
  );

  const hallPage = read("src/pages/StudentArrangement.jsx");
  assert.match(hallPage, /regn !== "0"/);
  assert.match(hallPage, /blocked === true/);
  console.log("✓ PrintLayout + StudentArrangement use assigned-only counting");
}

function main() {
  testAssignedRegnRules();
  testFortyTwoNotSeventy();
  testPartialAndEmpty();
  testMultiHallIndependent();
  testBlockedNeverInflate();
  testWiring();
  console.log("\nAll seating student-count checks passed.");
}

main();
