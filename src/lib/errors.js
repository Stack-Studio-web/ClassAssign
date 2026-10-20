export function getApiError(err, fallback = "Request failed") {
  const d = err?.response?.data;
  if (!d) return err?.message || fallback;
  // Prefer human-readable message; only use details when it is a string.
  if (typeof d.message === "string" && d.message.trim()) return d.message;
  if (typeof d.details === "string" && d.details.trim()) return d.details;
  if (typeof d.error === "string" && d.error.trim()) return d.error;
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  return fallback;
}

export function getApiErrorTitle(err, fallback = "Error") {
  const d = err?.response?.data;
  return d?.message || d?.error || fallback;
}

export function isApiSuccess(data) {
  return data?.success !== false;
}
