import api from "./api";

function unwrap(res) {
  return res.data?.data ?? res.data;
}

export async function fetchAcademicYears() {
  const res = await api.get("/academic/years");
  const data = unwrap(res);
  return data.years ?? [];
}

export async function createAcademicYear(payload) {
  const res = await api.post("/academic/years", payload);
  return unwrap(res).year;
}

export async function updateAcademicYear(uuid, payload) {
  const res = await api.patch(`/academic/years/${uuid}`, payload);
  return unwrap(res).year;
}

export async function deleteAcademicYear(uuid) {
  const res = await api.delete(`/academic/years/${uuid}`);
  return unwrap(res);
}

export async function fetchSemesters(yearUuid) {
  const res = await api.get(`/academic/years/${yearUuid}/semesters`);
  return unwrap(res).semesters ?? [];
}

export async function createSemester(yearUuid, payload) {
  const res = await api.post(`/academic/years/${yearUuid}/semesters`, payload);
  return unwrap(res).semester;
}

export async function updateSemester(uuid, payload) {
  const res = await api.patch(`/academic/semesters/${uuid}`, payload);
  return unwrap(res).semester;
}

export async function deleteSemester(uuid) {
  const res = await api.delete(`/academic/semesters/${uuid}`);
  return unwrap(res);
}

export async function fetchBatches(semesterUuid) {
  const res = await api.get(`/academic/semesters/${semesterUuid}/batches`);
  return unwrap(res).batches ?? [];
}

export async function createBatch(semesterUuid, payload) {
  const res = await api.post(`/academic/semesters/${semesterUuid}/batches`, payload);
  return unwrap(res).batch;
}

export async function updateBatch(uuid, payload) {
  const res = await api.patch(`/academic/batches/${uuid}`, payload);
  return unwrap(res).batch;
}

export async function deleteBatch(uuid) {
  const res = await api.delete(`/academic/batches/${uuid}`);
  return unwrap(res);
}

export async function fetchBatch(uuid) {
  const res = await api.get(`/academic/batches/${uuid}`);
  return unwrap(res).batch;
}

export async function previewStudentImport(batchId, file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("batchId", batchId);
  const res = await api.post("/import/preview-students", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function importStudents({ batchId, file, importMode, confirmAppend }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("batchId", batchId);
  formData.append("importMode", importMode);
  if (confirmAppend) formData.append("confirmAppend", "true");
  const res = await api.post("/import/import-students", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function undoStudentImport(batchId) {
  const res = await api.post("/import/undo-student-import", { batchId });
  return res.data;
}
