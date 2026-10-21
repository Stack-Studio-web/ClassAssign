/**
 * Chronological ordering for Hall Allotment (/Hall) export groups.
 * Sort by exam date, then actual start time (not FN/AN labels).
 */

/** Normalize HH:mm / HH:mm:ss / Date-ish strings to minutes since midnight. */
export function parseExamTimeToMinutes(value) {
  if (value == null || value === "") return Number.POSITIVE_INFINITY;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getHours() * 60 + value.getMinutes();
  }
  const s = String(value).trim();
  const match = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return Number.POSITIVE_INFINITY;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.POSITIVE_INFINITY;
  return h * 60 + m;
}

export function normalizeExamDateKey(dateInput) {
  if (!dateInput) return "";
  if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
    const y = dateInput.getFullYear();
    const mo = String(dateInput.getMonth() + 1).padStart(2, "0");
    const d = String(dateInput.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  const s = String(dateInput).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return normalizeExamDateKey(d);
}

/**
 * Compare two hall/plan rows for export order.
 * Tie-break: session label, then hall name / id for stability.
 */
export function compareHallExportSessions(a, b) {
  const dateA = normalizeExamDateKey(a.examDate ?? a.exam_date);
  const dateB = normalizeExamDateKey(b.examDate ?? b.exam_date);
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;

  const startA = parseExamTimeToMinutes(a.examStartTime ?? a.exam_start_time);
  const startB = parseExamTimeToMinutes(b.examStartTime ?? b.exam_start_time);
  if (startA !== startB) return startA - startB;

  const endA = parseExamTimeToMinutes(a.examEndTime ?? a.exam_end_time);
  const endB = parseExamTimeToMinutes(b.examEndTime ?? b.exam_end_time);
  if (endA !== endB) return endA - endB;

  const sessA = String(a.examSession ?? a.exam_session ?? "");
  const sessB = String(b.examSession ?? b.exam_session ?? "");
  if (sessA !== sessB) return sessA.localeCompare(sessB);

  const idA = String(a.id ?? a.uuid ?? a.hallNo ?? "");
  const idB = String(b.id ?? b.uuid ?? b.hallNo ?? "");
  return idA.localeCompare(idB);
}

export function sortHallsForExport(halls) {
  return [...(halls || [])].sort(compareHallExportSessions);
}

/**
 * Group halls by start-end time key, with groups ordered chronologically
 * (date then start time). Insertion order of Object.keys is not relied upon.
 */
export function groupHallsByExamTime(halls) {
  const sorted = sortHallsForExport(halls);
  const groups = new Map();
  for (const hall of sorted) {
    const start = hall.examStartTime ?? hall.exam_start_time ?? "";
    const end = hall.examEndTime ?? hall.exam_end_time ?? "";
    const date = normalizeExamDateKey(hall.examDate ?? hall.exam_date);
    const key = `${date}|${start}-${end}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(hall);
  }
  return [...groups.entries()];
}

/**
 * Print geometry for /Hall PDF (A4 portrait, CSS px @ 96dpi).
 * Bottom margin reserves the fixed Hallora verify footer.
 */
export const HALL_PRINT_GEOMETRY = {
  pageHeightPx: Math.round((297 / 25.4) * 96), // A4
  marginTopPx: Math.round((12 / 25.4) * 96),
  marginBottomPx: Math.round((22 / 25.4) * 96),
  marginXPx: Math.round((10 / 25.4) * 96),
  /** Extra slack so packed pages do not overflow and get re-split by the browser. */
  safetyPx: 48,
  reportHeaderPx: 160,
  sessionTitlePx: 36,
  theadPx: 32,
  /** Base row height; long roll/course text grows via estimatePrintRowHeight. */
  rowPx: 26,
  charsPerRollLine: 38,
  charsPerCourseLine: 15,
  sessionGapPx: 16,
  linePx: 13,
};

export function getHallPrintUsableHeightPx(geometry = HALL_PRINT_GEOMETRY) {
  return (
    geometry.pageHeightPx -
    geometry.marginTopPx -
    geometry.marginBottomPx -
    (geometry.safetyPx || 0)
  );
}

/** Conservative row height so wrapped register/course text does not overflow a packed page. */
export function estimatePrintRowHeight(row, geometry = HALL_PRINT_GEOMETRY) {
  const rollLen = String(row?.rollNos ?? "").length;
  const courseLen = Array.isArray(row?.courseCodes)
    ? row.courseCodes.join(", ").length
    : String(row?.courseCodes ?? "").length;
  const rollLines = Math.max(1, Math.ceil(rollLen / geometry.charsPerRollLine));
  const courseLines = Math.max(1, Math.ceil(courseLen / geometry.charsPerCourseLine));
  const lines = Math.max(rollLines, courseLines, 1);
  return Math.max(geometry.rowPx, 10 + lines * geometry.linePx);
}

function flattenHallRows(hall) {
  const rows = Array.isArray(hall?.rows) ? hall.rows : [];
  return rows.map((row, index) => ({
    hallNo: hall.hallNo,
    overallCount: hall.overallCount,
    yearBranch: row.yearBranch,
    courseCodes: row.courseCodes || [],
    rollNos: row.rollNos,
    count: row.count,
    hallRowIndex: index,
    hallRowCount: rows.length,
  }));
}

function hallGroupHeight(flatRows, from, to, geometry) {
  let h = 0;
  for (let i = from; i < to; i += 1) h += estimatePrintRowHeight(flatRows[i], geometry);
  return h;
}

/**
 * Pack exam sessions into explicit print pages.
 * - Never orphans a session title without thead + ≥1 data row
 * - Keeps each hall's rows together when the group fits on the current/next page
 * - Splits oversized halls at row boundaries (no mid-cell rowspan across pages)
 * - Does not force a new page per session when the next session fits
 *
 * @param {Array<[string, object[]]>} sessionEntries from groupHallsByExamTime
 * @param {(halls: object[]) => string} formatSessionTitle
 * @param {object} [geometry]
 * @returns {{ pages: object[], geometry: object }}
 */
export function paginateHallAllotmentForPrint(
  sessionEntries,
  formatSessionTitle,
  geometry = HALL_PRINT_GEOMETRY
) {
  const usable = getHallPrintUsableHeightPx(geometry);
  const pages = [];
  let page = {
    pageIndex: 0,
    showReportHeader: true,
    usedPx: geometry.reportHeaderPx,
    blocks: [],
  };

  const pushPage = () => {
    pages.push(page);
    page = {
      pageIndex: pages.length,
      showReportHeader: false,
      usedPx: 0,
      blocks: [],
    };
  };

  const remaining = () => usable - page.usedPx;

  for (const [sessionKey, halls] of sessionEntries || []) {
    const title =
      typeof formatSessionTitle === "function"
        ? formatSessionTitle(halls, sessionKey)
        : String(sessionKey);
    const flatRows = (halls || []).flatMap(flattenHallRows);
    if (flatRows.length === 0) continue;

    let cursor = 0;
    let sessionStarted = false;

    while (cursor < flatRows.length) {
      // Every table chunk carries its session title (or "continued") + thead + ≥1 row.
      const titleCost = geometry.sessionTitlePx;
      const firstRowH = estimatePrintRowHeight(flatRows[cursor], geometry);
      const minStart = titleCost + geometry.theadPx + firstRowH;

      if (minStart > remaining()) {
        pushPage();
        continue;
      }

      // Prefer keeping the whole hall group together.
      const hallStart = cursor;
      const hallEnd = hallStart + (flatRows[cursor].hallRowCount - flatRows[cursor].hallRowIndex);
      const fullHallH = hallGroupHeight(flatRows, hallStart, hallEnd, geometry);
      const roomForRows = remaining() - titleCost - geometry.theadPx;

      let takeEnd;
      if (fullHallH <= roomForRows) {
        takeEnd = hallEnd;
        // Pack additional whole halls onto this chunk while they fit.
        let look = hallEnd;
        while (look < flatRows.length) {
          const nextHallEnd = look + flatRows[look].hallRowCount;
          const nextH = hallGroupHeight(flatRows, look, nextHallEnd, geometry);
          const usedRows = hallGroupHeight(flatRows, hallStart, look, geometry);
          if (usedRows + nextH <= roomForRows) {
            takeEnd = nextHallEnd;
            look = nextHallEnd;
          } else {
            break;
          }
        }
      } else if (
        fullHallH + titleCost + geometry.theadPx <= usable &&
        (page.blocks.length > 0 || page.usedPx > (page.showReportHeader ? geometry.reportHeaderPx : 0))
      ) {
        // Hall fits on a fresh page — move it rather than splitting early.
        pushPage();
        continue;
      } else {
        // Oversized hall (or forced onto this page): take as many rows as fit.
        takeEnd = hallStart;
        let used = 0;
        while (takeEnd < hallEnd) {
          const rh = estimatePrintRowHeight(flatRows[takeEnd], geometry);
          if (takeEnd > hallStart && used + rh > roomForRows) break;
          used += rh;
          takeEnd += 1;
          if (takeEnd === hallStart + 1 && rh > roomForRows) break;
        }
        if (takeEnd === hallStart) takeEnd = hallStart + 1;
      }

      const rowsH = hallGroupHeight(flatRows, cursor, takeEnd, geometry);
      const blockH = titleCost + geometry.theadPx + rowsH + geometry.sessionGapPx;

      page.blocks.push({
        sessionKey,
        title,
        continued: sessionStarted,
        rows: flatRows.slice(cursor, takeEnd),
      });
      page.usedPx += blockH;
      cursor = takeEnd;
      sessionStarted = true;
    }
  }

  pages.push(page);

  return { pages, geometry, usableHeightPx: usable };
}

/**
 * Print CSS for /Hall PDF export (react-to-print / browser print).
 * Content is pre-packed into .hall-print-page blocks; browser must not reflow across pages.
 */
export const HALL_ALLOTMENT_PRINT_CSS = `
@media screen {
  .hall-print-root.hall-print-only {
    position: absolute;
    left: -10000px;
    top: 0;
    width: 190mm;
    pointer-events: none;
  }
}

@media print {
  @page {
    size: A4 portrait;
    margin: 12mm 10mm 22mm 10mm;
  }

  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    height: auto !important;
    overflow: visible !important;
  }

  .hall-screen-preview {
    display: none !important;
  }

  .hall-print-root.hall-print-only {
    position: static !important;
    left: auto !important;
    width: 100% !important;
    pointer-events: auto !important;
    color: #000;
    font-size: 10pt;
  }

  /* Only force a break BETWEEN packed pages — never after the last one
     (footer is a sibling, so :last-child on .hall-print-page is unreliable). */
  .hall-print-root .hall-print-page.hall-print-page-break {
    break-after: page;
    page-break-after: always;
  }

  .hall-print-root .hall-print-overflow {
    overflow: visible !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }

  .hall-print-root .hall-session-title {
    break-inside: avoid;
    page-break-inside: avoid;
    break-after: avoid;
    page-break-after: avoid;
  }

  .hall-print-root table.hall-alloc-table {
    width: 100% !important;
    min-width: 0 !important;
    table-layout: fixed;
    border-collapse: collapse;
    border: 1px solid #000;
  }

  .hall-print-root table.hall-alloc-table thead {
    display: table-header-group;
  }

  .hall-print-root table.hall-alloc-table tbody.hall-group {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .hall-print-root table.hall-alloc-table tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .hall-print-root table.hall-alloc-table th,
  .hall-print-root table.hall-alloc-table td {
    border: 1px solid #000 !important;
    padding: 4px 3px !important;
    vertical-align: middle;
    word-wrap: break-word;
    overflow-wrap: anywhere;
    font-size: 9pt !important;
    line-height: 1.25;
  }

  .hall-print-root table.hall-alloc-table th {
    background: #1f2937 !important;
    color: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .hall-print-root .hallora-verify-footer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
  }
}
`;

/** Inline @page styles passed to react-to-print pageStyle. */
export const HALL_ALLOTMENT_PAGE_STYLE = `
  @page { size: A4 portrait; margin: 12mm 10mm 22mm 10mm; }
  @media print {
    html, body {
      height: auto !important;
      overflow: visible !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;
