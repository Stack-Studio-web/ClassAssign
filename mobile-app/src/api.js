import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "./config";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
});

api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync("authToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      return Promise.reject(
        new Error(
          `Network error — cannot reach ${BASE_URL}. ` +
            "Use the same Wi‑Fi as your PC, start Expo with LAN (not --localhost), " +
            "ensure Docker/backend is on port 5000, and set EXPO_PUBLIC_API_URL in mobile-app/.env if needed."
        )
      );
    }
    const message =
      error.response.data?.message ||
      error.response.data?.error ||
      error.message ||
      "Something went wrong";
    return Promise.reject(new Error(message));
  }
);

export { BASE_URL };
export default api;
