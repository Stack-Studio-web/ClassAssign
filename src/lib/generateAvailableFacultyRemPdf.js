/**
 * Faculty Management PDF exports:
 * 1) All faculty — Name, Allotted, Allotted Date
 * 2) Rem only — available faculty with Rem > 0 — Name, Remaining Invigilation
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function formatDateList(dates) {
  const list = [...new Set((dates || []).filter(Boolean))].sort();
  if (!list.length) return "—";
  return list
    .map((d) => {
      const raw = String(d).slice(0, 10);
      const parsed = new Date(`${raw}T12:00:00`);
      if (Number.isNaN(parsed.getTime())) return raw;
      return parsed.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    })
    .join(", ");
}

function subtitleLine(meta = {}) {
  const parts = [];
  if (meta.contextLabel) parts.push(String(meta.contextLabel));
  if (meta.departmentFilter) {
    parts.push(`Department: ${meta.departmentFilter}`);
  }
  parts.push(
    `Generated: ${new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}`
  );
  return parts.join("  ·  ");
}

function filenamePart(meta = {}) {
  const deptPart = meta.departmentFilter
    ? `_${String(meta.departmentFilter).replace(/[^A-Za-z0-9]+/g, "_")}`
    : "";
  const datePart = new Date().toISOString().slice(0, 10);
  return { deptPart, datePart };
}

function downloadBlob(blob, filename) {
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

function drawPdfShell(pdf, title, meta, totalLabel) {
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 12;
  let y = 16;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(0, 0, 0);
  pdf.text(title, pageW / 2, y, { align: "center" });
  y += 7;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(subtitleLine(meta), pageW / 2, y, { align: "center" });
  y += 6;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(totalLabel, margin, y);
  y += 4;

  return { pageW, margin, y };
}

function addPageNumbers(pdf, pageW) {
  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(
      `Page ${p} of ${pageCount}`,
      pageW / 2,
      pdf.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }
}

/** All faculty from the current filtered list. */
export function mapAllFacultyRows(facultyList, datesByUuid = {}) {
  return (facultyList || [])
    .map((f) => {
      const uuid = String(f.uuid || f.public_uuid || "").trim();
      return {
        name: String(f.name || "").trim() || "—",
        allotted: Number(f.allocation ?? 0) || 0,
        allottedDates: datesByUuid[uuid] || [],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Available faculty with remaining invigilation slots only. */
export function filterAvailableWithRemaining(facultyList) {
  return (facultyList || [])
    .filter((f) => {
      const rem = Number(f.remaining ?? f.freeSlots ?? 0);
      const available = f.isAvailable !== false;
      return available && rem > 0;
    })
    .map((f) => ({
      name: String(f.name || "").trim() || "—",
      remaining: Number(f.remaining ?? f.freeSlots ?? 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * PDF 1 — All faculty: Name | Allotted | Allotted Date
 */
export async function generateAllFacultyAllotmentPdf(facultyList, meta = {}) {
  const rows = mapAllFacultyRows(facultyList, meta.datesByUuid || {});
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const { pageW, margin, y } = drawPdfShell(
    pdf,
    "All Faculty — Allotment",
    meta,
    `Total: ${rows.length}`
  );

  autoTable(pdf, {
    startY: y,
    head: [["S.No", "Name", "Allotted", "Allotted Date"]],
    body: rows.map((r, i) => [
      String(i + 1),
      r.name,
      String(r.allotted),
      formatDateList(r.allottedDates),
    ]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
      cellPadding: 2.5,
      valign: "middle",
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 14, halign: "center" },
      1: { cellWidth: 60, halign: "left" },
      2: { cellWidth: 24, halign: "center" },
      3: { cellWidth: 80, halign: "left" },
    },
    margin: { left: margin, right: margin },
  });

  if (rows.length === 0) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text("No faculty to export.", pageW / 2, y + 20, { align: "center" });
  }

  addPageNumbers(pdf, pageW);
  const { deptPart, datePart } = filenamePart(meta);
  return {
    blob: pdf.output("blob"),
    filename: `All_Faculty_Allotment${deptPart}_${datePart}.pdf`,
  };
}

/**
 * PDF 2 — Rem only: Name | Remaining Invigilation
 */
export async function generateAvailableFacultyRemPdf(facultyList, meta = {}) {
  const rows = filterAvailableWithRemaining(facultyList);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const { pageW, margin, y } = drawPdfShell(
    pdf,
    "Available Faculty — Remaining Invigilation",
    meta,
    `Total: ${rows.length}`
  );

  autoTable(pdf, {
    startY: y,
    head: [["S.No", "Name", "Remaining Invigilation"]],
    body: rows.map((r, i) => [String(i + 1), r.name, String(r.remaining)]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 10,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
      cellPadding: 3,
      valign: "middle",
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 18, halign: "center" },
      1: { cellWidth: "auto", halign: "left" },
      2: { cellWidth: 45, halign: "center" },
    },
    margin: { left: margin, right: margin },
  });

  if (rows.length === 0) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text(
      "No available faculty with remaining invigilation slots.",
      pageW / 2,
      y + 20,
      { align: "center" }
    );
  }

  addPageNumbers(pdf, pageW);
  const { deptPart, datePart } = filenamePart(meta);
  return {
    blob: pdf.output("blob"),
    filename: `Available_Faculty_Rem${deptPart}_${datePart}.pdf`,
  };
}

export async function downloadAllFacultyAllotmentPdf(facultyList, meta = {}) {
  const { blob, filename } = await generateAllFacultyAllotmentPdf(
    facultyList,
    meta
  );
  return downloadBlob(blob, filename);
}

export async function downloadAvailableFacultyRemPdf(facultyList, meta = {}) {
  const { blob, filename } = await generateAvailableFacultyRemPdf(
    facultyList,
    meta
  );
  return downloadBlob(blob, filename);
}
