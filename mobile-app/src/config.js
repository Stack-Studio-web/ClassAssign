import { Platform } from "react-native";
import Constants from "expo-constants";

function getExtraConfig() {
  return Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {};
}

export const API_PORT =
  Number(getExtraConfig().apiPort || process.env.EXPO_PUBLIC_API_PORT) || 5000;

function stripTrailingSlash(url) {
  return url.replace(/\/$/, "");
}

function hostFromUri(uri) {
  if (!uri || typeof uri !== "string") return null;
  const withoutScheme = uri.replace(/^https?:\/\//, "");
  const host = withoutScheme.split("/")[0].split(":")[0];
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return host;
}

/** LAN IP of the dev machine running Metro (Expo Go on a physical device). */
function getExpoDevHost() {
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.manifest2?.extra?.expoGo?.debuggerHost,
    Constants.manifest?.debuggerHost,
    Constants.linkingUri,
  ];

  for (const uri of candidates) {
    const host = hostFromUri(uri);
    if (host) return host;
  }
  return null;
}

export function getApiBaseUrl() {
  const extra = getExtraConfig();

  if (extra.apiUrl) return stripTrailingSlash(extra.apiUrl);

  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return stripTrailingSlash(fromEnv);

  const envHost = extra.apiHost || process.env.EXPO_PUBLIC_API_HOST;
  if (envHost) {
    const cleaned = envHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (cleaned.includes(":")) return `http://${cleaned}`;
    return `http://${cleaned}:${API_PORT}`;
  }

  // Android emulator → host machine
  if (Platform.OS === "android" && !Constants.isDevice) {
    return `http://10.0.2.2:${API_PORT}`;
  }

  // iOS simulator → host machine
  if (Platform.OS === "ios" && !Constants.isDevice) {
    return `http://localhost:${API_PORT}`;
  }

  // Physical device (Expo Go): use the same LAN IP Metro uses
  const devHost = getExpoDevHost();
  if (devHost) {
    return `http://${devHost}:${API_PORT}`;
  }

  return `http://localhost:${API_PORT}`;
}

export const BASE_URL = getApiBaseUrl();

if (__DEV__) {
  console.log(
    `[API] ${BASE_URL} (platform=${Platform.OS}, device=${Constants.isDevice}, ` +
      `debugger=${getExpoDevHost() ?? "none"})`
  );
}
