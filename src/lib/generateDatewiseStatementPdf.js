/**
 * Datewise Seating Allotment PDF — A4 landscape, print-ready.
 * Absentees & Signature blank for handwriting. No attendance data.
 */
import { jsPDF } from "jspdf";
import hallKctLogoUrl from "../assets/hall_kct.png";

const MARGIN = 12;
const FONT = "helvetica";
const LINE = 0.3;
const HEADER_H = 8;
const ROW_H = 12;
const FOOTER_BLOCK_H = 30;
const COL_HEADERS = [
  "Hall No",
  "Faculty",
  "Branch",
  "Roll No's",
  "Total",
  "Absentees",
  "Signature",
];
const COL_FRACS = [0.09, 0.14, 0.08, 0.28, 0.07, 0.18, 0.16];

async function loadLogoDataUrl() {
  try {
    const res = await fetch(hallKctLogoUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function formatDateLong(dateValue) {
  const raw = String(dateValue || "");
  const d =
    raw && !raw.includes("T")
      ? new Date(`${raw.slice(0, 10)}T12:00:00`)
      : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return String(dateValue || "");
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function sanitizeFilenamePart(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

function usableWidth(pdf) {
  return pdf.internal.pageSize.getWidth() - MARGIN * 2;
}

function pageHeight(pdf) {
  return pdf.internal.pageSize.getHeight();
}

function colLayout(pdf) {
  const w = usableWidth(pdf);
  const cols = [];
  let x = MARGIN;
  for (let i = 0; i < COL_FRACS.length; i++) {
    const cw = w * COL_FRACS[i];
    cols.push({ x, w: cw, header: COL_HEADERS[i] });
    x += cw;
  }
  return cols;
}

function drawRect(pdf, x, y, w, h) {
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(LINE);
  pdf.rect(x, y, w, h, "S");
}

function drawCenteredText(pdf, text, x, y, w, h, { bold = false, size = 9 } = {}) {
  pdf.setFont(FONT, bold ? "bold" : "normal");
  pdf.setFontSize(size);
  pdf.setTextColor(0, 0, 0);
  const lines = pdf.splitTextToSize(String(text ?? ""), Math.max(2, w - 2));
  const lineH = size * 0.38;
  const blockH = lines.length * lineH;
  let ty = y + (h - blockH) / 2 + lineH * 0.8;
  for (const line of lines) {
    pdf.text(line, x + w / 2, ty, { align: "center" });
    ty += lineH;
  }
}

function drawDocHeader(pdf, meta, logoDataUrl) {
  let y = MARGIN;
  const w = usableWidth(pdf);

  // hall_kct.png is a wide lockup (seal + wordmark) — no separate college title text
  if (logoDataUrl) {
    try {
      const logoW = 72;
      const logoH = 18;
      pdf.addImage(
        logoDataUrl,
        "PNG",
        MARGIN + w / 2 - logoW / 2,
        y,
        logoW,
        logoH
      );
    } catch {
      /* logo optional */
    }
    y += 20;
  }

  pdf.setFont(FONT, "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(0, 0, 0);
  pdf.text("DATEWISE SEATING ALLOTMENT REPORT", MARGIN + w / 2, y + 4, {
    align: "center",
  });
  y += 8;

  pdf.setFont(FONT, "normal");
  pdf.setFontSize(9);
  pdf.text(`Date: ${formatDateLong(meta.date)}`, MARGIN + w / 2, y + 3, {
    align: "center",
  });
  y += 5;

  const examTime =
    meta.examTime ||
    (meta.startTime && meta.endTime
      ? `${meta.startTime} – ${meta.endTime}`
      : "—");
  pdf.text(`Exam Time: ${examTime}`, MARGIN + w / 2, y + 3, {
    align: "center",
  });
  y += 8;

  return y;
}

function drawTableHeader(pdf, y, cols) {
  for (const col of cols) {
    drawRect(pdf, col.x, y, col.w, HEADER_H);
    drawCenteredText(pdf, col.header, col.x, y, col.w, HEADER_H, {
      bold: true,
      size: 8,
    });
  }
  return y + HEADER_H;
}

/**
 * Measure how many consecutive rows share hall+faculty starting at index.
 * Uses hallSpan from annotateHallFacultyMerge when present.
 */
function groupSpanAt(rows, index) {
  const row = rows[index];
  if (row && Number(row.hallSpan) > 0) return Number(row.hallSpan);
  let j = index + 1;
  while (
    j < rows.length &&
    rows[j].hallNo === row.hallNo &&
    (rows[j].faculty || rows[j].name) === (row.faculty || row.name)
  ) {
    j += 1;
  }
  return j - index;
}

/**
 * Paginate so a hall+faculty merge group is not split across pages when practical.
 */
function paginateRows(rows, firstPageCapacity, otherPageCapacity) {
  const pages = [];
  let i = 0;
  let capacity = firstPageCapacity;

  while (i < rows.length) {
    const page = [];
    let used = 0;
    while (i < rows.length) {
      const span = groupSpanAt(rows, i);
      // If group won't fit and page empty, force at least one row
      if (used + span > capacity && used > 0) break;
      const take = Math.min(span, capacity - used);
      for (let k = 0; k < take; k++) {
        page.push(rows[i + k]);
      }
      used += take;
      i += take;
      if (take < span) break; // remainder continues next page (span redrawn)
    }
    pages.push(page);
    capacity = otherPageCapacity;
  }
  if (pages.length === 0) pages.push([]);
  return pages;
}

/** Recompute hall/faculty spans for rows on a single page (handles split groups). */
function annotatePageMerge(pageRows) {
  const out = (pageRows || []).map((r) => ({ ...r }));
  let i = 0;
  while (i < out.length) {
    let j = i + 1;
    while (
      j < out.length &&
      out[j].hallNo === out[i].hallNo &&
      (out[j].faculty || out[j].name) === (out[i].faculty || out[i].name)
    ) {
      j += 1;
    }
    const span = j - i;
    out[i].hallSpan = span;
    out[i].facultySpan = span;
    for (let k = i + 1; k < j; k++) {
      out[k].hallSpan = 0;
      out[k].facultySpan = 0;
    }
    i = j;
  }
  return out;
}

function drawDataRows(pdf, startY, cols, pageRows) {
  const rows = annotatePageMerge(pageRows);
  let y = startY;
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    const span = Math.max(1, Number(row.hallSpan) || 1);
    const mergeH = span * ROW_H;
    const faculty = row.faculty || row.name || "—";

    drawRect(pdf, cols[0].x, y, cols[0].w, mergeH);
    drawCenteredText(pdf, row.hallNo || "—", cols[0].x, y, cols[0].w, mergeH, {
      bold: true,
      size: 8,
    });
    drawRect(pdf, cols[1].x, y, cols[1].w, mergeH);
    drawCenteredText(pdf, faculty, cols[1].x, y, cols[1].w, mergeH, {
      size: 8,
    });

    for (let s = 0; s < span; s++) {
      const r = rows[i + s];
      const ry = y + s * ROW_H;
      const values = [
        null,
        null,
        r.branch || "—",
        r.rollNo || r.rollNosDisplay || "—",
        String(r.total ?? r.totalStudents ?? 0),
        "",
        "",
      ];
      for (let c = 2; c < cols.length; c++) {
        drawRect(pdf, cols[c].x, ry, cols[c].w, ROW_H);
        if (c < 5) {
          drawCenteredText(pdf, values[c], cols[c].x, ry, cols[c].w, ROW_H, {
            size: c === 3 ? 7 : 8,
          });
        }
      }
    }

    y += mergeH;
    i += span;
  }
  return y;
}

function drawGrandTotalAndApprovals(pdf, y, grandTotal) {
  const w = usableWidth(pdf);
  const h = pageHeight(pdf);
  let cy = y + 6;

  if (cy + FOOTER_BLOCK_H > h - MARGIN) {
    pdf.addPage();
    cy = MARGIN + 4;
  }

  pdf.setFont(FONT, "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Grand Total Students: ${grandTotal}`, MARGIN, cy);
  cy += 10;

  const colW = w / 3;
  const labels = ["AEC", "HOD", "COE"];
  pdf.setFont(FONT, "bold");
  pdf.setFontSize(9);
  labels.forEach((label, i) => {
    pdf.text(label, MARGIN + i * colW + colW / 2, cy, { align: "center" });
  });
  cy += 14;
  pdf.setFont(FONT, "normal");
  pdf.setFontSize(8);
  labels.forEach((_, i) => {
    pdf.text(
      "Signature: __________",
      MARGIN + i * colW + colW / 2,
      cy,
      { align: "center" }
    );
  });
}

function addPageNumber(pdf, pageIndex, totalPages) {
  const w = usableWidth(pdf);
  const h = pageHeight(pdf);
  pdf.setFont(FONT, "normal");
  pdf.setFontSize(8);
  pdf.text(`Page ${pageIndex} of ${totalPages}`, MARGIN + w / 2, h - 5, {
    align: "center",
  });
}

function grandTotalFromRows(rows) {
  return (rows || []).reduce(
    (sum, r) => sum + (Number(r.total ?? r.totalStudents) || 0),
    0
  );
}

/**
 * @param {object} statement - API payload { meta, rows, grandTotal }
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function generateDatewiseStatementPdf(statement) {
  const meta = statement?.meta || {};
  const rows = Array.isArray(statement?.rows) ? statement.rows : [];
  const grandTotal =
    statement?.grandTotal ?? meta.grandTotal ?? grandTotalFromRows(rows);
  const logoDataUrl = await loadLogoDataUrl();

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const cols = colLayout(pdf);
  const ph = pageHeight(pdf);

  // Approximate header + table-header height (lockup logo + title + date/time)
  const headerBlockH = (logoDataUrl ? 20 : 0) + 8 + 5 + 5 + 8 + HEADER_H;
  const firstCapacity = Math.max(
    1,
    Math.floor((ph - MARGIN - FOOTER_BLOCK_H - 10 - headerBlockH) / ROW_H)
  );
  const otherCapacity = Math.max(
    1,
    Math.floor((ph - MARGIN - 10 - headerBlockH) / ROW_H)
  );

  const pages = paginateRows(rows, firstCapacity, otherCapacity);
  const totalPages = pages.length;

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) pdf.addPage();
    let cy = drawDocHeader(pdf, meta, logoDataUrl);
    cy = drawTableHeader(pdf, cy, cols);
    cy = drawDataRows(pdf, cy, cols, pages[p]);

    if (rows.length === 0 && p === 0) {
      pdf.setFont(FONT, "normal");
      pdf.setFontSize(11);
      pdf.text("No rows for this date and session.", MARGIN, cy + 10);
      cy += 16;
    }

    if (p === totalPages - 1) {
      drawGrandTotalAndApprovals(pdf, cy, grandTotal);
    }
  }

  const finalPageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= finalPageCount; p++) {
    pdf.setPage(p);
    addPageNumber(pdf, p, finalPageCount);
  }

  const sessionPart = sanitizeFilenamePart(
    meta.examSession || meta.label || "SESSION"
  );
  const datePart = sanitizeFilenamePart(meta.date || "DATE");
  const filename = `Datewise_${datePart}_${sessionPart}.pdf`;
  const blob = pdf.output("blob");
  return { blob, filename };
}

export async function downloadDatewiseStatementPdf(statement) {
  const { blob, filename } = await generateDatewiseStatementPdf(statement);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return filename;
}
