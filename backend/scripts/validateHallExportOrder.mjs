/**
 * Offline checks for /Hall exam allotment export session ordering + print pagination.
 */
import assert from "assert";
import {
  parseExamTimeToMinutes,
  normalizeExamDateKey,
  sortHallsForExport,
  groupHallsByExamTime,
  compareHallExportSessions,
  paginateHallAllotmentForPrint,
  estimatePrintRowHeight,
  getHallPrintUsableHeightPx,
  HALL_PRINT_GEOMETRY,
  HALL_ALLOTMENT_PRINT_CSS,
  HALL_ALLOTMENT_PAGE_STYLE,
} from "../../src/lib/hallExportOrder.js";

function makeHall(hallNo, rowCount, opts = {}) {
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    yearBranch: `23BCS${i}`,
    courseCodes: opts.longCourse ? ["UCS23XX1", "UCS23XX2", "UCS23XX3"] : ["UCS2301"],
    rollNos: opts.longRoll
      ? "23BCS001 - 23BCS020, 23BCS021 - 23BCS040, 23BCS041 - 23BCS060"
      : `23BCS${String(i).padStart(3, "0")} - 23BCS${String(i + 5).padStart(3, "0")}`,
    count: 6,
  }));
  return {
    hallNo,
    overallCount: rows.reduce((s, r) => s + r.count, 0),
    rows,
    examDate: opts.examDate || "2026-10-23",
    examStartTime: opts.examStartTime || "08:30",
    examEndTime: opts.examEndTime || "11:00",
    id: opts.id || hallNo,
  };
}

function testParseTimes() {
  assert.strictEqual(parseExamTimeToMinutes("08:30"), 8 * 60 + 30);
  assert.strictEqual(parseExamTimeToMinutes("08:30:00"), 8 * 60 + 30);
  assert.strictEqual(parseExamTimeToMinutes("11:15"), 11 * 60 + 15);
  assert.strictEqual(parseExamTimeToMinutes("13:15:00"), 13 * 60 + 15);
  assert.ok(parseExamTimeToMinutes(null) > parseExamTimeToMinutes("23:59"));
  console.log("✓ parseExamTimeToMinutes handles HH:mm and HH:mm:ss");
}

