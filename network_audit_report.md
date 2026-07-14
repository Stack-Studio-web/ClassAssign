# Hallora Mobile — Network Audit Report

**Date:** 2026-07-14  
**Symptom:** `Network Error` on login / API calls from **physical Android device** via **Expo Go**  
**Backend:** Docker `backend` service on port **5000**

---

## Executive Summary

| Item | Finding |
|------|---------|
| **Root cause** | App resolved API to `http://localhost:5000` on a **physical Android phone**. On a phone, `localhost` is the phone itself — not your PC running Docker. |
| **Evidence** | Expo Metro log: `Metro waiting on exp://10.181.59.52:8081` but app log: `[Hallora] API http://localhost:5000 (android)` |
| **Backend** | Healthy — `GET http://127.0.0.1:5000/health` → `200 {"status":"OK"}` |
| **CORS** | **Not the cause** — React Native mobile requests have no browser `Origin`; Express CORS already allows requests without origin |
| **Docker** | Port `5000:5000` mapped correctly; server now explicitly binds `0.0.0.0` |

---

## Root Cause Analysis

### 1. Primary: `localhost` on physical device (CONFIRMED)

When `EXPO_PUBLIC_API_URL=http://localhost:5000` was set in `mobile-app/.env`, `app.config.js` baked it into `expo.extra.apiUrl`. `src/config/index.js` used that value **first**, before Metro LAN auto-detection.

On a **physical Android device**:
- `localhost` / `127.0.0.1` → the **phone**, not the dev PC
- The phone has no backend on port 5000 → Axios throws `Network Error` (no TCP connection)

Metro was correctly serving the JS bundle at `10.181.59.52:8081` (LAN), but API traffic went to the wrong host.

### 2. Secondary: Wrong resolution priority

Old logic in `src/config/index.js`:

```
1. extra.apiUrl (from app.config.js / .env at Metro start)
2. process.env.EXPO_PUBLIC_API_URL
3. getExpoDevHost()  ← only if above missing
```

If `.env` contained `localhost`, auto-detection from Metro IP was **never reached**.

### 3. Not the cause: CORS

`backend/server.js` CORS handler:

```javascript
if (!origin || allowedOrigins.includes(origin)) {
  return callback(null, true);
}
```

Mobile native HTTP clients (Axios in React Native) do not send a browser `Origin` header. CORS does not block them.

### 4. Not the cause: Docker port binding (before fix)

Docker already published `5000:5000`. Node's default listen can accept external connections, but binding was implicit. Explicit `0.0.0.0` added for clarity and reliability.

### 5. Cleartext HTTP (monitoring)

Dev uses HTTP (`EXPO_PUBLIC_ALLOW_HTTP=true`). `app.config.js` sets `usesCleartextTraffic` when allow-http is enabled. Expo Go generally permits cleartext in development; this was not the primary failure mode.

---

## Fixes Applied

### Mobile — `src/config/index.js` (rewrite)

**New resolution order on physical device:**

1. If `EXPO_PUBLIC_API_URL` is set to a **non-loopback** LAN IP → use it (manual override)
2. Else use **Metro debugger host** (`getExpoDevHost()`) — same IP as Expo QR code
3. Else throw a clear error (never fall back to localhost)

**Loopback hosts rejected on physical device:** `localhost`, `127.0.0.1`, `::1`

**Emulator/simulator unchanged:**
- Android emulator → `10.0.2.2:5000`
- iOS simulator → `127.0.0.1:5000`

**Debug logging enhanced:**
```
[Hallora] API http://10.181.59.52:5000 (android, device=true, metro=10.181.59.52)
```

### Mobile — `.env` / `.env.example`

Removed hardcoded `localhost` and LAN IP. Auto-detection enabled:

```env
EXPO_PUBLIC_ALLOW_HTTP=true
EXPO_PUBLIC_API_PORT=5000
# EXPO_PUBLIC_API_URL unset — auto-detect from Metro
```

