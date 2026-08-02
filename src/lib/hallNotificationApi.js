import api from "./api";

export async function fetchNotificationStats() {
  const res = await api.get("/hall-notifications/stats");
  return res.data;
}

export async function fetchNotificationSettings() {
  const res = await api.get("/hall-notifications/settings");
  return res.data;
}

export async function updateNotificationSettings(payload) {
  const res = await api.put("/hall-notifications/settings", payload);
  return res.data;
}

export async function pauseNotifications() {
  const res = await api.post("/hall-notifications/pause");
  return res.data;
}

export async function resumeNotifications() {
  const res = await api.post("/hall-notifications/resume");
  return res.data;
}

export async function fetchNotificationHistory(params = {}) {
  const res = await api.get("/hall-notifications/history", { params });
  return res.data;
}

export async function cancelNotification(id) {
  const res = await api.post(`/hall-notifications/${id}/cancel`);
  return res.data;
}

export async function resendNotification(id) {
  const res = await api.post(`/hall-notifications/${id}/resend`);
  return res.data;
}

export async function sendNotificationNow(id) {
  const res = await api.post(`/hall-notifications/${id}/send-now`);
  return res.data;
}

export async function bulkResendNotifications(ids) {
  const res = await api.post("/hall-notifications/bulk-resend", { ids });
  return res.data;
}

export const OFFSET_PRESET_LABELS = {
  "30_minutes": "30 Minutes Before",
  "1_hour": "1 Hour Before",
  "2_hours": "2 Hours Before",
  "6_hours": "6 Hours Before",
  "12_hours": "12 Hours Before (Default)",
  "24_hours": "24 Hours Before",
  custom: "Custom",
};

export const STATUS_OPTIONS = [
  "SCHEDULED",
  "QUEUED",
  "PROCESSING",
  "SENT",
  "DELIVERED",
  "FAILED",
  "RETRYING",
  "CANCELLED",
];
