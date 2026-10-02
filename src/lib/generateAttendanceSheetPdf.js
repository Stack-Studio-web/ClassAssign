/**
 * Native text/vector attendance-sheet PDF (jsPDF).
 * Matches the existing Hallora attendance sheet layout.
 * Does NOT rasterize the page — text is selectable/searchable.
 */
import { jsPDF } from "jspdf";
import KCT from "../assets/logo.png";
import KSI from "../assets/KSI logo.png";

const MARGIN = 10; // mm
const HEADER_ROW = 7;
const META_ROW = 6.5;
const TABLE_HEADER_H = 8;
const BASE_ROW_H = 8;
const FOOTER_BLOCK_H = 28;
const HALLORA_VERIFY_H = 10; // mm reserved at page bottom for e-verify footer
const LINE = 0.25;
const FONT = "helvetica";

const COL_FRACS = [0.05, 0.12, 0.23, 0.05, 0.25, 0.15, 0.15];
const COL_HEADERS = [
  "S.No",
  "Roll No.",
  "Name of the candidate",
  "Sec",
  "Answer Booklet Number",
  "Signature",
  "Roll No. of Absentees",
];

function formatExamDate(examDate) {
  if (!examDate) return "";
  try {
    return new Date(examDate).toLocaleDateString("en-GB");
  } catch {
    return String(examDate);
  }
}

function contentWidth(pdf) {
  return pdf.internal.pageSize.getWidth() - MARGIN * 2;
}

function pageHeight(pdf) {
  return pdf.internal.pageSize.getHeight();
}

function colXs(pdf) {
  const w = contentWidth(pdf);
  const xs = [];
  let x = MARGIN;
  for (const f of COL_FRACS) {
    xs.push({ x, w: w * f });
    x += w * f;
  }
  return xs;
}

function drawRect(pdf, x, y, w, h, fill = null) {
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(LINE);
  if (fill) {
    pdf.setFillColor(fill[0], fill[1], fill[2]);
    pdf.rect(x, y, w, h, "FD");
  } else {
    pdf.rect(x, y, w, h, "S");
  }
}

function drawCellText(pdf, text, x, y, w, h, opts = {}) {
  const {
    align = "left",
    bold = false,
    size = 8,
    upper = false,
    padX = 1.2,
    padY = 1.5,
  } = opts;
  pdf.setFont(FONT, bold ? "bold" : "normal");
  pdf.setFontSize(size);
  pdf.setTextColor(0, 0, 0);
  let value = text == null ? "" : String(text);
  if (upper) value = value.toUpperCase();

  const maxW = Math.max(2, w - padX * 2);
  const lines = pdf.splitTextToSize(value, maxW);
  const lineH = size * 0.4;
  const blockH = lines.length * lineH;
  let ty = y + padY + lineH * 0.75;
  if (opts.vCenter && blockH < h - padY * 2) {
    ty = y + (h - blockH) / 2 + lineH * 0.75;
  }

  for (const line of lines) {
    let tx = x + padX;
    if (align === "center") {
      tx = x + w / 2;
      pdf.text(line, tx, ty, { align: "center" });
    } else if (align === "right") {
      tx = x + w - padX;
      pdf.text(line, tx, ty, { align: "right" });
    } else {
      pdf.text(line, tx, ty);
    }
    ty += lineH;
  }
  return Math.max(h, padY * 2 + lines.length * lineH + 0.5);
}

function measureWrappedHeight(pdf, text, w, size = 8, padY = 1.5) {
  pdf.setFontSize(size);
  const lines = pdf.splitTextToSize(String(text || ""), Math.max(2, w - 2.4));
  const lineH = size * 0.4;
  return Math.max(BASE_ROW_H, padY * 2 + lines.length * lineH + 0.5);
}

function drawBookletBoxes(pdf, x, y, w, h) {
  const n = 9;
  const boxW = w / n;
  const boxH = Math.min(6.5, h - 1);
  const by = y + (h - boxH) / 2;
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(LINE);
  for (let i = 0; i < n; i++) {
    pdf.rect(x + i * boxW, by, boxW, boxH, "S");
  }
}

