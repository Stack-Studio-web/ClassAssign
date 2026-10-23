/**
 * Datewise Seating Allotment PDF — A4 landscape, print-ready.
 * Absentees & Signature blank for handwriting. No attendance data.
 */
import { jsPDF } from "jspdf";
import hallKctLogoUrl from "../assets/hall_kct.png";
import logoKsiUrl from "../assets/logo KSI.png";
import { DEFAULT_EXPORT_HEADER } from "../hooks/useExportHeaderSettings";

const MARGIN = 12;
const FONT = "helvetica";
const LINE = 0.3;
const HEADER_H = 8;
const ROW_H = 11;
/** Space reserved at bottom of every page so Grand Total + AEC/HOD/COE fit on last table page */
const FOOTER_BLOCK_H = 28;
const PAGE_NUM_H = 7;
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

async function loadLogoDataUrl(logoType = "KCT") {
  const src = String(logoType).toUpperCase() === "KSI" ? logoKsiUrl : hallKctLogoUrl;
  try {
    const res = await fetch(src);
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

function normalizeHeaderOptions(headerOptions) {
  const h = headerOptions || {};
  const logoType =
    String(h.logoType || h.logo || DEFAULT_EXPORT_HEADER.logo).toUpperCase() ===
    "KSI"
      ? "KSI"
      : "KCT";
  const isSfs = Boolean(h.isSfs);
  return {
    logoType,
    isSfs,
    departmentLine: String(
      h.departmentLine ?? h.department ?? DEFAULT_EXPORT_HEADER.department ?? ""
    ).trim(),
    programmeLine1: String(
      h.programmeLine1 ?? h.program1 ?? DEFAULT_EXPORT_HEADER.program1 ?? ""
    ).trim(),
    programmeLine2: String(
      h.programmeLine2 ?? h.program2 ?? DEFAULT_EXPORT_HEADER.program2 ?? ""
    ).trim(),
    sfsLine1: String(
      h.sfsLine1 || DEFAULT_EXPORT_HEADER.sfsLine1 || ""
    ).trim(),
    sfsLine2: String(
      h.sfsLine2 || DEFAULT_EXPORT_HEADER.sfsLine2 || ""
    ).trim(),
  };
}

/** Approximate doc-header height (mm) for pagination. */
function estimateHeaderBlockH(header, hasLogo) {
  let h = MARGIN;
  h += hasLogo ? (header.logoType === "KSI" ? 22 : 20) : 0;
  // custom lines
  if (header.isSfs) {
    if (header.sfsLine1) h += 5;
    if (header.sfsLine2) h += 5;
  } else {
    if (header.departmentLine) h += 4.5;
    if (header.programmeLine1) h += 4.5;
    if (header.programmeLine2) h += 4.5;
  }
  h += 8; // report title
  h += 5; // date
  h += 5; // exam time
  h += 4; // gap before table
  h += HEADER_H;
  return h;
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

function drawDocHeader(pdf, meta, logoDataUrl, header) {
  let y = MARGIN;
  const w = usableWidth(pdf);
  const isKsi = header.logoType === "KSI";

  if (logoDataUrl) {
    try {
      const logoW = isKsi ? 28 : 72;
      const logoH = isKsi ? 20 : 18;
      pdf.addImage(
        logoDataUrl,
        "PNG",
        MARGIN + w / 2 - logoW / 2,
        y,
        logoW,
        logoH
      );
      y += logoH + 2;
    } catch {
      /* logo optional */
    }
  }

  pdf.setTextColor(0, 0, 0);
  pdf.setFont(FONT, "bold");
  pdf.setFontSize(9);

  if (header.isSfs) {
    if (header.sfsLine1) {
      pdf.text(header.sfsLine1, MARGIN + w / 2, y + 3.5, { align: "center" });
      y += 5;
    }
    if (header.sfsLine2) {
      pdf.setFont(FONT, "normal");
      pdf.setFontSize(8);
      pdf.text(header.sfsLine2, MARGIN + w / 2, y + 3.5, { align: "center" });
      y += 5;
    }
  } else {
    if (header.departmentLine) {
      pdf.setFont(FONT, "normal");
      pdf.setFontSize(8);
      pdf.text(header.departmentLine, MARGIN + w / 2, y + 3.5, {
        align: "center",
      });
      y += 4.5;
    }
    if (header.programmeLine1) {
      pdf.setFont(FONT, "bold");
      pdf.setFontSize(8);
      pdf.text(header.programmeLine1, MARGIN + w / 2, y + 3.5, {
        align: "center",
      });
      y += 4.5;
    }
    if (header.programmeLine2) {
      pdf.setFont(FONT, "bold");
      pdf.setFontSize(8);
      pdf.text(header.programmeLine2, MARGIN + w / 2, y + 3.5, {
        align: "center",
      });
      y += 4.5;
    }
  }

  pdf.setFont(FONT, "bold");
  pdf.setFontSize(11);
  pdf.text("DATEWISE SEATING ALLOTMENT REPORT", MARGIN + w / 2, y + 4, {
    align: "center",
  });
  y += 7;

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
  y += 6;

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
 * Paginate rows; every page reserves bottom space for Grand Total + approvals
 * so the final block stays on the last table page (no orphan page).
 */
function paginateRows(rows, rowCapacity) {
  const pages = [];
  let i = 0;
  const capacity = Math.max(1, rowCapacity);

  while (i < rows.length) {
    const page = [];
    let used = 0;
    while (i < rows.length) {
      const span = groupSpanAt(rows, i);
      if (used + span > capacity && used > 0) break;
      const take = Math.min(span, capacity - used);
      for (let k = 0; k < take; k++) page.push(rows[i + k]);
      used += take;
      i += take;
      if (take < span) break;
    }
    pages.push(page);
  }
  if (pages.length === 0) pages.push([]);
  return pages;
}

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

/** Draw on current page without adding a new page — caller reserved space. */
function drawGrandTotalAndApprovals(pdf, y, grandTotal) {
  const w = usableWidth(pdf);
  let cy = y + 4;

  pdf.setFont(FONT, "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Grand Total Students: ${grandTotal}`, MARGIN, cy);
  cy += 8;

  const colW = w / 3;
  const labels = ["AEC", "HOD", "COE"];
  pdf.setFont(FONT, "bold");
  pdf.setFontSize(9);
  labels.forEach((label, i) => {
    pdf.text(label, MARGIN + i * colW + colW / 2, cy, { align: "center" });
  });
  cy += 12;
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
  pdf.text(`Page ${pageIndex} of ${totalPages}`, MARGIN + w / 2, h - 4, {
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
 * @param {{ headerOptions?: object }} [options]
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function generateDatewiseStatementPdf(statement, options = {}) {
  const meta = statement?.meta || {};
  const rows = Array.isArray(statement?.rows) ? statement.rows : [];
  const grandTotal =
    statement?.grandTotal ?? meta.grandTotal ?? grandTotalFromRows(rows);
  const header = normalizeHeaderOptions(options.headerOptions);
  const logoDataUrl = await loadLogoDataUrl(header.logoType);

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const cols = colLayout(pdf);
  const ph = pageHeight(pdf);

  const headerBlockH = estimateHeaderBlockH(header, Boolean(logoDataUrl));
  // Reserve footer on every page so last page never orphans Grand Total / signatures
  const rowCapacity = Math.max(
    1,
    Math.floor(
      (ph - headerBlockH - FOOTER_BLOCK_H - PAGE_NUM_H) / ROW_H
    )
  );

  const pages = paginateRows(rows, rowCapacity);
  const totalPages = pages.length;

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) pdf.addPage();
    let cy = drawDocHeader(pdf, meta, logoDataUrl, header);
    cy = drawTableHeader(pdf, cy, cols);
    cy = drawDataRows(pdf, cy, cols, pages[p]);

    if (rows.length === 0 && p === 0) {
      pdf.setFont(FONT, "normal");
      pdf.setFontSize(11);
      pdf.text("No rows for this date and session.", MARGIN, cy + 8);
      cy += 14;
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

export async function downloadDatewiseStatementPdf(statement, options = {}) {
  const { blob, filename } = await generateDatewiseStatementPdf(
    statement,
    options
  );
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