### Mobile — `src/api/errors.js` + `src/api/client.js`

Network errors now include actionable hints when URL contains loopback on device.

### Mobile — `app.config.js`

`usesCleartextTraffic: true` when `EXPO_PUBLIC_ALLOW_HTTP=true` (including dev builds).

### Backend — `server.js`

```javascript
app.listen(PORT, "0.0.0.0", () => { ... });
```

Ensures Docker container accepts connections from LAN devices, not only container-local loopback.

---

## Modified Files

| File | Change |
|------|--------|
| `mobile-app/src/config/index.js` | Smart URL resolution; block loopback on physical device |
| `mobile-app/.env` | Remove localhost/LAN IP; enable auto-detect |
| `mobile-app/.env.example` | Updated documentation |
| `mobile-app/src/api/errors.js` | Better network error messages |
| `mobile-app/src/api/client.js` | Pass `BASE_URL` into error mapper |
| `mobile-app/app.config.js` | Cleartext traffic for dev HTTP |
| `backend/server.js` | Bind `0.0.0.0:5000` explicitly |

---

## Verification Checklist

| Check | Status |
|-------|--------|
| Backend `/health` on PC | ✅ `200 OK` |
| Docker port `5000:5000` | ✅ Configured in `docker-compose.yml` |
| CORS blocks mobile | ❌ Not applicable (native client) |
| `.env` localhost removed | ✅ |
| Physical device auto-detect | ✅ Code in place — restart Expo required |
| Backend LAN reachable from phone | ⚠️ User must confirm same Wi‑Fi + Windows firewall allows port 5000 |

---

## How to Test (Physical Android + Expo Go)

1. **Restart Expo** (required after `.env` change):
   ```powershell
   cd mobile-app
   npx expo start -c
   ```

2. Confirm Metro shows LAN IP, e.g.:
   ```
   Metro waiting on exp://10.181.59.52:8081
   ```

3. Scan QR with Expo Go on phone (**same Wi‑Fi** as PC).

4. In app logs, confirm:
   ```
   [Hallora] API http://10.181.59.52:5000 (android, device=true, metro=10.181.59.52)
   ```
   **NOT** `localhost:5000`.

5. Test login — should reach `POST /api/auth/login`.

6. If still failing:
   - Allow port **5000** in Windows Firewall ( inbound TCP )
   - Confirm Docker backend running: `docker compose ps`
   - Optional manual override in `.env`:
     ```env
     EXPO_PUBLIC_API_URL=http://YOUR_PC_LAN_IP:5000
     ```
     Use the same IP Metro shows (never `localhost`).

7. **Restart Docker backend** to pick up `0.0.0.0` bind:
   ```powershell
   docker compose restart backend
   ```

---

## Configuration Reference

| Environment | Recommended `EXPO_PUBLIC_API_URL` |
|-------------|-----------------------------------|
| Physical device + Expo Go | **Unset** (auto-detect from Metro) |
| Android emulator | `http://10.0.2.2:5000` |
| iOS simulator | unset or `http://127.0.0.1:5000` |
| Production EAS build | `https://your-api.example.com` |

---

## Architecture Diagram

```
┌─────────────────────┐         Wi‑Fi LAN          ┌──────────────────────┐
│  Android Phone      │  exp://10.x.x.x:8081       │  Dev PC              │
│  (Expo Go)          │ ─────────────────────────► │  Metro Bundler       │
│                     │                            │                      │
│  Axios API calls    │  http://10.x.x.x:5000      │  Docker backend      │
│  MUST use LAN IP    │ ─────────────────────────► │  0.0.0.0:5000        │
│  NOT localhost      │                            │                      │
└─────────────────────┘                            └──────────────────────┘

❌ http://localhost:5000 from phone → phone itself → connection refused
✅ http://10.x.x.x:5000 from phone → PC Docker → success
```

---

*Report generated after code audit, log analysis, and backend connectivity test.*
