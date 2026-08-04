import api from "./api";

export async function sendInvigilationNotifications({ seatingPlanUuids, resend = false }) {
  const res = await api.post("/invigilation-notifications/send", {
    seatingPlanUuids,
    resend,
  });
  return res.data?.data ?? res.data;
}

export async function fetchInvigilationBatchStatus(batchUuid) {
  const res = await api.get(`/invigilation-notifications/batches/${batchUuid}`);
  return res.data?.data ?? res.data;
}

export async function fetchInvigilationSmtpStatus() {
  const res = await api.get("/invigilation-notifications/smtp-status");
  return res.data?.data ?? res.data;
}
