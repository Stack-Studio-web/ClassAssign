import * as SecureStore from "expo-secure-store";
import api, { BASE_URL } from "../api";

export const STORAGE_KEYS = {
  TOKEN: "authToken",
  USER: "authUser",
};

export async function login(email, password) {
  const { data } = await api.post("/api/auth/login", { email, password }, {
    headers: { "X-Client-Type": "mobile" },
  });

  if (!data.success) throw new Error(data.message || "Login failed");

  if (data.token) {
    await SecureStore.setItemAsync(STORAGE_KEYS.TOKEN, data.token);
  }
  await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(data.user));

  return data;
}

export async function verifyToken(token) {
  const { data } = await api.post(
    "/api/auth/verify",
    {},
    { headers: { Authorization: `Bearer ${token}`, "X-Client-Type": "mobile" } }
  );
  return data;
}

export async function logout() {
  const token = await SecureStore.getItemAsync(STORAGE_KEYS.TOKEN);
  try {
    if (token) {
      await api.post(
        "/api/auth/logout",
        {},
        { headers: { Authorization: `Bearer ${token}`, "X-Client-Type": "mobile" } }
      );
    }
  } catch {
    /* best effort */
  } finally {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.TOKEN);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER);
  }
}

export async function restoreSession() {
  const token = await SecureStore.getItemAsync(STORAGE_KEYS.TOKEN);
  const userJson = await SecureStore.getItemAsync(STORAGE_KEYS.USER);

  if (!token || !userJson) return null;

  const { valid, user } = await verifyToken(token);
  if (!valid) {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.TOKEN);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER);
    return null;
  }

  return { token, user };
}

export function getMicrosoftLoginUrl() {
  return `${BASE_URL}/api/auth/microsoft/login`;
}

export async function handleMicrosoftCallback(token) {
  await SecureStore.setItemAsync(STORAGE_KEYS.TOKEN, token);

  const { data } = await api.get("/api/auth/session-info", {
    headers: { Authorization: `Bearer ${token}`, "X-Client-Type": "mobile" },
  });
  await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(data.user));
  return data.user;
}
