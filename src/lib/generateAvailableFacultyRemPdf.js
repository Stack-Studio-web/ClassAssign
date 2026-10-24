/**
 * PDF: available faculty with remaining invigilation slots (Name + Rem).
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Faculty who are available and have remaining invigilation slots.
 * @param {Array<object>} facultyList
 * @returns {Array<{ name: string, remaining: number, department?: string }>}
 */
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
      department: String(
        f.membershipLabel || f.mainDepartment || f.department || ""
      ).trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {Array<object>} facultyList — typically filteredFaculty from Faculty Management
 * @param {{ departmentFilter?: string, contextLabel?: string }} [meta]
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function generateAvailableFacultyRemPdf(facultyList, meta = {}) {
  const rows = filterAvailableWithRemaining(facultyList);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.text("Available Faculty — Remaining Invigilation", pageW / 2, y, {
    align: "center",
  });
  y += 7;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  const subtitleParts = [];
  if (meta.contextLabel) subtitleParts.push(String(meta.contextLabel));
  if (meta.departmentFilter) {
    subtitleParts.push(`Department: ${meta.departmentFilter}`);
  }
  subtitleParts.push(
    `Generated: ${new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}`
  );
  pdf.text(subtitleParts.join("  ·  "), pageW / 2, y, { align: "center" });
  y += 6;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(`Total: ${rows.length}`, margin, y);
  y += 4;

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
    didDrawPage: (data) => {
      const pageCount = pdf.getNumberOfPages();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageW / 2,
        pdf.internal.pageSize.getHeight() - 8,
        { align: "center" }
      );
    },
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

  const deptPart = meta.departmentFilter
    ? `_${String(meta.departmentFilter).replace(/[^A-Za-z0-9]+/g, "_")}`
    : "";
  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `Available_Faculty_Rem${deptPart}_${datePart}.pdf`;
  return { blob: pdf.output("blob"), filename };
}

export async function downloadAvailableFacultyRemPdf(facultyList, meta = {}) {
  const { blob, filename } = await generateAvailableFacultyRemPdf(
    facultyList,
    meta
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
