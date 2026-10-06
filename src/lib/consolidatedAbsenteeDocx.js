/**
 * Client-side Consolidated Absentees List DOCX (editable Word table).
 * One academic batch per Word section (page break). Each batch page has
 * Dept. Exam coordinator + HOD signatures. Hallora e-verify is document-level
 * (last batch page only).
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  convertInchesToTwip,
} from "docx";
import { saveAs } from "file-saver";
import logoKctUrl from "../assets/logo.png";
import logoKsiUrl from "../assets/KSI logo.png";

const THIN = { style: BorderStyle.SINGLE, size: 8, color: "000000" };
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const COL_WIDTHS = [1400, 900, 1400, 2200, 1100, 2600];
const PAGE_MARGINS = {
  top: convertInchesToTwip(0.6),
  bottom: convertInchesToTwip(0.6),
  left: convertInchesToTwip(0.6),
  right: convertInchesToTwip(0.6),
};

async function fetchImageBytes(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function formatGeneratedAt(isoOrDate) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function p(text, opts = {}) {
  const {
    bold = false,
    size = 20,
    center = true,
    before = 0,
    after = 60,
    italics = false,
  } = opts;
  return new Paragraph({
    alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before, after },
    children: [
      new TextRun({
        text: String(text ?? ""),
        bold,
        italics,
        size,
        font: "Times New Roman",
      }),
    ],
  });
}

function cell(text, opts = {}) {
  const { bold = false, center = true, width = 1500, fontSize = 16 } = opts;
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [
          new TextRun({
            text: String(text ?? ""),
            bold,
            size: fontSize,
            font: "Times New Roman",
          }),
        ],
      }),
    ],
  });
}

function buildDataTable(rows) {
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell("Date of Exam", { bold: true, width: COL_WIDTHS[0], fontSize: 16 }),
      cell("Session", { bold: true, width: COL_WIDTHS[1], fontSize: 16 }),
      cell("Course Code", { bold: true, width: COL_WIDTHS[2], fontSize: 16 }),
      cell("Course Title", { bold: true, width: COL_WIDTHS[3], fontSize: 16 }),
      cell("Total no of absentees", { bold: true, width: COL_WIDTHS[4], fontSize: 14 }),
      cell("Roll No. of absentees", { bold: true, width: COL_WIDTHS[5], fontSize: 16 }),
    ],
  });

  const body = (rows || []).map(
    (row) =>
      new TableRow({
        children: [
          cell(row.examDateDisplay || row.examDate || "", {
            width: COL_WIDTHS[0],
            fontSize: 16,
          }),
          cell(row.session || "", { width: COL_WIDTHS[1], fontSize: 16 }),
          cell(row.courseCode || "", { width: COL_WIDTHS[2], fontSize: 16 }),
          cell(row.courseTitle || "", {
            width: COL_WIDTHS[3],
            center: false,
            fontSize: 15,
          }),
          cell(String(row.absenteeCount ?? 0), {
            width: COL_WIDTHS[4],
            fontSize: 16,
          }),
          cell(row.rollNumbersDisplay || "", {
            width: COL_WIDTHS[5],
            center: false,
            fontSize: 14,
          }),
        ],
      })
  );

  return new Table({
    width: { size: 9600, type: WidthType.DXA },
    columnWidths: COL_WIDTHS,
    rows: [header, ...body],
  });
}

function buildSignatureBlock() {
  return new Table({
    width: { size: 9600, type: WidthType.DXA },
    columnWidths: [4800, 4800],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: NO_BORDERS,
            width: { size: 4800, type: WidthType.DXA },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                spacing: { before: 1000, after: 40 },
                children: [
                  new TextRun({
                    text: "Dept. Exam coordinator",
                    bold: true,
                    size: 20,
                    font: "Times New Roman",
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            borders: NO_BORDERS,
            width: { size: 4800, type: WidthType.DXA },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 1000, after: 40 },
                children: [
                  new TextRun({
                    text: "HOD",
                    bold: true,
                    size: 20,
                    font: "Times New Roman",
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function buildLogoParagraph(logoBytes) {
  if (!logoBytes) return null;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new ImageRun({
        type: "png",
        data: logoBytes,
        transformation: { width: 72, height: 72 },
        altText: {
          title: "Logo",
          description: "College logo",
          name: "logo",
        },
      }),
    ],
  });
}

function buildVerificationFooter(verification, ksiLogoBytes) {
  const line = `Generated and E-Verified by HALLORA Exam Management System | Verification ID: ${
    verification?.verificationId || "—"
  } | Generated: ${formatGeneratedAt(verification?.generatedAt)}`;

  const children = [];
  if (ksiLogoBytes) {
    children.push(
      new ImageRun({
        type: "png",
        data: ksiLogoBytes,
        transformation: { width: 28, height: 28 },
        altText: {
          title: "KSI",
          description: "Kumaraguru School of Innovation logo",
          name: "ksi-logo",
        },
      })
    );
    children.push(
      new TextRun({
        text: "  ",
        font: "Times New Roman",
        size: 12,
      })
    );
  }
  children.push(
    new TextRun({
      text: line,
      bold: true,
      size: 12,
      font: "Times New Roman",
    })
  );

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 280, after: 40 },
    children,
  });
}

function buildBatchSectionChildren({
  meta,
  batch,
  logoBytes,
  ksiLogoBytes,
  verification,
  includeVerification,
}) {
  const children = [];
  const logoPara = buildLogoParagraph(logoBytes);
  if (logoPara) children.push(logoPara);

  const deptHeader =
    meta?.departmentHeader ||
    (meta?.department
      ? /^DEPARTMENT\s+OF/i.test(meta.department)
        ? meta.department
        : `DEPARTMENT OF ${meta.department}`
      : "—");

  const academicYear = batch?.academicYear || meta?.academicYear || "—";
  const yearSemester = batch?.yearSemester || meta?.yearSemester || "—";
  const examType = batch?.examType || meta?.examType || "—";
  const batchName = batch?.batchName || meta?.batchLabel || "—";

  children.push(
    p("KUMARAGURU COLLEGE OF TECHNOLOGY", { bold: true, size: 26, after: 40 })
  );
  children.push(
    p("KUMARAGURU SCHOOL OF INNOVATION", { bold: true, size: 22, after: 120 })
  );
  children.push(
    p(`Academic year (${academicYear})`, { bold: true, size: 20, after: 80 })
  );
  children.push(p(deptHeader, { bold: true, size: 22, after: 80 }));
  children.push(
    p(`Consolidated Absentees List – ${yearSemester}`, {
      bold: true,
      size: 22,
      after: 60,
    })
  );
  children.push(p(examType, { bold: true, size: 22, after: 60 }));
  children.push(
    p(`Batch: ${batchName}`, { bold: true, size: 22, after: 200 })
  );

  if (batch?.rows?.length) {
    children.push(buildDataTable(batch.rows));
  } else {
    children.push(
      p("No absentee records found for this batch.", {
        italics: true,
        size: 18,
        after: 200,
      })
    );
  }

  children.push(buildSignatureBlock());

  if (includeVerification) {
    children.push(buildVerificationFooter(verification, ksiLogoBytes));
  }

  return children;
}

function sanitizeFilename(name) {
  return String(name || "Hallora_Consolidated_Absentees")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120);
}

function dateForFilename(value) {
  const raw = String(value || "").slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return "date";
  return `${d}-${m}-${y}`;
}

function normalizeBatchSections(payload) {
  const { meta, batches, rows } = payload || {};
  if (Array.isArray(batches) && batches.length > 0) {
    return batches.filter((b) => b && (b.rows?.length || b.batchName));
  }
  // Backward compatible: single flat rows → one section
  if (Array.isArray(rows) && rows.length > 0) {
    return [
      {
        batchName: meta?.batchLabel && meta.batchLabel !== "All Batches"
          ? meta.batchLabel
          : rows[0]?.batchName || "Batch",
        batchUuid: meta?.batchUuid || rows[0]?.batchUuid || null,
        rows,
        yearSemester: meta?.yearSemester,
        examType: meta?.examType,
        academicYear: meta?.academicYear,
      },
    ];
  }
  return [];
}

/**
 * @param {{ meta: object, batches?: object[], rows?: object[], verification?: { verificationId, generatedAt }, logoChoice?: "KCT"|"KSI" }} payload
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function buildConsolidatedAbsenteeDocxBlob(payload) {
  const { meta, verification, logoChoice = "KCT" } = payload;
  const batchSections = normalizeBatchSections(payload);
  if (!batchSections.length) {
    throw new Error("No absentee records found for the selected filters.");
  }

  const logoBytes = await fetchImageBytes(
    logoChoice === "KSI" ? logoKsiUrl : logoKctUrl
  );
  const ksiLogoBytes = await fetchImageBytes(logoKsiUrl);

  const sections = batchSections.map((batch, idx) => ({
    properties: {
      page: {
        margin: PAGE_MARGINS,
      },
    },
    children: buildBatchSectionChildren({
      meta,
      batch,
      logoBytes,
      ksiLogoBytes,
      verification,
      includeVerification: idx === batchSections.length - 1,
    }),
  }));

  const doc = new Document({ sections });
  const blob = await Packer.toBlob(doc);

  const deptShort = sanitizeFilename(meta?.department || "DEPT").slice(0, 20);
  const examShort = sanitizeFilename(meta?.examType || "Exam");
  const from = dateForFilename(meta?.dateFrom);
  const to = dateForFilename(meta?.dateTo);
  let filename;
  if (meta?.batchUuid && batchSections.length === 1) {
    const batchShort = sanitizeFilename(batchSections[0].batchName);
    filename = `${sanitizeFilename(
      `Hallora_Consolidated_Absentees_${deptShort}_${examShort}_${batchShort}_${from}_to_${to}`
    )}.docx`;
  } else if (meta?.courseCode && batchSections.length === 1 && meta?.batchUuid) {
    filename = `${sanitizeFilename(
      `Hallora_Absentees_${meta.courseCode}_${examShort}_${from}_to_${to}`
    )}.docx`;
  } else if (batchSections.length > 1 || !meta?.batchUuid) {
    filename = `${sanitizeFilename(
      `Hallora_Consolidated_Absentees_${deptShort}_${examShort}_${from}_to_${to}_All-Batches`
    )}.docx`;
  } else {
    filename = `${sanitizeFilename(
      `Hallora_Consolidated_Absentees_${deptShort}_${examShort}_${from}_to_${to}`
    )}.docx`;
  }

  return { blob, filename };
}

export async function downloadConsolidatedAbsenteeDocx(payload) {
  const { blob, filename } = await buildConsolidatedAbsenteeDocxBlob(payload);
  saveAs(blob, filename);
  return { blob, filename };
}
