import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "../api/client";
import { ApiError, assertObject } from "../api/errors";
import { BASE_URL } from "../config";
import { ALLOWED_MOBILE_ROLES, APP_SCHEME, STORAGE_KEYS } from "../constants";

export { STORAGE_KEYS };

function minimalUser(user) {
  if (!user) return null;
  return {
    uuid: user.uuid,
    email: user.email,
    role: user.role,
    username: user.username,
    mustChangePassword: !!user.mustChangePassword,
  };
}

async function persistSession(token, user) {
  const minimal = minimalUser(user);
  await SecureStore.setItemAsync(STORAGE_KEYS.TOKEN, token);
  await SecureStore.setItemAsync(STORAGE_KEYS.USER_ID, minimal.uuid || minimal.email);
  await SecureStore.setItemAsync(STORAGE_KEYS.USER_ROLE, minimal.role || "");
  await SecureStore.setItemAsync(
    STORAGE_KEYS.MUST_CHANGE_PASSWORD,
    minimal.mustChangePassword ? "1" : "0"
  );
}

async function clearSessionStorage() {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.TOKEN);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_ID);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_ROLE);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.MUST_CHANGE_PASSWORD);
}

export function isAllowedMobileRole(role) {
  return ALLOWED_MOBILE_ROLES.has(role);
}

export async function login(email, password) {
  const { data } = await apiRequest({
    method: "post",
    url: "/api/auth/login",
    data: { email, password },
    skipDedupe: true,
  });

  assertObject(data, "login response");
  if (!data.success) {
    throw new ApiError(data.message || "Login failed");
  }

  if (!isAllowedMobileRole(data.user?.role)) {
    throw new ApiError("Hallora Mobile is for faculty attendance only.", {
      code: "FORBIDDEN",
      status: 403,
    });
  }

  if (data.token) {
    await persistSession(data.token, data.user);
  }

  return data;
}

export async function changePassword(currentPassword, newPassword) {
  const { data } = await apiRequest({
    method: "post",
    url: "/api/auth/change-password",
    data: { currentPassword, newPassword },
    skipDedupe: true,
  });

  assertObject(data, "change-password response");
  if (!data.success) {
    throw new ApiError(data.message || "Password change failed");
  }

  await SecureStore.setItemAsync(STORAGE_KEYS.MUST_CHANGE_PASSWORD, "0");
  return data;
}

export async function verifyToken(token) {
  const { data } = await apiRequest({
    method: "post",
    url: "/api/auth/verify",
    headers: { Authorization: `Bearer ${token}`, "X-Client-Type": "mobile" },
    skipDedupe: true,
  });
  return data;
}

export async function fetchProfile() {
  const { data } = await apiRequest({
    method: "get",
    url: "/api/auth/me",
    skipDedupe: true,
  });
  return data;
}

export async function logout() {
  const token = await SecureStore.getItemAsync(STORAGE_KEYS.TOKEN);
  try {
    if (token) {
      await apiRequest({
        method: "post",
        url: "/api/auth/logout",
        headers: { Authorization: `Bearer ${token}`, "X-Client-Type": "mobile" },
        skipDedupe: true,
        retries: 0,
      });
    }
  } catch {
    /* best effort */
  } finally {
    await clearSessionStorage();
  }
}

export async function restoreSession() {
  const token = await SecureStore.getItemAsync(STORAGE_KEYS.TOKEN);
  const role = await SecureStore.getItemAsync(STORAGE_KEYS.USER_ROLE);
  const mustChange =
    (await SecureStore.getItemAsync(STORAGE_KEYS.MUST_CHANGE_PASSWORD)) === "1";

  if (!token || !role) {
    await clearSessionStorage();
    return null;
  }

  if (!isAllowedMobileRole(role)) {
    await clearSessionStorage();
    return null;
  }

  const { valid, user } = await verifyToken(token);
  if (!valid) {
    await clearSessionStorage();
    return null;
  }

  const profile = await fetchProfile().catch(() => user);
  const merged = {
    ...user,
    ...profile,
    mustChangePassword: mustChange || profile?.mustChangePassword,
  };

  await persistSession(token, merged);
  return { token, user: merged, mustChangePassword: merged.mustChangePassword };
}

export async function fetchMicrosoftAuthUrl() {
  const { data } = await apiRequest({
    method: "get",
    url: "/api/auth/microsoft/login",
    params: { platform: "mobile" },
    skipDedupe: true,
  });
  assertObject(data, "microsoft login");
  if (!data.authUrl) {
    throw new ApiError("Microsoft SSO is not available");
  }
  return data.authUrl;
}

export function getMicrosoftRedirectUri() {
  return `${APP_SCHEME}://auth`;
}

export async function handleMicrosoftCallback(token) {
  await SecureStore.setItemAsync(STORAGE_KEYS.TOKEN, token);

  const { data } = await apiRequest({
    method: "get",
    url: "/api/auth/session-info",
    headers: { Authorization: `Bearer ${token}`, "X-Client-Type": "mobile" },
    skipDedupe: true,
  });

  const user = data?.user;
  if (!user) {
    throw new ApiError("Could not load user profile after Microsoft login");
  }

  if (!isAllowedMobileRole(user.role)) {
    await clearSessionStorage();
    throw new ApiError("Hallora Mobile is for faculty attendance only.", {
      code: "FORBIDDEN",
      status: 403,
    });
  }

  await persistSession(token, user);
  return user;
}

export async function getCachedUserSummary() {
  const [uuid, emailRole, role, mustChange] = await Promise.all([
    SecureStore.getItemAsync(STORAGE_KEYS.USER_ID),
    SecureStore.getItemAsync(STORAGE_KEYS.USER_ID),
    SecureStore.getItemAsync(STORAGE_KEYS.USER_ROLE),
    SecureStore.getItemAsync(STORAGE_KEYS.MUST_CHANGE_PASSWORD),
  ]);

  if (!role) return null;

  return {
    uuid: uuid || emailRole,
    role,
    mustChangePassword: mustChange === "1",
  };
}

export async function clearAllLocalData() {
  await clearSessionStorage();
  const keys = await AsyncStorage.getAllKeys();
  const halloraKeys = keys.filter(
    (k) => k.startsWith(STORAGE_KEYS.ATTENDANCE_DRAFT_PREFIX) || k === STORAGE_KEYS.OFFLINE_QUEUE
  );
  if (halloraKeys.length) {
    await AsyncStorage.multiRemove(halloraKeys);
  }
}
