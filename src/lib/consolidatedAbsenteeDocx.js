/**
 * Client-side Consolidated Absentees List DOCX (editable Word table).
 * Mirrors the attendance export server layout; uses frontend `docx` package.
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
import logoKsiUrl from "../assets/logo KSI.png";

const THIN = { style: BorderStyle.SINGLE, size: 8, color: "000000" };
const BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const COL_WIDTHS = [1400, 900, 1400, 2200, 1100, 2600];

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

/**
 * @param {{ meta: object, rows: object[], verification?: { verificationId, generatedAt }, logoChoice?: "KCT"|"KSI" }} payload
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function buildConsolidatedAbsenteeDocxBlob(payload) {
  const { meta, rows, verification, logoChoice = "KCT" } = payload;
  const children = [];
  const logoBytes = await fetchImageBytes(
    logoChoice === "KSI" ? logoKsiUrl : logoKctUrl
  );

  if (logoBytes) {
    children.push(
      new Paragraph({
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
      })
    );
  }

  const deptHeader =
    meta?.departmentHeader ||
    (meta?.department
      ? /^DEPARTMENT\s+OF/i.test(meta.department)
        ? meta.department
        : `DEPARTMENT OF ${meta.department}`
      : "—");

  children.push(
    p("KUMARAGURU COLLEGE OF TECHNOLOGY", { bold: true, size: 26, after: 40 })
  );
  children.push(
    p("KUMARAGURU SCHOOL OF INNOVATION", { bold: true, size: 22, after: 120 })
  );
  children.push(
    p(`Academic year (${meta?.academicYear || "—"})`, {
      bold: true,
      size: 20,
      after: 80,
    })
  );
  children.push(p(deptHeader, { bold: true, size: 22, after: 80 }));
  children.push(
    p(`Consolidated Absentees List – ${meta?.yearSemester || "—"}`, {
      bold: true,
      size: 22,
      after: 60,
    })
  );
  children.push(p(meta?.examType || "—", { bold: true, size: 22, after: 200 }));
  children.push(buildDataTable(rows));
  children.push(new Paragraph({ text: "", spacing: { before: 280 } }));
  children.push(
    p("Generated and E-Verified by HALLORA", {
      bold: true,
      size: 16,
      before: 200,
      after: 20,
    })
  );
  children.push(
    p("Exam Management System", { size: 14, after: 60, italics: true })
  );
  children.push(
    p(`Verification ID: ${verification?.verificationId || "—"}`, {
      size: 14,
      after: 20,
    })
  );
  children.push(
    p(`Generated: ${formatGeneratedAt(verification?.generatedAt)}`, {
      size: 14,
      after: 40,
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.6),
              bottom: convertInchesToTwip(0.6),
              left: convertInchesToTwip(0.6),
              right: convertInchesToTwip(0.6),
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const deptShort = sanitizeFilename(meta?.department || "DEPT").slice(0, 20);
  const examShort = sanitizeFilename(meta?.examType || "Exam");
  const from = dateForFilename(meta?.dateFrom);
  const to = dateForFilename(meta?.dateTo);
  const filename = meta?.courseCode
    ? `${sanitizeFilename(`Hallora_Absentees_${meta.courseCode}_${examShort}_${from}_to_${to}`)}.docx`
    : `${sanitizeFilename(`Hallora_Consolidated_Absentees_${deptShort}_${examShort}_${from}_to_${to}`)}.docx`;

  return { blob, filename };
}

export async function downloadConsolidatedAbsenteeDocx(payload) {
  const { blob, filename } = await buildConsolidatedAbsenteeDocxBlob(payload);
  saveAs(blob, filename);
  return { blob, filename };
}
