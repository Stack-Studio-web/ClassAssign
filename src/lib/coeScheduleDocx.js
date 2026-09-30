/**
 * Controller of Examinations Schedule — DOCX generator (client-side).
 * Uses the project's `docx` + `file-saver` packages and embedded logo assets.
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

async function fetchImageBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load logo asset");
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function formatDateDdMmYyyy(value) {
  if (!value) return "";
  const raw = String(value);
  const iso = raw.includes("T") ? raw.split("T")[0] : raw.slice(0, 10);
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return raw;
  return `${d}.${m}.${y}`;
}

function dayNameFromDate(value) {
  const raw = String(value);
  const iso = raw.includes("T") ? raw.split("T")[0] : raw.slice(0, 10);
  const dt = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-US", { weekday: "long" });
}

function formatTimePart(t) {
  if (!t) return "";
  const s = String(t).slice(0, 5);
  const [hh, mm] = s.split(":").map(Number);
  if (!Number.isFinite(hh)) return String(t);
  const ampm = hh >= 12 ? "PM" : "AM";
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;
  const hStr = String(h12).padStart(2, "0");
  const mStr = String(mm || 0).padStart(2, "0");
  return `${hStr}.${mStr} ${ampm}`;
}

function formatSessionRange(startTime, endTime, session) {
  if (startTime && endTime) {
    return `${formatTimePart(startTime)} to ${formatTimePart(endTime)}`;
  }
  if (String(session).toUpperCase() === "FN") return "09.00 AM to 12.00 PM";
  if (String(session).toUpperCase() === "AN") return "01.00 PM to 04.00 PM";
  return String(session || "");
}

function textCell(text, opts = {}) {
  const {
    bold = false,
    center = false,
    width = 1500,
    fontSize = 18,
  } = opts;
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

function buildTable(rows) {
  const colWidths = [600, 1400, 3200, 1200, 1200, 2000];
  const header = new TableRow({
    tableHeader: true,
    children: [
      textCell("S.N.", { bold: true, center: true, width: colWidths[0] }),
      textCell("Subject Code", { bold: true, center: true, width: colWidths[1] }),
      textCell("Subject Name", { bold: true, center: true, width: colWidths[2] }),
      textCell("Exam Date", { bold: true, center: true, width: colWidths[3] }),
      textCell("Day", { bold: true, center: true, width: colWidths[4] }),
      textCell("Session", { bold: true, center: true, width: colWidths[5] }),
    ],
  });

  const body = rows.map((row, idx) => {
    const dateStr = formatDateDdMmYyyy(row.date);
    const day = dayNameFromDate(row.date);
    const session = formatSessionRange(row.startTime, row.endTime, row.session);
    return new TableRow({
      children: [
        textCell(String(idx + 1), { center: true, width: colWidths[0] }),
        textCell(row.courseCode || "", { center: true, width: colWidths[1] }),
        textCell(row.courseName || "", { center: false, width: colWidths[2] }),
        textCell(dateStr, { center: true, width: colWidths[3] }),
        textCell(day, { center: true, width: colWidths[4] }),
        textCell(session, { center: true, width: colWidths[5], fontSize: 16 }),
      ],
    });
  });

  return new Table({
    width: { size: 9600, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [header, ...body],
  });
}

function sanitizeFilename(name) {
  return String(name || "COE_Schedule")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120);
}

/**
 * @param {object} payload - response from /timetable/coe/export-data
 * @param {"KCT"|"KSI"} logoChoice
 */
export async function downloadCoeScheduleDocx(payload, logoChoice = "KCT") {
  const logoUrl = logoChoice === "KSI" ? logoKsiUrl : logoKctUrl;
  const logoBytes = await fetchImageBytes(logoUrl);

  const children = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new ImageRun({
          type: "png",
          data: logoBytes,
          transformation: { width: 90, height: 90 },
          altText: { title: logoChoice, description: `${logoChoice} logo`, name: logoChoice },
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 80 },
      children: [
        new TextRun({
          text: "OFFICE OF THE CONTROLLER OF EXAMINATIONS",
          bold: true,
          size: 28,
          font: "Times New Roman",
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 80 },
      children: [
        new TextRun({
          text: `DEPARTMENT OF ${payload.departmentName || payload.departmentCode}`,
          bold: true,
          size: 24,
          font: "Times New Roman",
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 280 },
      children: [
        new TextRun({
          text: payload.title,
          bold: true,
          size: 22,
          font: "Times New Roman",
        }),
      ],
    })
  );

  for (const section of payload.sections || []) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 40 },
        children: [
          new TextRun({
            text: `DEGREE: ${section.degree || "—"}`,
            bold: true,
            size: 20,
            font: "Times New Roman",
          }),
          new TextRun({ text: "\t\t\t", font: "Times New Roman" }),
          new TextRun({
            text: `BRANCH: ${section.branch || "—"}`,
            bold: true,
            size: 20,
            font: "Times New Roman",
          }),
        ],
      })
    );
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: `SEMESTER: ${section.semester || "—"}`,
            bold: true,
            size: 20,
            font: "Times New Roman",
          }),
        ],
      })
    );

    children.push(buildTable(section.rows || []));
    children.push(new Paragraph({ text: "", spacing: { after: 300 } }));
  }

  // Signature area
  children.push(new Paragraph({ text: "", spacing: { before: 600 } }));
  children.push(new Paragraph({ text: "", spacing: { before: 600 } }));
  children.push(
    new Paragraph({
      spacing: { before: 400 },
      children: [
        new TextRun({
          text: "Exam Coordinator",
          bold: true,
          size: 20,
          font: "Times New Roman",
        }),
        new TextRun({ text: "                         ", font: "Times New Roman" }),
        new TextRun({
          text: "HOD",
          bold: true,
          size: 20,
          font: "Times New Roman",
        }),
        new TextRun({ text: "                         ", font: "Times New Roman" }),
        new TextRun({
          text: "COE",
          bold: true,
          size: 20,
          font: "Times New Roman",
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.7),
              bottom: convertInchesToTwip(0.7),
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
  const fname = sanitizeFilename(
    `${payload.departmentCode || "DEPT"}_${String(payload.assessment || "")
      .replace(/\s+/g, "_")}_${String(payload.schedule || "").replace(/\s+/g, "_")}_${payload.track || "REGULAR"}`
  );
  saveAs(blob, `${fname}.docx`);
  return `${fname}.docx`;
}

export const COE_ASSESSMENTS = [
  "CAT 1",
  "CAT 2",
  "SUMMATIVE ASSESSMENT - I",
  "SUMMATIVE ASSESSMENT - II",
];

export const COE_TRACKS = [
  "REGULAR",
  "SUMMER TRACK",
  "WINTER TRACK",
  "HONORS",
  "MINORS",
  "PROTOSEM",
];