/**
 * Sheet header block (logos + meta). Returns bottom Y.
 * Logos are small images only (not a page screenshot).
 */
function drawSheetHeader(pdf, { category, examDate, examSession, hallNo, courseCode, courseName, logos }) {
  const w = contentWidth(pdf);
  let y = MARGIN;
  const logoColW = w * 0.12;
  const rightColW = w * 0.15;
  const midW = w - logoColW - rightColW;
  const topH = HEADER_ROW * 2;

  // Row 1-2: logos + college title
  drawRect(pdf, MARGIN, y, logoColW, topH);
  drawRect(pdf, MARGIN + logoColW, y, midW, HEADER_ROW);
  drawRect(pdf, MARGIN + logoColW + midW, y, rightColW, topH);

  if (logos?.kct) {
    try {
      pdf.addImage(logos.kct, "PNG", MARGIN + 2, y + 2, logoColW - 4, topH - 4);
    } catch {
      /* logo optional */
    }
  }
  if (logos?.ksi) {
    try {
      pdf.addImage(logos.ksi, "PNG", MARGIN + logoColW + midW + 1.5, y + 2.5, rightColW - 3, topH - 5);
    } catch {
      /* logo optional */
    }
  }

  drawCellText(
    pdf,
    "KUMARAGURU COLLEGE OF TECHNOLOGY, COIMBATORE - 49",
    MARGIN + logoColW,
    y,
    midW,
    HEADER_ROW,
    { align: "center", bold: true, size: 9, vCenter: true }
  );
  drawRect(pdf, MARGIN + logoColW, y + HEADER_ROW, midW, HEADER_ROW);
  drawCellText(pdf, "ATTENDANCE SHEET", MARGIN + logoColW, y + HEADER_ROW, midW, HEADER_ROW, {
    align: "center",
    bold: true,
    size: 10,
    vCenter: true,
  });

  y += topH;

  // Category
  drawRect(pdf, MARGIN, y, w, META_ROW, [249, 250, 251]);
  drawCellText(pdf, category || "", MARGIN, y, w, META_ROW, {
    align: "center",
    bold: true,
    size: 10,
    vCenter: true,
  });
  y += META_ROW;

  // Date / Session / Degree / Branch
  const q = w / 4;
  drawRect(pdf, MARGIN, y, q, META_ROW);
  drawRect(pdf, MARGIN + q, y, q, META_ROW);
  drawRect(pdf, MARGIN + 2 * q, y, q, META_ROW);
  drawRect(pdf, MARGIN + 3 * q, y, q, META_ROW);
  drawCellText(pdf, `Date: ${formatExamDate(examDate)}`, MARGIN, y, q, META_ROW, {
    bold: false,
    size: 8,
    vCenter: true,
  });
  drawCellText(pdf, `Session: ${examSession || ""}`, MARGIN + q, y, q, META_ROW, {
    align: "center",
    size: 8,
    vCenter: true,
  });
  drawCellText(pdf, "Degree:", MARGIN + 2 * q, y, q, META_ROW, {
    align: "center",
    size: 8,
    vCenter: true,
  });
  drawCellText(pdf, "Branch:", MARGIN + 3 * q, y, q, META_ROW, {
    size: 8,
    vCenter: true,
  });
  y += META_ROW;

  // Hall / Course
  const h1 = w * 0.25;
  const h2 = w * 0.35;
  const h3 = w - h1 - h2;
  drawRect(pdf, MARGIN, y, h1, META_ROW);
  drawRect(pdf, MARGIN + h1, y, h2, META_ROW);
  drawRect(pdf, MARGIN + h1 + h2, y, h3, META_ROW);
  drawCellText(pdf, `Hall No: ${hallNo || ""}`, MARGIN, y, h1, META_ROW, {
    size: 8,
    vCenter: true,
  });
  drawCellText(pdf, `Course Code: ${courseCode || ""}`, MARGIN + h1, y, h2, META_ROW, {
    size: 8,
    vCenter: true,
  });
  drawCellText(pdf, `Course Name: ${courseName || ""}`, MARGIN + h1 + h2, y, h3, META_ROW, {
    size: 8,
    vCenter: true,
  });
  y += META_ROW;

  return y;
}

