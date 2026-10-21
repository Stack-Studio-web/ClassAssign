/**
 * Offline checks for /Hall exam allotment export session ordering.
 */
import assert from "assert";
import {
  parseExamTimeToMinutes,
  normalizeExamDateKey,
  sortHallsForExport,
  groupHallsByExamTime,
  compareHallExportSessions,
} from "../../src/lib/hallExportOrder.js";

function testParseTimes() {
  assert.strictEqual(parseExamTimeToMinutes("08:30"), 8 * 60 + 30);
  assert.strictEqual(parseExamTimeToMinutes("08:30:00"), 8 * 60 + 30);
  assert.strictEqual(parseExamTimeToMinutes("11:15"), 11 * 60 + 15);
  assert.strictEqual(parseExamTimeToMinutes("13:15:00"), 13 * 60 + 15);
  assert.ok(parseExamTimeToMinutes(null) > parseExamTimeToMinutes("23:59"));
  console.log("✓ parseExamTimeToMinutes handles HH:mm and HH:mm:ss");
}

function testWrongInputOrderFixed() {
  // Same date; API returns later session first (the reported bug).
  const halls = [
    {
      examDate: "2026-10-22",
      examStartTime: "11:15",
      examEndTime: "13:15",
      hallNo: "B-Block",
      id: "b",
    },
    {
      examDate: "2026-10-22",
      examStartTime: "08:30",
      examEndTime: "11:00",
      hallNo: "A-Block",
      id: "a",
    },
  ];
  const sorted = sortHallsForExport(halls);
  assert.strictEqual(sorted[0].examStartTime, "08:30");
  assert.strictEqual(sorted[1].examStartTime, "11:15");

  const groups = groupHallsByExamTime(halls);
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0][1][0].examStartTime, "08:30");
  assert.strictEqual(groups[1][1][0].examStartTime, "11:15");
  console.log("✓ 11:15 before 08:30 in input → export places 08:30 first");
}

function testMultiDate() {
  const halls = [
    { examDate: "2026-10-23", examStartTime: "09:00", examEndTime: "12:00", id: "2" },
    { examDate: "2026-10-22", examStartTime: "14:00", examEndTime: "16:00", id: "1b" },
    { examDate: "2026-10-22", examStartTime: "08:30", examEndTime: "11:00", id: "1a" },
  ];
  const sorted = sortHallsForExport(halls);
  assert.deepStrictEqual(
    sorted.map((h) => `${normalizeExamDateKey(h.examDate)} ${h.examStartTime}`),
    ["2026-10-22 08:30", "2026-10-22 14:00", "2026-10-23 09:00"]
  );
  console.log("✓ multi-date sorts by date then start time");
}

function testEqualStartTimes() {
  const a = {
    examDate: "2026-10-22",
    examStartTime: "09:00",
    examEndTime: "12:00",
    examSession: "FN",
    id: "z",
  };
  const b = {
    examDate: "2026-10-22",
    examStartTime: "09:00",
    examEndTime: "12:00",
    examSession: "FN",
    id: "a",
  };
  assert.ok(compareHallExportSessions(a, b) > 0);
  assert.ok(compareHallExportSessions(b, a) < 0);
  console.log("✓ equal start times use deterministic id tie-break");
}

function testSsFormat() {
  const halls = [
    { examDate: "2026-10-22", examStartTime: "11:15:00", examEndTime: "13:15:00", id: "2" },
    { examDate: "2026-10-22", examStartTime: "08:30:00", examEndTime: "11:00:00", id: "1" },
  ];
  const sorted = sortHallsForExport(halls);
  assert.strictEqual(sorted[0].examStartTime, "08:30:00");
  console.log("✓ HH:mm:ss start times sort correctly");
}

testParseTimes();
testWrongInputOrderFixed();
testMultiDate();
testEqualStartTimes();
testSsFormat();
console.log("\nAll hall export order checks passed.");
