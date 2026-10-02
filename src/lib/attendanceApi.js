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
  const body = res.data;
  // Controller returns { success, students, presentStudents, absentStudents, statistics, ... }
  if (body && (Array.isArray(body.students) || Array.isArray(body.presentStudents))) {
    return body;
  }
  if (body?.data && typeof body.data === "object") {
    return body.data;
  }
  return body;
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

export async function fetchAbsenteeExportOptions(params = {}) {
  const res = await api.get("/attendance/export/absentees/options", { params });
  const body = res.data;
  // Controller returns { success, dates, sessions, examTimes } (spread at top level)
  if (body?.dates || body?.sessions || body?.examTimes) {
    return {
      dates: Array.isArray(body.dates) ? body.dates : [],
      sessions: Array.isArray(body.sessions) ? body.sessions : [],
      examTimes: Array.isArray(body.examTimes) ? body.examTimes : [],
    };
  }
  // Nested { data: { dates, ... } } fallback if wrapper changes
  const nested = body?.data;
  if (nested && typeof nested === "object") {
    return {
      dates: Array.isArray(nested.dates) ? nested.dates : [],
      sessions: Array.isArray(nested.sessions) ? nested.sessions : [],
      examTimes: Array.isArray(nested.examTimes) ? nested.examTimes : [],
    };
  }
  const err = new Error(body?.message || body?.error || "Invalid export options response");
  err.response = res;
  throw err;
}

export async function downloadAbsenteesExport(params = {}) {
  const res = await api.get("/attendance/export/absentees", {
    params,
    responseType: "blob",
  });
  const contentType = res.headers["content-type"] || "";
  if (
    contentType.includes("application/json") ||
    (typeof Blob !== "undefined" &&
      res.data instanceof Blob &&
      res.data.type &&
      res.data.type.includes("json"))
  ) {
    const text = await res.data.text();
    let message = "Failed to export absentees";
    try {
      const parsed = JSON.parse(text);
      message = parsed.message || parsed.error || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = new Blob([res.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const cd = res.headers["content-disposition"];
  const match = cd?.match(/filename="(.+)"/);
  const safeDate = String(params.date || "date").replace(/[^0-9-]/g, "");
  const safeSession = String(params.session || "session").replace(/[^A-Za-z0-9]/g, "");
  const safeTime = String(params.startTime || params.examTime || "time")
    .replace(/[^0-9A-Za-z]+/g, "-")
    .replace(/-+/g, "-");
  a.download =
    match?.[1] || `attendance_absentees_${safeDate}_${safeSession}_${safeTime}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Consolidated Absentees DOCX export — filter options */
export async function fetchAttendanceExportOptions(params = {}) {
  const res = await api.get("/attendance/export/options", { params });
  const body = res.data || {};
  return {
    departments: Array.isArray(body.departments) ? body.departments : [],
    courses: Array.isArray(body.courses) ? body.courses : [],
    batches: Array.isArray(body.batches) ? body.batches : [],
    message: body.message || body.warning || null,
  };
}

/** Consolidated Absentees DOCX export — preview */
export async function previewAttendanceExport(params = {}) {
  const res = await api.get("/attendance/export/preview", { params });
  const body = res.data || {};
  return {
    meta: body.meta || {},
    rows: Array.isArray(body.rows) ? body.rows : [],
    empty: Boolean(body.empty),
  };
}

/** Consolidated Absentees DOCX download */
export async function downloadAttendanceExportDocx(payload = {}) {
  const res = await api.post("/attendance/export/docx", payload, {
    responseType: "blob",
  });
  const contentType = res.headers["content-type"] || "";
  if (
    contentType.includes("application/json") ||
    (typeof Blob !== "undefined" &&
      res.data instanceof Blob &&
      res.data.type &&
      res.data.type.includes("json"))
  ) {
    const text = await res.data.text();
    let message = "Failed to export DOCX";
    try {
      const parsed = JSON.parse(text);
      message = parsed.message || parsed.error || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = new Blob([res.data], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const cd = res.headers["content-disposition"];
  const match = cd?.match(/filename="?([^";]+)"?/);
  a.download = match?.[1] || "Hallora_Consolidated_Absentees.docx";
  a.click();
  URL.revokeObjectURL(url);
}

export const EXAM_TYPES = ["CAT 1", "CAT 2", "Model", "Semester", "Retest"];