function drawTableHeader(pdf, y) {
  const cols = colXs(pdf);
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    drawRect(pdf, c.x, y, c.w, TABLE_HEADER_H);
    drawCellText(pdf, COL_HEADERS[i], c.x, y, c.w, TABLE_HEADER_H, {
      align: "center",
      bold: true,
      size: 7.5,
      vCenter: true,
    });
  }
  return y + TABLE_HEADER_H;
}

function drawStudentRow(pdf, y, student, rowH) {
  const cols = colXs(pdf);
  const cells = [
    { text: String(student.sno), align: "center", size: 8 },
    { text: student.regNo, align: "center", size: 8 },
    { text: student.name, align: "left", size: 8, upper: true },
    { text: "", align: "center", size: 8 },
    { text: null, booklet: true },
    { text: "", align: "center", size: 8 },
    { text: "", align: "center", size: 8 },
  ];

  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    drawRect(pdf, c.x, y, c.w, rowH);
    if (cells[i].booklet) {
      drawBookletBoxes(pdf, c.x, y, c.w, rowH);
    } else {
      drawCellText(pdf, cells[i].text, c.x, y, c.w, rowH, {
        align: cells[i].align,
        size: cells[i].size,
        upper: cells[i].upper,
        vCenter: true,
      });
    }
  }
  return y + rowH;
}

function drawFooter(pdf, y) {
  const w = contentWidth(pdf);
  const r1 = 8;
  const r2 = 8;
  const r3 = 12;
  const c1 = w * 0.45;
  const c2 = w * 0.2;
  const c3 = w - c1 - c2;

  drawRect(pdf, MARGIN, y, c1, r1);
  drawRect(pdf, MARGIN + c1, y, c2, r1);
  drawRect(pdf, MARGIN + c1 + c2, y, c3, r1);
  drawCellText(pdf, "Page Total Present:", MARGIN, y, c1, r1, {
    bold: true,
    size: 8,
    vCenter: true,
  });
  drawBookletBoxes(pdf, MARGIN + c1, y, c2, r1);
  drawCellText(pdf, "Signature of Invigilator", MARGIN + c1 + c2, y, c3, r1, {
    bold: true,
    size: 8,
    vCenter: true,
  });
  y += r1;

  drawRect(pdf, MARGIN, y, c1, r2);
  drawRect(pdf, MARGIN + c1, y, c2, r2);
  drawRect(pdf, MARGIN + c1 + c2, y, c3, r2);
  drawCellText(pdf, "Page Total Absent:", MARGIN, y, c1, r2, {
    bold: true,
    size: 8,
    vCenter: true,
  });
  drawBookletBoxes(pdf, MARGIN + c1, y, c2, r2);
  drawCellText(pdf, "Name:", MARGIN + c1 + c2, y, c3, r2, {
    bold: true,
    size: 8,
    vCenter: true,
  });
  y += r2;

  drawRect(pdf, MARGIN, y, w, r3);
  drawCellText(
    pdf,
    "Name & Signature of Exam Co-Ordinator",
    MARGIN,
    y,
    w,
    r3,
    { align: "center", bold: true, size: 9, upper: true, vCenter: true }
  );
  return y + r3;
}

