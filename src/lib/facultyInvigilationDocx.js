/**
 * Faculty Invigilation Schedule — DOCX export (client-side).
 * Reuses project `docx` + `file-saver` (same pattern as COE / absentee exports).
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
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };

const PAGE_WIDTH = 9600;
const SIG_COL = 3200;
const ASSIGN_COLS = [2800, 3600, 3200];

async function fetchImageBytes(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function normalizeTime(value) {
  if (!value) return "";
  const match = String(value).trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return String(value).slice(0, 5);
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function formatTime12h(value) {
  const norm = normalizeTime(value);
  if (!norm || !norm.includes(":")) return String(value || "");
  const [hStr, mStr] = norm.split(":");
  let hour = Number(hStr);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${mStr} ${ampm}`;
}

function formatDateLong(dateValue) {
  const d = new Date(
    typeof dateValue === "string" && !dateValue.includes("T")
      ? `${dateValue}T12:00:00`
      : dateValue
  );
  if (Number.isNaN(d.getTime())) return String(dateValue || "");
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateSlash(dateValue) {
  if (!dateValue) return "";
  const raw = String(dateValue).slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${d}/${m}/${y}`;
}

function sanitizeFilename(name) {
  return String(name || "Faculty_Invigilation_Schedule")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120);
}

function p(text, opts = {}) {
  const {
    bold = false,
    size = 20,
    center = true,
    before = 0,
    after = 60,
    underline = false,
    pageBreakBefore = false,
  } = opts;
  return new Paragraph({
    alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before, after },
    pageBreakBefore: pageBreakBefore || undefined,
    children: [
      new TextRun({
        text: String(text ?? ""),
        bold,
        size,
        underline: underline ? {} : undefined,
        font: "Times New Roman",
      }),
    ],
  });
}

function emptyLines(count, after = 80) {
  return Array.from({ length: count }, () =>
    new Paragraph({
      spacing: { after },
      children: [new TextRun({ text: " ", font: "Times New Roman", size: 20 })],
    })
  );
}

function textCell(text, opts = {}) {
  const { bold = false, width = 2000, header = false, center = false } = opts;
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: header ? { fill: "1F2937" } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({
            text: String(text ?? ""),
            bold: bold || header,
            size: 18,
            color: header ? "FFFFFF" : "000000",
            font: "Times New Roman",
          }),
        ],
      }),
    ],
  });
}

function splitFacultyDepartment(facultyName, department) {
  const name = String(facultyName || "").trim();
  const dept = String(department || "").trim();
  if (dept) return { name, department: dept };
  const match = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    return { name: match[1].trim(), department: match[2].trim() };
  }
  return { name, department: "" };
}

function buildAssignmentTable(assignments) {
  const header = new TableRow({
    tableHeader: true,
    children: [
      textCell("Room No.", { bold: true, header: true, width: ASSIGN_COLS[0], center: true }),
      textCell("Name", { bold: true, header: true, width: ASSIGN_COLS[1], center: true }),
      textCell("Department", { bold: true, header: true, width: ASSIGN_COLS[2], center: true }),
    ],
  });
  const body = (assignments || []).map((a) => {
    const split = splitFacultyDepartment(a.facultyName, a.department);
    return new TableRow({
      children: [
        textCell(a.venueName || a.roomNo || "—", {
          width: ASSIGN_COLS[0],
          center: true,
        }),
        textCell(split.name || "—", { width: ASSIGN_COLS[1] }),
        textCell(split.department || "—", {
          width: ASSIGN_COLS[2],
          center: true,
        }),
      ],
    });
  });
  return new Table({
    width: { size: PAGE_WIDTH, type: WidthType.DXA },
    columnWidths: ASSIGN_COLS,
    rows: [header, ...body],
  });
}

function signatureColumn(title, { extraBlankLines = 0 } = {}) {
  return new TableCell({
    borders: NO_BORDERS,
    width: { size: SIG_COL, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: 22,
            font: "Times New Roman",
          }),
        ],
      }),
      ...emptyLines(5 + extraBlankLines, 180),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 40 },
        children: [
          new TextRun({
            text: "________________________",
            size: 18,
            font: "Times New Roman",
          }),
        ],
      }),
    ],
  });
}

function buildSignatureSection({ isSfs = false } = {}) {
  // Default: CoE · HoD · Exam Coordinators
  // SFS: AEC · HoD · CoE
  const titles = isSfs
    ? ["AEC", "HoD", "CoE"]
    : ["CoE", "HoD", "Exam Coordinators"];
  const footnote = isSfs
    ? "AEC · Head of the Department · Controller of Examinations"
    : "Controller of Examinations · Head of the Department · Exam Coordinators";

  return [
    p("APPROVAL / SIGNATURES", {
      bold: true,
      size: 24,
      underline: true,
      before: 200,
      after: 280,
      pageBreakBefore: true,
    }),
    new Table({
      width: { size: PAGE_WIDTH, type: WidthType.DXA },
      columnWidths: [SIG_COL, SIG_COL, SIG_COL],
      rows: [
        new TableRow({
          children: [
            signatureColumn(titles[0]),
            signatureColumn(titles[1]),
            signatureColumn(titles[2], {
              extraBlankLines: isSfs ? 0 : 3,
            }),
          ],
        }),
      ],
    }),
    p(footnote, { size: 14, before: 200, after: 40, center: true }),
  ];
}

/**
 * @param {object} args
 * @param {object} args.preview - API preview payload ({ schedule, unassignedVenues, ... })
 * @param {object} args.meta - display meta (deptHeader, ayLabel, semesterLabel, sessionLabel, isSfs, …)
 * @param {"KCT"|"KSI"} [args.logoChoice]
 */
