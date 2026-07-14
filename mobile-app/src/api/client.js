import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "../config";
import { API_TIMEOUT_MS, API_RETRY_ATTEMPTS, API_RETRY_DELAY_MS, STORAGE_KEYS } from "../constants";
import { ApiError, isRetryableError, mapHttpError } from "./errors";

const pendingGetRequests = new Map();

let onUnauthorized = null;

export function registerUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dedupeKey(config) {
  return `${config.method}:${config.baseURL}${config.url}:${JSON.stringify(config.params || {})}`;
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
    "X-Client-Type": "mobile",
  },
});

api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync(STORAGE_KEYS.TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (!config.headers["X-Client-Type"]) {
      config.headers["X-Client-Type"] = "mobile";
    }
    return config;
  },
  (error) => Promise.reject(mapHttpError(error, BASE_URL))
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const mapped = mapHttpError(error, BASE_URL);

    if (mapped.code === "UNAUTHORIZED" && onUnauthorized) {
      await onUnauthorized(mapped);
    }

    return Promise.reject(mapped);
  }
);

async function executeWithRetry(requestFn, { retries = API_RETRY_ATTEMPTS } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error instanceof ApiError ? error : mapHttpError(error, BASE_URL);
      if (attempt >= retries || !isRetryableError(lastError)) {
        throw lastError;
      }
      await sleep(API_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError;
}

export async function apiRequest(config) {
  const method = (config.method || "get").toLowerCase();
  const signal = config.signal;

  const run = () =>
    executeWithRetry(() => api.request({ ...config, method }), {
      retries: config.retries,
    });

  if (method === "get" && !config.skipDedupe && !signal) {
    const key = dedupeKey({ ...config, method, baseURL: BASE_URL });
    if (pendingGetRequests.has(key)) {
      return pendingGetRequests.get(key);
    }
    const promise = run().finally(() => pendingGetRequests.delete(key));
    pendingGetRequests.set(key, promise);
    return promise;
  }

  return run();
}

export { BASE_URL, ApiError };
export default api;