function testWrongInputOrderFixed() {
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

function testPrintCssUsesExplicitPages() {
  assert.ok(/hall-print-page-break/i.test(HALL_ALLOTMENT_PRINT_CSS));
  assert.ok(/page-break-after:\s*always/i.test(HALL_ALLOTMENT_PRINT_CSS));
  assert.ok(/hall-screen-preview/i.test(HALL_ALLOTMENT_PRINT_CSS));
  assert.ok(/margin:\s*12mm 10mm 22mm 10mm/i.test(HALL_ALLOTMENT_PAGE_STYLE));
  assert.ok(getHallPrintUsableHeightPx() > 700);
  console.log("✓ print CSS uses explicit page blocks + footer margins");
}

function testPaginateKeepsSmallSessionsTogether() {
  const halls = [
    makeHall("H1", 2, { examStartTime: "08:30", examEndTime: "11:00", id: "a" }),
    makeHall("H2", 2, { examStartTime: "08:30", examEndTime: "11:00", id: "b" }),
  ];
  const entries = groupHallsByExamTime(halls);
  const { pages } = paginateHallAllotmentForPrint(entries, (hs) => `T:${hs[0].examStartTime}`);
  assert.strictEqual(pages.length, 1);
  assert.strictEqual(pages[0].blocks.length, 1);
  assert.strictEqual(pages[0].blocks[0].rows.length, 4);
  console.log("✓ small single session packs onto one page");
}

function testPaginateMultiSessionNoOrphanTitle() {
  // Many halls in first session force page overflow; second session must not
  // start without room for title+thead+row, and chronology is preserved.
  const session1 = Array.from({ length: 18 }, (_, i) =>
    makeHall(`A${i}`, 2, {
      examDate: "2026-10-23",
      examStartTime: "08:30",
      examEndTime: "11:00",
      id: `a${i}`,
    })
  );
  const session2 = Array.from({ length: 6 }, (_, i) =>
    makeHall(`B${i}`, 2, {
      examDate: "2026-10-23",
      examStartTime: "09:30",
      examEndTime: "13:00",
      id: `b${i}`,
    })
  );
  const entries = groupHallsByExamTime([...session2, ...session1]); // wrong input order
  assert.strictEqual(entries[0][1][0].examStartTime, "08:30");
  assert.strictEqual(entries[1][1][0].examStartTime, "09:30");

  const { pages, usableHeightPx } = paginateHallAllotmentForPrint(
    entries,
    (hs) => `Exam Time: ${hs[0].examStartTime}`
  );

  assert.ok(pages.length >= 2, "expected multiple print pages");

  for (const page of pages) {
    assert.ok(page.usedPx <= usableHeightPx + 1, `page ${page.pageIndex} overflows usable height`);
    for (const block of page.blocks) {
      assert.ok(block.title, "block missing session title");
      assert.ok(block.rows.length >= 1, "orphan title without data rows");
    }
  }

  // First session content appears before second session content across pages.
  const titles = pages.flatMap((p) => p.blocks.map((b) => b.title));
  const firstB = titles.findIndex((t) => t.includes("09:30"));
  const lastA = titles.map((t, i) => (t.includes("08:30") ? i : -1)).filter((i) => i >= 0).pop();
  assert.ok(firstB > lastA || (firstB >= 0 && lastA >= 0 && firstB > lastA) || lastA < firstB);
  // Simpler: every 08:30 block index < every 09:30 block in flattened order
  let seen930 = false;
  for (const t of titles) {
    if (t.includes("09:30")) seen930 = true;
    if (seen930) assert.ok(!t.includes("08:30") || t.includes("09:30"));
  }

  const totalRows = pages.reduce(
    (s, p) => s + p.blocks.reduce((bs, b) => bs + b.rows.length, 0),
    0
  );
  assert.strictEqual(totalRows, 18 * 2 + 6 * 2);

  console.log(`✓ multi-session pagination: ${pages.length} pages, no orphan titles, order preserved`);
}

function testPaginateKeepsHallGroupWhenPossible() {
  const geometry = { ...HALL_PRINT_GEOMETRY };
  // One hall with 3 rows near the end of a page should move as a group.
  const tallRows = 12;
  const halls = [
    makeHall("FILL", tallRows, { examStartTime: "08:30", id: "fill" }),
    makeHall("KEEP", 3, { examStartTime: "08:30", id: "keep" }),
  ];
  const entries = groupHallsByExamTime(halls);
  const { pages } = paginateHallAllotmentForPrint(
    entries,
    (hs) => `T:${hs[0].examStartTime}`,
    geometry
  );

  const keepChunks = pages.flatMap((p) =>
    p.blocks.flatMap((b) => {
      const rows = b.rows.filter((r) => r.hallNo === "KEEP");
      return rows.length ? [rows] : [];
    })
  );
  assert.strictEqual(keepChunks.length, 1, "KEEP hall should not split across pages");
  assert.strictEqual(keepChunks[0].length, 3);
  console.log("✓ hall group kept together when it fits on next page");
}

function testPaginateSplitsOversizedHallCleanly() {
  const usable = getHallPrintUsableHeightPx();
  // Force a hall taller than one full page of rows.
  const rowsNeeded = Math.ceil(usable / HALL_PRINT_GEOMETRY.rowPx) + 5;
  const halls = [makeHall("HUGE", rowsNeeded, { examStartTime: "08:30", id: "huge" })];
  const entries = groupHallsByExamTime(halls);
  const { pages } = paginateHallAllotmentForPrint(entries, () => "Session");

  assert.ok(pages.length >= 2, "oversized hall must span pages");
  const allRows = pages.flatMap((p) => p.blocks.flatMap((b) => b.rows));
  assert.strictEqual(allRows.length, rowsNeeded);
  // Continuity of hallRowIndex
  allRows.forEach((r, i) => assert.strictEqual(r.hallRowIndex, i));
  for (const page of pages) {
    for (const block of page.blocks) {
      assert.ok(block.rows.length >= 1);
      assert.ok(block.title);
    }
  }
  console.log(`✓ oversized hall splits cleanly across ${pages.length} pages`);
}

function testRowHeightGrowsWithContent() {
  const shortH = estimatePrintRowHeight({ rollNos: "A", courseCodes: ["X"] });
  const longH = estimatePrintRowHeight({
    rollNos: "A".repeat(120),
    courseCodes: ["LONGCOURSECODE1", "LONGCOURSECODE2", "LONGCOURSECODE3"],
  });
  assert.ok(longH > shortH);
  console.log("✓ row height estimate grows with wrapped content");
}

testParseTimes();
testWrongInputOrderFixed();
testMultiDate();
testEqualStartTimes();
testSsFormat();
testPrintCssUsesExplicitPages();
testPaginateKeepsSmallSessionsTogether();
testPaginateMultiSessionNoOrphanTitle();
testPaginateKeepsHallGroupWhenPossible();
testPaginateSplitsOversizedHallCleanly();
testRowHeightGrowsWithContent();
console.log("\nAll hall export order checks passed.");