async function loadImageAsDataUrl(src) {
  if (!src) return null;
  try {
    const res = await fetch(src);
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

function resolveVerificationId(verification) {
  return verification?.verificationId || verification?.verification_id || "";
}

function drawHalloraVerifyFooter(pdf, verification) {
  const verificationId = resolveVerificationId(verification);
  if (!verificationId) return;
  const w = contentWidth(pdf);
  const ph = pageHeight(pdf);
  const y = ph - MARGIN - HALLORA_VERIFY_H + 1;
  pdf.setDrawColor(120, 120, 120);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN, y, MARGIN + w, y);

  const when = (() => {
    try {
      const d = new Date(
        verification.generatedAt || verification.generated_at || Date.now()
      );
      return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "";
    }
  })();

  pdf.setFont(FONT, "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(60, 60, 60);
  pdf.text(
    "Generated and E-Verified by HALLORA | Exam Management System",
    MARGIN + w / 2,
    y + 3.5,
    { align: "center" }
  );
  pdf.text(
    `Verification ID: ${verificationId} | Generated: ${when}`,
    MARGIN + w / 2,
    y + 7,
    { align: "center" }
  );
  pdf.setTextColor(0, 0, 0);
}

function stampHalloraFooterOnAllPages(pdf, verification) {
  if (!resolveVerificationId(verification)) return;
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    drawHalloraVerifyFooter(pdf, verification);
  }
}

/**
 * Build one venue attendance PDF (all courses) as a jsPDF instance.
 * @param {object} [verification] Hallora e-verify footer { verificationId, generatedAt }
 */
export async function buildAttendanceSheetPdf(
  attendanceData,
  category,
  logos = null,
  verification = null
) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const resolvedLogos =
    logos || {
      kct: await loadImageAsDataUrl(KCT),
      ksi: await loadImageAsDataUrl(KSI),
    };

  const courses = attendanceData?.courses || [];
  let firstPage = true;
  const pageBottomReserve = () =>
    pageHeight(pdf) - MARGIN - FOOTER_BLOCK_H - (verification ? HALLORA_VERIFY_H : 0);

  for (const course of courses) {
    if (!firstPage) pdf.addPage();
    firstPage = false;

    const courseCode = course.courseCode ?? course.coursecode ?? "";
    const courseName = course.courseName ?? course.coursename ?? "";
    const students = (course.students || []).map((s, i) => ({
      sno: i + 1,
      regNo: s.regNo ?? s.regnno ?? s.regn_no ?? "",
      name: s.name ?? s.student_name ?? "",
    }));

    const headerCtx = {
      category,
      examDate: attendanceData.examDate,
      examSession: attendanceData.examSession,
      hallNo: attendanceData.hallNo,
      courseCode,
      courseName,
      logos: resolvedLogos,
    };

    let y = drawSheetHeader(pdf, headerCtx);
    y = drawTableHeader(pdf, y);

    const cols = colXs(pdf);
    const nameColW = cols[2].w;
    const bottomLimit = pageBottomReserve;

    for (const student of students) {
      const rowH = measureWrappedHeight(pdf, student.name, nameColW, 8);

      if (y + rowH > bottomLimit()) {
        if (y + FOOTER_BLOCK_H <= pageHeight(pdf) - MARGIN - (verification ? HALLORA_VERIFY_H : 0)) {
          drawFooter(pdf, y);
        } else {
          drawFooter(pdf, bottomLimit());
        }
        pdf.addPage();
        y = drawSheetHeader(pdf, headerCtx);
        y = drawTableHeader(pdf, y);
      }

      y = drawStudentRow(pdf, y, student, rowH);
    }

    const maxY =
      pageHeight(pdf) - MARGIN - (verification ? HALLORA_VERIFY_H : 0);
    if (y + FOOTER_BLOCK_H > maxY) {
      pdf.addPage();
      y = drawSheetHeader(pdf, headerCtx);
      y = drawTableHeader(pdf, y);
    }
    drawFooter(pdf, y);
  }

  if (courses.length === 0) {
    pdf.setFont(FONT, "normal");
    pdf.setFontSize(11);
    pdf.text("No students found for this venue.", MARGIN, MARGIN + 20);
  }

  stampHalloraFooterOnAllPages(pdf, verification);
  return pdf;
}

/**
 * Generate a PDF Blob for one venue attendance sheet.
 */
export async function generateAttendanceSheetPdfBlob(
  attendanceData,
  category,
  logos = null,
  verification = null
) {
  const pdf = await buildAttendanceSheetPdf(
    attendanceData,
    category,
    logos,
    verification
  );
  return pdf.output("blob");
}

/**
 * Preload logos once for multi-venue ZIP generation.
 */
export async function preloadAttendanceLogos() {
  return {
    kct: await loadImageAsDataUrl(KCT),
    ksi: await loadImageAsDataUrl(KSI),
  };
}
