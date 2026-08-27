/**
 * Fetch Microsoft Graph profile photo using a short-lived access token.
 * Token is never stored — only the image bytes are cached in Redis (by session).
 */
const axios = require("axios");

/**
 * @param {string} accessToken Microsoft Graph access token (not persisted)
 * @returns {Promise<{ contentType: string, buffer: Buffer } | null>}
 */
async function fetchMicrosoftProfilePhoto(accessToken) {
  if (!accessToken) return null;

  // Prefer a small thumbnail to keep Redis cache light.
  const urls = [
    "https://graph.microsoft.com/v1.0/me/photos/96x96/$value",
    "https://graph.microsoft.com/v1.0/me/photo/$value",
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: "arraybuffer",
        timeout: 10000,
        validateStatus: (status) => status === 200 || status === 404,
      });

      if (res.status === 404) continue;
      if (res.status !== 200 || !res.data) continue;

      const contentType =
        String(res.headers["content-type"] || "image/jpeg").split(";")[0].trim() ||
        "image/jpeg";
      const buffer = Buffer.from(res.data);
      if (buffer.length === 0) continue;

      return { contentType, buffer };
    } catch (err) {
      const status = err.response?.status;
      // 404 = no photo; other errors → try next URL / fall back silently
      if (status === 404) continue;
      console.warn("Microsoft profile photo fetch failed:", status || err.message);
    }
  }

  return null;
}

module.exports = { fetchMicrosoftProfilePhoto };
