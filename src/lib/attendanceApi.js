import api from "./api";

export async function fetchActiveAttendance(params = {}) {
  const res = await api.get("/attendance/active", { params });
  return res.data;
}

export async function fetchCompletedAttendance(params = {}) {
  const res = await api.get("/attendance/completed", { params });
  return res.data;
}

export async function fetchAttendanceCounts() {
  const res = await api.get("/attendance/counts");
  return res.data?.counts ?? { active: 0, completed: 0 };
}

export async function fetchCompletedDetail(sessionUuid) {
  const res = await api.get(`/attendance/completed/${sessionUuid}`);
  return res.data;
}

export function exportCompletedAttendance(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") query.set(k, v);
  });
  const qs = query.toString();
  return `/api/attendance/completed/export${qs ? `?${qs}` : ""}`;
}

export async function downloadCompletedExport(params = {}) {
  const res = await api.get("/attendance/completed/export", {
    params,
    responseType: "blob",
  });
  const blob = new Blob([res.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const cd = res.headers["content-disposition"];
  const match = cd?.match(/filename="(.+)"/);
  a.download =
    match?.[1] || `Attendance_Completed_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export const EXAM_TYPES = ["CAT 1", "CAT 2", "Model", "Semester", "Retest"];
