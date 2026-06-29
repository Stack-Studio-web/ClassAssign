export function getApiError(err, fallback = "Request failed") {
  const d = err?.response?.data;
  if (!d) return err?.message || fallback;
  if (d.details) return d.details;
  if (d.message) return d.message;
  if (d.error) return d.error;
  return fallback;
}

export function getApiErrorTitle(err, fallback = "Error") {
  const d = err?.response?.data;
  return d?.message || d?.error || fallback;
}

export function isApiSuccess(data) {
  return data?.success !== false;
}
