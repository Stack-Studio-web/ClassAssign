import api from "./api";

export async function fetchDatewiseDates() {
  const res = await api.get("/datewise/dates");
  return res.data || {};
}

export async function fetchDatewiseSessions(date) {
  const res = await api.get("/datewise/sessions", { params: { date } });
  return res.data || {};
}

export async function fetchDatewiseStatement(params) {
  const res = await api.get("/datewise/statement", { params });
  return res.data || {};
}
