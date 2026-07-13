import { apiRequest } from "../api/client";
import { assertObject } from "../api/errors";

function unwrap(data) {
  return data?.data ?? data;
}

export async function searchFacultyByEmail(email, signal) {
  const { data } = await apiRequest({
    method: "get",
    url: "/api/faculty-transfers/search-faculty",
    params: { email },
    signal,
  });
  return unwrap(data);
}

export async function checkTransferAvailability(assignmentUuid, email, signal) {
  const { data } = await apiRequest({
    method: "get",
    url: "/api/faculty-transfers/check-availability",
    params: { assignmentUuid, email },
    signal,
  });
  return unwrap(data);
}

export async function submitTransferRequest(payload) {
  const { data } = await apiRequest({
    method: "post",
    url: "/api/faculty-transfers",
    data: payload,
    skipDedupe: true,
  });
  return unwrap(data);
}

export async function fetchMyTransferRequests(signal) {
  const { data } = await apiRequest({
    method: "get",
    url: "/api/faculty-transfers",
    signal,
  });
  const body = unwrap(data);
  return body?.requests ?? body ?? [];
}
