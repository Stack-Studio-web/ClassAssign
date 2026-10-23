/**
 * Datewise Attendance Statement — A4 landscape jsPDF (black & white).
 */
import { jsPDF } from "jspdf";
import logoKctUrl from "../assets/logo.png";

const MARGIN = 12; // mm
const FONT = "helvetica";
const LINE = 0.3;
const HEADER_H = 8;
const ROW_H = 11; // ample height for handwritten signature
const COL_HEADERS = [
  "Hall No",
  "Name",
  "Branch",
  "Roll No",
  "Total Students",
  "Total Absentees",
  "Signature",
];
// Fractions of usable width
const COL_FRACS = [0.1, 0.2, 0.1, 0.22, 0.12, 0.12, 0.14];

async function loadLogoDataUrl() {
  try {
    const res = await fetch(logoKctUrl);
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

  if (logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, "PNG", MARGIN + w / 2 - 10, y, 20, 20);
    } catch {
      /* logo optional */
    }
    y += 22;
  }

  pdf.setFont(FONT, "bold");
  pdf.setFontSize(14);
  pdf.text("KUMARAGURU COLLEGE OF TECHNOLOGY", MARGIN + w / 2, y + 5, {
    align: "center",
  });
  y += 10;

  pdf.setFontSize(12);
  pdf.text("DATEWISE STATEMENT", MARGIN + w / 2, y + 4, { align: "center" });
  y += 9;

  pdf.setFont(FONT, "normal");
  pdf.setFontSize(10);
  pdf.text(`Date: ${formatDateLong(meta.date)}`, MARGIN + w / 2, y + 3, {
    align: "center",
  });
  y += 6;
  pdf.text(`Session: ${meta.label || "—"}`, MARGIN + w / 2, y + 3, {
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

function drawDataRow(pdf, y, cols, row) {
  const values = [
    row.hallNo,
    row.name,
    row.branch,
    row.rollNo,
    row.totalStudents,
    row.totalAbsentees == null ? "—" : row.totalAbsentees,
    "",
  ];
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    drawRect(pdf, col.x, y, col.w, ROW_H);
    if (i < 6) {
      drawCenteredText(pdf, values[i], col.x, y, col.w, ROW_H, {
        bold: false,
        size: i === 3 ? 7 : 8,
      });
    }
  }
  return y + ROW_H;
}

function addPageNumber(pdf, pageIndex, totalPages) {
  const w = usableWidth(pdf);
  const h = pageHeight(pdf);
  pdf.setFont(FONT, "normal");
  pdf.setFontSize(8);
  pdf.text(`Page ${pageIndex} of ${totalPages}`, MARGIN + w / 2, h - 6, {
    align: "center",
  });
}

/**
 * @param {object} statement - API payload { meta, rows }
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function generateDatewiseStatementPdf(statement) {
  const meta = statement?.meta || {};
  const rows = Array.isArray(statement?.rows) ? statement.rows : [];
  const logoDataUrl = await loadLogoDataUrl();

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const cols = colLayout(pdf);
  const bottomLimit = () => pageHeight(pdf) - MARGIN - 8;

  // First pass: paginate to know page count
  const pages = [];
  let y = drawDocHeader(pdf, meta, logoDataUrl);
  y = drawTableHeader(pdf, y, cols);
  let pageRows = [];

  const flushPage = () => {
    pages.push(pageRows);
    pageRows = [];
  };

  for (const row of rows) {
    if (y + ROW_H > bottomLimit()) {
      flushPage();
      // next page header cost
      y = MARGIN + 22 + 10 + 9 + 6 + 8; // approx header without re-measure
      y += HEADER_H;
    }
    pageRows.push(row);
    y += ROW_H;
  }
  flushPage();
  if (pages.length === 0) pages.push([]);

  // Rebuild cleanly page by page
  const totalPages = pages.length;
  for (let p = 0; p < totalPages; p++) {
    if (p > 0) pdf.addPage();
    let cy = drawDocHeader(pdf, meta, logoDataUrl);
    cy = drawTableHeader(pdf, cy, cols);
    for (const row of pages[p]) {
      if (cy + ROW_H > bottomLimit()) break;
      cy = drawDataRow(pdf, cy, cols, row);
    }
    if (rows.length === 0 && p === 0) {
      pdf.setFont(FONT, "normal");
      pdf.setFontSize(11);
      pdf.text("No rows for this date and session.", MARGIN, cy + 10);
    }
    addPageNumber(pdf, p + 1, totalPages);
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
