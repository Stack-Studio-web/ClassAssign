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

function buildUrl(protocol, host, port) {
  const cleaned = host.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (cleaned.includes(":")) {
    return `${protocol}://${cleaned}`;
  }
  return `${protocol}://${cleaned}:${port}`;
}

export function getApiBaseUrl() {
  const extra = getExtraConfig();
  const allowHttp =
    __DEV__ &&
    (extra.allowHttp === true || process.env.EXPO_PUBLIC_ALLOW_HTTP === "true");
  const protocol = allowHttp ? "http" : "https";

  if (extra.apiUrl) {
    const url = stripTrailingSlash(extra.apiUrl);
    if (!allowHttp && url.startsWith("http://")) {
      throw new Error(
        "Production builds require HTTPS. Set EXPO_PUBLIC_API_URL to https://..."
      );
    }
    return url;
  }

  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) {
    const url = stripTrailingSlash(fromEnv);
    if (!allowHttp && url.startsWith("http://")) {
      throw new Error(
        "Production builds require HTTPS. Set EXPO_PUBLIC_API_URL to https://..."
      );
    }
    return url;
  }

  if (!__DEV__) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is required for production builds. Configure it in EAS secrets."
    );
  }

  const envHost = extra.apiHost || process.env.EXPO_PUBLIC_API_HOST;
  if (envHost) {
    return buildUrl(protocol, envHost, API_PORT);
  }

  if (Platform.OS === "android" && !Constants.isDevice) {
    return buildUrl(protocol, "10.0.2.2", API_PORT);
  }

  if (Platform.OS === "ios" && !Constants.isDevice) {
    return buildUrl(protocol, "localhost", API_PORT);
  }

  const devHost = getExpoDevHost();
  if (devHost) {
    return buildUrl(protocol, devHost, API_PORT);
  }

  throw new Error(
    "Cannot resolve API URL. Set EXPO_PUBLIC_API_URL in mobile-app/.env for your LAN IP."
  );
}

export const BASE_URL = getApiBaseUrl();

export function getSslPinHashes() {
  const extra = getExtraConfig();
  const raw = extra.sslPinHashes || process.env.EXPO_PUBLIC_SSL_PIN_HASHES || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

if (__DEV__) {
  console.log(`[Hallora] API ${BASE_URL} (${Platform.OS})`);
}
