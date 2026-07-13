export class ApiError extends Error {
  constructor(message, { status, code, data } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export function mapHttpError(error) {
  if (!error.response) {
    if (error.code === "ERR_CANCELED") {
      return new ApiError("Request cancelled", { code: "CANCELLED" });
    }
    return new ApiError(
      error.message || "Network error — check your connection and try again.",
      { code: "NETWORK" }
    );
  }

  const { status, data } = error.response;
  const message =
    data?.message || data?.error || error.message || "Something went wrong";

  switch (status) {
    case 401:
      return new ApiError(message || "Session expired. Please log in again.", {
        status,
        code: "UNAUTHORIZED",
        data,
      });
    case 403:
      return new ApiError(message || "You do not have permission.", {
        status,
        code: "FORBIDDEN",
        data,
      });
    case 404:
      return new ApiError(message || "Resource not found.", {
        status,
        code: "NOT_FOUND",
        data,
      });
    case 408:
      return new ApiError(message || "Request timed out.", {
        status,
        code: "TIMEOUT",
        data,
      });
    case 429:
      return new ApiError(
        message || "Too many requests. Please wait and try again.",
        { status, code: "RATE_LIMIT", data }
      );
    case 500:
      return new ApiError(message || "Server error.", {
        status,
        code: "SERVER_ERROR",
        data,
      });
    case 502:
    case 503:
    case 504:
      return new ApiError(message || "Service temporarily unavailable.", {
        status,
        code: "GATEWAY",
        data,
      });
    default:
      return new ApiError(message, { status, code: "HTTP_ERROR", data });
  }
}

export function isRetryableError(error) {
  if (!(error instanceof ApiError)) return !error.response;
  if (error.code === "NETWORK" || error.code === "GATEWAY" || error.code === "TIMEOUT") {
    return true;
  }
  const status = error.status;
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

export function assertObject(value, label) {
  if (!value || typeof value !== "object") {
    throw new ApiError(`Invalid response: ${label}`, { code: "INVALID_RESPONSE" });
  }
  return value;
}
