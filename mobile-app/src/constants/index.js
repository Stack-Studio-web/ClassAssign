export const STORAGE_KEYS = {
  TOKEN: "authToken",
  USER_ID: "authUserId",
  USER_ROLE: "authUserRole",
  MUST_CHANGE_PASSWORD: "authMustChangePassword",
  ATTENDANCE_DRAFT_PREFIX: "attendanceDraft:",
  OFFLINE_QUEUE: "offlineQueue",
};

export const ALLOWED_MOBILE_ROLES = new Set(["faculty"]);

export const APP_SCHEME = "hallora";

export const API_TIMEOUT_MS = 30000;
export const API_RETRY_ATTEMPTS = 3;
export const API_RETRY_DELAY_MS = 800;

export const ATTENDANCE_DRAFT_AUTOSAVE_MS = 2000;

export const MIN_TOUCH_TARGET = 48;
