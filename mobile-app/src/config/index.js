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

function parseHostFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const normalized = url.includes("://") ? url : `http://${url}`;
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    const withoutScheme = url.replace(/^https?:\/\//, "");
    return withoutScheme.split("/")[0].split(":")[0].toLowerCase();
  }
}

function isLoopbackHost(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function isLoopbackUrl(url) {
  return isLoopbackHost(parseHostFromUrl(url));
}

function hostFromUri(uri) {
  if (!uri || typeof uri !== "string") return null;
  const withoutScheme = uri.replace(/^https?:\/\//, "");
  const host = withoutScheme.split("/")[0].split(":")[0];
  if (!host || isLoopbackHost(host)) return null;
  return host;
}

/** LAN IP of the dev machine running Metro — same address the phone uses for Expo Go. */
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

function resolveAllowHttp(extra) {
  return (
    __DEV__ &&
    (extra.allowHttp === true || process.env.EXPO_PUBLIC_ALLOW_HTTP === "true")
  );
}

function getConfiguredApiUrl(extra) {
  const candidates = [extra.apiUrl, process.env.EXPO_PUBLIC_API_URL].filter(Boolean);
  for (const raw of candidates) {
    const url = stripTrailingSlash(String(raw));
    if (url) return url;
  }
  return null;
}

export function getApiBaseUrl() {
  const extra = getExtraConfig();
  const allowHttp = resolveAllowHttp(extra);
  const protocol = allowHttp ? "http" : "https";
  const isPhysicalDevice = Constants.isDevice;
  const isAndroidEmulator = Platform.OS === "android" && !isPhysicalDevice;
  const isIosSimulator = Platform.OS === "ios" && !isPhysicalDevice;

  const configuredUrl = getConfiguredApiUrl(extra);
  const metroHost = getExpoDevHost();

  // Physical device + Expo Go: never use localhost — phone cannot reach PC via loopback
  if (isPhysicalDevice) {
    if (configuredUrl && !isLoopbackUrl(configuredUrl)) {
      const url = configuredUrl;
      if (!allowHttp && url.startsWith("http://")) {
        throw new Error("Production builds require HTTPS for EXPO_PUBLIC_API_URL.");
      }
      return url;
    }

    if (metroHost) {
      return buildUrl(protocol, metroHost, API_PORT);
    }

    throw new Error(
      "Cannot resolve API URL on a physical device. " +
        "Connect phone and PC to the same Wi‑Fi, start Expo with LAN (not tunnel/localhost), " +
        "or set EXPO_PUBLIC_API_URL to your PC's LAN IP (e.g. http://192.168.1.10:5000). " +
        "Never use localhost on a physical device."
    );
  }

  // Android emulator → host machine via special alias
  if (isAndroidEmulator) {
    if (configuredUrl && !isLoopbackUrl(configuredUrl)) {
      return configuredUrl;
    }
    return buildUrl(protocol, "10.0.2.2", API_PORT);
  }

  // iOS simulator → host machine loopback
  if (isIosSimulator) {
    if (configuredUrl) {
      return configuredUrl;
    }
    return buildUrl(protocol, "127.0.0.1", API_PORT);
  }

  // Fallback: dev host from Metro, then configured URL, then error
  if (metroHost) {
    return buildUrl(protocol, metroHost, API_PORT);
  }

  if (configuredUrl) {
    if (!allowHttp && configuredUrl.startsWith("http://")) {
      throw new Error("Production builds require HTTPS. Set EXPO_PUBLIC_API_URL to https://...");
    }
    return configuredUrl;
  }

  const envHost = extra.apiHost || process.env.EXPO_PUBLIC_API_HOST;
  if (envHost && !isLoopbackHost(envHost)) {
    return buildUrl(protocol, envHost, API_PORT);
  }

  if (!__DEV__) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is required for production builds. Configure it in EAS secrets."
    );
  }

  throw new Error(
    "Cannot resolve API URL. Start Expo on LAN or set EXPO_PUBLIC_API_URL to your PC LAN IP."
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

export function getApiResolutionDebug() {
  const extra = getExtraConfig();
  return {
    baseUrl: BASE_URL,
    platform: Platform.OS,
    isDevice: Constants.isDevice,
    metroHost: getExpoDevHost(),
    configuredUrl: getConfiguredApiUrl(extra),
    allowHttp: resolveAllowHttp(extra),
    port: API_PORT,
  };
}

if (__DEV__) {
  const debug = getApiResolutionDebug();
  console.log(
    `[Hallora] API ${debug.baseUrl} (${debug.platform}, device=${debug.isDevice}, metro=${debug.metroHost ?? "none"})`
  );
}
