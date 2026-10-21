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
 * Print CSS for /Hall PDF export (react-to-print / browser print).
 * Keeps hall row-groups together and reserves space for the fixed verify footer.
 */
export const HALL_ALLOTMENT_PRINT_CSS = `
@media print {
  @page {
    size: A4 portrait;
    margin: 12mm 10mm 22mm 10mm;
  }

  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    padding-bottom: 18mm !important;
  }

  .hall-print-root {
    color: #000;
    font-size: 10pt;
  }

  .hall-print-root .hall-print-overflow {
    overflow: visible !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }

  .hall-print-root .hall-session {
    break-inside: auto;
    page-break-inside: auto;
    margin-bottom: 10mm;
  }

  .hall-print-root .hall-session-title {
    break-after: avoid;
    page-break-after: avoid;
    break-inside: avoid;
    page-break-inside: avoid;
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

  .hall-print-root table.hall-alloc-table tfoot {
    display: table-footer-group;
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
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;
