import * as Application from "expo-application";
import * as Device from "expo-device";

export async function checkDeviceIntegrity() {
  const warnings = [];

  if (!Device.isDevice) {
    warnings.push("Running on simulator/emulator");
  }

  if (Device.brand === "generic" || Device.modelName?.toLowerCase()?.includes("sdk")) {
    warnings.push("Emulator detected");
  }

  if (__DEV__) {
    return { ok: true, warnings };
  }

  return {
    ok: warnings.length === 0,
    warnings,
    deviceId: Application.androidId || Application.applicationId,
  };
}

export function getSecurityConfig() {
  return {
    httpsOnly: !__DEV__,
    pinningConfigured: false,
  };
}
