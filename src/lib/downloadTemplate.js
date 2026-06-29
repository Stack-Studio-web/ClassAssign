const TEMPLATE_MAP = {
  faculty: "faculty_import_template_CORRECT.xlsx",
  student: "student_import_template_CORRECT.xlsx",
  venue: "venue_import.xlsx",
  timetable: "Timetable_Bulk_Import_Template.xlsx",
};

export async function downloadTemplate(type) {
  const filename = TEMPLATE_MAP[type];
  if (!filename) throw new Error("Unknown template type");

  const response = await fetch(`/format/${filename}`, { credentials: "include" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Download failed. Please log in and try again.");
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
