import api from "../api";

export async function fetchMyExams() {
  const { data } = await api.get("/api/faculty-attendance/my-exams");
  return data;
}

export async function fetchStudents(assignmentUuid) {
  const { data } = await api.get(
    `/api/attendance/assignment/${assignmentUuid}/students`
  );
  return data;
}

export async function fetchSeatingAttendance({ date, session, startTime, endTime, venue }) {
  const { data } = await api.get("/api/seating/attendance", {
    params: { date, session, startTime, endTime, venue },
  });
  return data;
}

export async function submitAttendance(payload) {
  const { data } = await api.post("/api/attendance/submit", payload);
  return data;
}

export async function fetchAttendanceReport(params = {}) {
  const { data } = await api.get("/api/attendance/report", { params });
  return data;
}
