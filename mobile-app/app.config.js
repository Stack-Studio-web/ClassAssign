require("dotenv").config();

const app = require("./app.json");

const isProduction = process.env.NODE_ENV === "production";

module.exports = {
  expo: {
    ...app.expo,

    plugins: [
      "expo-font",
      "expo-web-browser",
      ...(app.expo.plugins || []),
    ],

    android: {
      ...(app.expo.android || {}),
      package: process.env.ANDROID_PACKAGE || "com.kct.hallora",
      versionCode: Number(process.env.ANDROID_VERSION_CODE) || 1,
      usesCleartextTraffic:
        !isProduction || process.env.EXPO_PUBLIC_ALLOW_HTTP === "true",
    },

    extra: {
      ...(app.expo.extra || {}),
      apiUrl: process.env.EXPO_PUBLIC_API_URL || null,
      apiHost: process.env.EXPO_PUBLIC_API_HOST || null,
      apiPort: process.env.EXPO_PUBLIC_API_PORT || null,
      allowHttp: process.env.EXPO_PUBLIC_ALLOW_HTTP === "true",
      sslPinHashes: process.env.EXPO_PUBLIC_SSL_PIN_HASHES || "",
      eas: {
        projectId: process.env.EAS_PROJECT_ID || "hallora-mobile-local",
      },
    },
  },
};