import { apiRequest } from "../api/client";
import { assertObject } from "../api/errors";

export async function fetchMyExams(signal) {
  const { data } = await apiRequest({
    method: "get",
    url: "/api/faculty-attendance/my-exams",
    signal,
  });
  assertObject(data, "my-exams");
  return data;
}

export async function fetchStudents(assignmentUuid, signal) {
  const { data } = await apiRequest({
    method: "get",
    url: `/api/attendance/assignment/${assignmentUuid}/students`,
    signal,
  });
  assertObject(data, "students");
  return data;
}

export async function fetchSeatingAttendance(params, signal) {
  const { data } = await apiRequest({
    method: "get",
    url: "/api/seating/attendance",
    params,
    signal,
    timeout: 45000,
  });
  assertObject(data, "seating attendance");
  return data;
}

export async function submitAttendance(payload) {
  const { data } = await apiRequest({
    method: "post",
    url: "/api/attendance/submit",
    data: payload,
    skipDedupe: true,
  });
  assertObject(data, "attendance submit");
  return data;
}

export async function fetchAttendanceReport(params, signal) {
  const { data } = await apiRequest({
    method: "get",
    url: "/api/attendance/report",
    params,
    signal,
  });
  return data;
}
