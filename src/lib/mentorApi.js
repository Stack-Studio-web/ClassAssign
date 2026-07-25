import api from "./api";

function unwrap(res) {
  return res.data?.data ?? res.data;
}

export async function fetchMentors({ page = 1, limit = 25, search = "" } = {}) {
  const res = await api.get("/mentors", { params: { page, limit, search } });
  return unwrap(res);
}

export async function fetchMentorStudents(mentorUuid, { page = 1, limit = 50 } = {}) {
  const res = await api.get(`/mentors/${mentorUuid}/students`, { params: { page, limit } });
  return unwrap(res);
}

export async function fetchMentorMappings({ page = 1, limit = 25, search = "", batchId } = {}) {
  const res = await api.get("/mentors/mappings", {
    params: { page, limit, search, batchId },
  });
  return unwrap(res);
}

export async function previewMentorImport(batchId, file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("batchId", batchId);
  const res = await api.post("/mentors/preview-import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data?.data ?? res.data;
}

export async function importMentors(batchId, file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("batchId", batchId);
  const res = await api.post("/mentors/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return unwrap(res);
}

export async function downloadMentorTemplate() {
  const response = await fetch("/api/mentors/import-template", { credentials: "include" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Download failed. Please log in and try again.");
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mentor_import_template.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