export async function downloadFacultyInvigilationDocx({
  preview,
  meta = {},
  logoChoice = "KSI",
}) {
  const logoUrl = logoChoice === "KCT" ? logoKctUrl : logoKsiUrl;
  const logoBytes = await fetchImageBytes(logoUrl);
  const children = [];

  if (logoBytes) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [
          new ImageRun({
            type: "png",
            data: logoBytes,
            transformation: { width: 100, height: 100 },
            altText: {
              title: logoChoice,
              description: `${logoChoice} logo`,
              name: logoChoice,
            },
          }),
        ],
      })
    );
  }

  children.push(p("Kumaraguru College of Technology", { bold: true, size: 28, after: 80 }));
  children.push(
    p("OFFICE OF THE CONTROLLER OF EXAMINATION", { bold: true, size: 20, after: 80 })
  );
  children.push(p(meta.deptHeader || "—", { bold: true, size: 22, after: 60 }));
  if (meta.isSfs) {
    children.push(p("School of Foundation Sciences (SFS)", { size: 18, after: 40 }));
  }
  children.push(
    p(
      `Academic Year: ${meta.ayLabel || "—"}  ·  Semester: ${meta.semesterLabel || "—"}`,
      { size: 18, before: 60, after: 60 }
    )
  );
  if (meta.sessionLabel) {
    children.push(
      p(`Session: ${meta.sessionLabel}`, { size: 18, before: 40, after: 120 })
    );
  }
  children.push(
    p("Faculty Invigilation Schedule", {
      bold: true,
      size: 24,
      underline: true,
      before: 80,
      after: 280,
    })
  );

  for (const day of preview?.schedule || []) {
    for (const session of day.sessions || []) {
      const sessionLabel = (session.examSession || "").toUpperCase() || "—";
      children.push(
        p(`Date: ${formatDateLong(day.examDate)}`, {
          bold: true,
          size: 20,
          center: false,
          before: 200,
          after: 40,
        })
      );
      children.push(
        p(
          `${sessionLabel}: ${formatTime12h(session.startTime)} - ${formatTime12h(session.endTime)}`,
          { bold: true, size: 18, center: false, before: 40, after: 100 }
        )
      );
      children.push(buildAssignmentTable(session.assignments || []));
      children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
    }
  }

  const unassigned = preview?.unassignedVenues || [];
  if (unassigned.length > 0) {
    children.push(
      p("Venues without assigned invigilator", {
        bold: true,
        size: 20,
        center: false,
        before: 200,
        after: 100,
      })
    );
    const uCols = [1800, 1400, 2800, 3600];
    const uHeader = new TableRow({
      tableHeader: true,
      children: [
        textCell("Date", { header: true, width: uCols[0] }),
        textCell("Session", { header: true, width: uCols[1] }),
        textCell("Time", { header: true, width: uCols[2] }),
        textCell("Venue", { header: true, width: uCols[3] }),
      ],
    });
    const uBody = unassigned.map(
      (u) =>
        new TableRow({
          children: [
            textCell(formatDateSlash(u.examDate), { width: uCols[0] }),
            textCell(u.examSession || "—", { width: uCols[1] }),
            textCell(
              `${formatTime12h(u.startTime)} – ${formatTime12h(u.endTime)}`,
              { width: uCols[2] }
            ),
            textCell(u.venueName || "—", { width: uCols[3] }),
          ],
        })
    );
    children.push(
      new Table({
        width: { size: PAGE_WIDTH, type: WidthType.DXA },
        columnWidths: uCols,
        rows: [uHeader, ...uBody],
      })
    );
  }

  children.push(...buildSignatureSection({ isSfs: Boolean(meta.isSfs) }));

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 twips
            margin: {
              top: convertInchesToTwip(0.6),
              bottom: convertInchesToTwip(0.6),
              left: convertInchesToTwip(0.7),
              right: convertInchesToTwip(0.7),
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const sessionPart = meta.sessionLabel
    ? `_${String(meta.sessionLabel).replace(/\s+/g, "")}`
    : "";
  const fname = sanitizeFilename(
    `Faculty_Invigilation_Schedule_${meta.ayLabel || "AY"}_${meta.dateFrom || ""}_to_${meta.dateTo || ""}${sessionPart}${meta.isSfs ? "_SFS" : ""}`
  );
  saveAs(blob, `${fname}.docx`);
  return `${fname}.docx`;
}
