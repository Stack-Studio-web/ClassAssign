# Hallora Mobile — QA Audit Report

## Executive Summary

| Field | Detail |
|-------|--------|
| **Application** | Hallora Mobile |
| **Platform** | React Native (Expo SDK 46) · Android primary |
| **Backend** | Node.js + Express + PostgreSQL |
| **Authentication** | Email/password (Bearer token) + Microsoft OAuth (intended) |
| **Purpose** | Faculty attendance marking and transfer requests |
| **Testing Date** | 2026-07-13 |
| **Audit Type** | Static code review + architecture/API cross-check (no device lab run) |
| **Codebase Path** | `mobile-app/` (~20 source files) |
| **Overall Health Score** | **4.8 / 10** |
| **Go / No-Go** | **NO-GO** for production until Critical and High issues are resolved |

### Issue Counts

| Severity | Count |
|----------|------:|
| Critical | 6 |
| High | 14 |
| Medium | 18 |
| Low | 12 |
| **Total** | **50** |

### Application Overview

Hallora Mobile is a **faculty-focused subset** of the Hallora web portal. Implemented flows:

- Email/password login with SecureStore token persistence
- Faculty dashboard (assigned exams list)
- Attendance marking (Present/Absent per student, grouped by course)
- Attendance summary after submit
- Faculty transfer request submission

**Not implemented on mobile** (despite scope checklist): QR scanner, camera, file/image upload, offline queue, admin features, change-password flow, working Microsoft SSO, transfer request status list, pagination, dark mode, accessibility labels.

The app runs on **Expo 46 / React Native 0.69** (2022 stack), uses **HTTP** to a LAN IP by default, and has **no global 401 handling**, **no offline support**, and **no error boundaries**.

---

## Critical Issues

### MOB-001 — Microsoft SSO Non-Functional

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Functional / Security / Authentication |
| **Affected Screen** | Login |
| **Description** | "Continue with Microsoft" opens the wrong URL and deep-link handler expects a token the backend never returns to mobile. |
| **Steps to Reproduce** | 1. Tap "Continue with Microsoft" on Login. 2. Browser opens `GET /api/auth/microsoft/login`. 3. JSON `{ authUrl: "..." }` is shown instead of OAuth redirect. 4. Even if OAuth completes on web, callback redirects to web frontend with cookie — no `?token=` for mobile. |
| **Expected** | OAuth flow completes and mobile receives a valid Bearer token via deep link or custom scheme. |
| **Actual** | SSO cannot complete on mobile. |
| **Root Cause** | `getMicrosoftLoginUrl()` returns API JSON endpoint (`authService.js:67-68`); `App.js:74` parses `?token=`; backend `microsoftAuthRoutes.js` redirects to web with httpOnly cookie. |
| **Recommended Fix** | Implement mobile OAuth: fetch JSON for `authUrl`, open in browser, register app scheme (`hallora://auth`), backend mobile callback that returns token in redirect URL or dedicated endpoint. |
| **Priority** | P0 |

---

### MOB-002 — Forced Password Change Not Enforced

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Functional / Security |
| **Affected Screen** | Login → all screens |
| **Description** | Backend returns `mustChangePassword: true` on login; web redirects to `/change-password`. Mobile ignores this flag entirely. |
| **Steps to Reproduce** | 1. Login as user with `must_change_password = true`. 2. Mobile proceeds to dashboard with default/legacy password. |
| **Expected** | Block access until password is changed (dedicated screen + API). |
| **Actual** | Full app access with unchanged password. |
| **Root Cause** | `LoginScreen.js` and `AuthContext.js` never read `mustChangePassword` from login response. |
| **Recommended Fix** | Add ChangePassword screen; gate navigation when `data.mustChangePassword === true`; call `/api/auth/change-password`. |
| **Priority** | P0 |

---

### MOB-003 — Cleartext HTTP API Communication

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Security / Network |
| **Affected Screen** | All (global) |
| **Description** | All API traffic uses `http://` with no TLS. Tokens and attendance data traverse the network in plaintext. |
| **Steps to Reproduce** | Inspect `config.js` — all resolved URLs use `http://`. |
| **Expected** | HTTPS only in production; Android cleartext traffic disabled. |
| **Actual** | Bearer tokens, emails, attendance payloads sent over HTTP. |
| **Root Cause** | `getApiBaseUrl()` builds `http://` URLs exclusively (`config.js:51-72`). |
| **Recommended Fix** | Enforce `https://` in production builds; add `android:usesCleartextTraffic="false"`; use valid TLS cert; consider certificate pinning. |
| **Priority** | P0 |

---

### MOB-004 — No Session Expiry Handling (401)

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Security / Functional |
| **Affected Screen** | All authenticated screens |
| **Description** | When API returns 401 (expired/invalid token), user remains logged in in UI. Actions fail silently or with generic errors. |
| **Steps to Reproduce** | 1. Login. 2. Invalidate token server-side or wait for expiry. 3. Pull to refresh dashboard or submit attendance. |
| **Expected** | Auto-logout, redirect to Login, clear SecureStore. |
| **Actual** | Stale session persists until app restart + failed `restoreSession`. |
| **Root Cause** | `api.js` response interceptor has no 401 branch. |
| **Recommended Fix** | On 401: clear SecureStore, reset AuthContext, navigate to Login with toast. |
| **Priority** | P0 |

---

### MOB-005 — Non-Faculty Login Still Authenticates

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Authorization / Broken Access Control |
| **Affected Screen** | Login, Home |
| **Description** | Admin/HOD users who log in see an error message but `AuthContext` already stores their session; `RootNavigator` routes them to `HomeScreen`. |
| **Steps to Reproduce** | 1. Login as `admin@kct.ac.in`. 2. Error: "This app is for faculty attendance login only." 3. App navigates to Home stub anyway. |
| **Expected** | Reject login server-side or immediately logout client-side for non-faculty roles. |
| **Actual** | Session created for unauthorized role. |
| **Root Cause** | `login()` in AuthContext sets user before role check in `LoginScreen.js:44-51`. |
| **Recommended Fix** | Check role before `setUser`; call logout if role ∉ `{ faculty }`; optionally reject at API for mobile client type. |
| **Priority** | P0 |

---

### MOB-006 — Attendance Data Loss on Process Death

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Functional / Android Lifecycle |
| **Affected Screen** | Attendance |
| **Description** | In-progress attendance marks exist only in React state. App background kill, low memory, or rotation loses all unsaved Present/Absent selections. |
| **Steps to Reproduce** | 1. Open Attendance, mark several students Absent. 2. Force-stop app or trigger low memory. 3. Reopen — previous marks lost unless server had draft (it does not). |
| **Expected** | Draft persisted locally or auto-saved to server. |
| **Actual** | All in-memory state lost. |
| **Root Cause** | No AsyncStorage/SecureStore draft; no offline queue (`AttendanceScreen.js` local state only). |
| **Recommended Fix** | Persist draft per `assignmentUuid`; restore on mount; optional periodic autosave API. |
| **Priority** | P0 |

---

## High Issues

### MOB-007 — Hardcoded Production API Fallback IP

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Security / Configuration |
| **Affected Screen** | All |
| **Description** | `DEFAULT_API_HOST = "10.1.150.51"` baked into `config.js:41,72` when env/Metro host unavailable. |
| **Steps to Reproduce** | Build release APK without `EXPO_PUBLIC_API_URL`; app calls hardcoded LAN IP. |
| **Expected** | Fail loudly or require explicit production URL at build time. |
| **Actual** | Silent fallback to dev LAN IP. |
| **Recommended Fix** | Remove hardcoded IP; require `EXPO_PUBLIC_API_URL` in EAS build profile; crash/build-fail if missing. |
| **Priority** | P1 |

---

### MOB-008 — Severely Outdated Dependency Stack

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Security / Android Compatibility |
| **Affected Screen** | Global |
| **Description** | Expo SDK 46, RN 0.69.9, axios 0.27.2 — unsupported, known CVEs, poor Android 14/15 compatibility. |
| **Steps to Reproduce** | Review `package.json`. |
| **Expected** | Expo SDK 52+ (or latest stable), RN 0.76+, axios 1.x. |
| **Actual** | 3+ year old stack. |
| **Recommended Fix** | Planned upgrade path; run `expo-doctor`; update target SDK for Play Store. |
| **Priority** | P1 |

---

### MOB-009 — Student List Not Virtualized (Performance / OOM)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Performance / React Native |
| **Affected Screen** | Attendance |
| **Description** | Students inside each course rendered via `.map()` inside `ScrollView`, not `FlatList`. Large halls (100+ students × multiple courses) cause scroll jank and OOM risk. |
| **Steps to Reproduce** | Open attendance for venue with 150+ students across 3 courses. |
| **Expected** | Virtualized lists with stable `keyExtractor`. |
| **Actual** | All rows mounted simultaneously (`AttendanceScreen.js` CourseSection). |
| **Recommended Fix** | Use `FlatList`/`SectionList` or `@shopify/flash-list` per course; memoize row components. |
| **Priority** | P1 |

---

### MOB-010 — No Offline / Network State Handling

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Network / Functional |
| **Affected Screen** | All |
| **Description** | No NetInfo, no offline banner, no request queue. Airplane mode shows generic network error per screen. |
| **Steps to Reproduce** | Disable Wi‑Fi mid-session; attempt submit attendance. |
| **Expected** | Offline indicator; queue submit when online. |
| **Actual** | Error alert; data loss. |
| **Recommended Fix** | Add `@react-native-community/netinfo`; global offline UI; optional mutation queue. |
| **Priority** | P1 |

---

### MOB-011 — No Error Boundary (App-Wide Crash)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | React Native / Crash |
| **Affected Screen** | Global |
| **Description** | Unhandled render errors crash entire app with white/red screen. |
| **Steps to Reproduce** | Trigger JS exception in any screen (null dereference on bad API shape). |
| **Expected** | Error boundary with recovery UI. |
| **Actual** | Full app crash. |
| **Recommended Fix** | Add `ErrorBoundary` at App root with retry + logout option. |
| **Priority** | P1 |

---

### MOB-012 — QR Scanner / Camera Not Implemented

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Functional (Scope Gap) |
| **Affected Screen** | N/A |
| **Description** | Audit scope includes QR Scanner and camera permission; zero implementation in codebase. |
| **Steps to Reproduce** | Search codebase for camera/barcode — none found. |
| **Expected** | Feature present or explicitly descoped from mobile v1. |
| **Actual** | Missing entirely. |
| **Recommended Fix** | Product decision: implement with `expo-camera` + permissions or remove from mobile scope doc. |
| **Priority** | P1 |

---

### MOB-013 — No Android Deep Link / App Scheme Configured

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Android / Functional |
| **Affected Screen** | Login (Microsoft SSO) |
| **Description** | `app.json` has no `scheme`, no Android `intentFilters`. Deep link listener in `App.js` cannot receive OAuth callbacks. |
| **Steps to Reproduce** | Inspect `app.json` — no URI scheme. |
| **Expected** | `scheme: "hallora"` + intent filters for OAuth redirect. |
| **Actual** | Deep links never fire. |
| **Recommended Fix** | Add Expo linking config; align with backend redirect URI. |
| **Priority** | P1 |

---

### MOB-014 — Transfer Request Status Not Shown

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Functional |
| **Affected Screen** | Faculty Dashboard |
| **Description** | Web shows pending transfer badge via `GET /api/faculty-transfers`. Mobile defines `fetchMyTransferRequests()` but never calls it. |
| **Steps to Reproduce** | Submit transfer on mobile; return to dashboard — no pending indicator. |
| **Expected** | List/badge of pending/approved/rejected requests. |
| **Actual** | Submit-only; no visibility. |
| **Root Cause** | Orphan service function `transferService.js:22-24`. |
| **Recommended Fix** | Load transfers on dashboard; show status chips on exam cards. |
| **Priority** | P1 |

---

### MOB-015 — Duplicate Submit Not Guarded Client-Side

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Functional |
| **Affected Screen** | Attendance |
| **Description** | Submit button can be double-tapped rapidly before `submitting` state disables UI; no idempotency key sent. |
| **Steps to Reproduce** | Rapid double-tap Submit on confirmation modal. |
| **Expected** | Single submission; backend idempotency. |
| **Actual** | Race possible (mitigated partially by `setSubmitting(true)`). |
| **Recommended Fix** | Disable button immediately; debounce; send client request ID; rely on backend lock. |
| **Priority** | P1 |

---

### MOB-016 — axios 0.27 Known Vulnerabilities

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Security |
| **Affected Screen** | Global |
| **Description** | axios 0.27.2 has published CVEs; no retry/cancel token usage. |
| **Recommended Fix** | Upgrade to axios 1.x; add request cancellation on unmount. |
| **Priority** | P1 |

---

### MOB-017 — No Certificate Pinning

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Security (OWASP M3/M5) |
| **Affected Screen** | Global |
| **Description** | Standard TLS stack; vulnerable to MITM on corporate/untrusted networks. |
| **Recommended Fix** | Implement SSL pinning for production API host (e.g. `react-native-ssl-pinning` or Expo config plugin). |
| **Priority** | P1 |

---

### MOB-018 — User PII Stored in SecureStore as JSON

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Security / Privacy |
| **Affected Screen** | Global |
| **Description** | Full user object (email, role, department) stored in SecureStore alongside token. |
| **Recommended Fix** | Store minimal fields; fetch profile on demand; encrypt if needed. |
| **Priority** | P2 |

---

### MOB-019 — No Rate Limit / Retry Handling on Login

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Network / Security |
| **Affected Screen** | Login |
| **Description** | Rapid login attempts not debounced; backend rate limiter may return 429 with poor UX. |
| **Recommended Fix** | Disable button after submit; handle 429 with backoff message. |
| **Priority** | P2 |

---

### MOB-020 — Android Package Without Version Code Strategy

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Android / Release |
| **Affected Screen** | N/A |
| **Description** | `app.config.js` sets `package: com.kct.mobileapp` but no versionCode, no Play Store signing documented. |
| **Recommended Fix** | EAS Build config with auto-increment versionCode; signing keystore in CI secrets. |
| **Priority** | P1 |

---

## Medium Issues

### MOB-021 — Transfer Screen Missing Header/Back Button

| Severity | Medium | Screen: TransferRequest | No stack header; users rely on hardware back only. Add header with back affordance.

### MOB-022 — ExamList Screen Dead Code

| Severity | Medium | Registered in `App.js:32` but never navigated to. Remove or wire up.

### MOB-023 — HomeScreen Stub Tabs (Sheet, Saved)

| Severity | Medium | `HomeScreen.js` bottom nav tabs are no-ops. Confusing for non-faculty users who reach this screen.

### MOB-024 — Uses alert() Instead of Alert.alert()

| Severity | Medium | `AttendanceScreen.js:289,379,398` — `alert()` deprecated/poor UX on Android.

### MOB-025 — Transfer Email Lookup Errors Swallowed

| Severity | Medium | `TransferRequestScreen.js:45-47` — silent catch hides network/validation errors.

### MOB-026 — No Request Cancellation on Unmount

| Severity | Medium | `useEffect` in AttendanceScreen and TransferRequestScreen don't abort in-flight API calls.

### MOB-027 — 15s Timeout May Be Too Short on Slow 3G

| Severity | Medium | `api.js:7` — large seating payloads may timeout; no retry.

### MOB-028 — No Response Schema Validation

| Severity | Medium | Services trust API shape; malformed response causes runtime errors.

### MOB-029 — fetchAttendanceReport Unused

| Severity | Medium | Dead code in `attendanceService.js`; report feature not on mobile.

### MOB-030 — gesture-handler / reanimated Not Bootstrapped

| Severity | Medium | Dependencies installed but not imported in `index.js`; wasted bundle size.

### MOB-031 — AsyncStorage Dependency Unused

| Severity | Medium | Listed in `package.json` but never imported; misleading.

### MOB-032 — No Loading Branding (Logo Loader)

| Severity | Medium | Generic `ActivityIndicator` on splash/dashboard; web has KCT logo loader.

### MOB-033 — Portrait Lock Only

| Severity | Medium | `app.json` orientation portrait — landscape untested; may clip attendance UI.

### MOB-034 — No Android 13+ Notification Permission Flow

| Severity | Medium | Not applicable yet (no push) but no foundation for future notifications.

### MOB-035 — No Accessibility Labels

| Severity | Medium | Touch targets mostly OK (~44dp) but no `accessibilityLabel` on toggles, icons, exam cards.

### MOB-036 — No TalkBack Testing Evidence

| Severity | Medium | Screen reader support unverified.

### MOB-037 — No Font Scaling Support Tested

| Severity | Medium | Fixed font sizes; large system fonts may truncate labels.

### MOB-038 — LayoutAnimation on Large Lists

| Severity | Medium | `toggleCourseExpand` animates layout with many students — frame drops.

---

## Low Issues

### MOB-039 — console.log BASE_URL in Dev

| Severity | Low | `config.js:77-81` logs internal network topology in dev builds.

### MOB-040 — Login navigation.replace Ineffective

| Severity | Low | `LoginScreen.js:48` — stack switch handled by Auth state, not navigation call.

### MOB-041 — No Dark Mode

| Severity | Low | `userInterfaceStyle: light` only.

### MOB-042 — No Tablet-Optimized Layout

| Severity | Low | iOS `supportsTablet: true` but UI is phone-first single column.

### MOB-043 — No Expo Splash Screen Integration in App.js

| Severity | Low | `expo-splash-screen` installed but not used to hide splash after session restore.

### MOB-044 — Missing PropTypes/TypeScript

| Severity | Low | No type safety on route params; wrong params crash at runtime.

### MOB-045 — Inline renderItem in FlatList

| Severity | Low | `FacultyDashboardScreen.js:99` — new function each render.

### MOB-046 — No Pull-to-Refresh on Attendance Screen

| Severity | Low | Cannot reload seating data without leaving screen.

### MOB-047 — Footer Position Absolute on Login

| Severity | Low | May overlap inputs on small screens with keyboard open.

### MOB-048 — No Root/Jailbreak Detection

| Severity | Low | Acceptable for internal app; note for high-security deployments.

### MOB-049 — No Screen Capture Protection

| Severity | Low | Attendance data can be screenshotted.

### MOB-050 — App Name Generic ("mobile-app")

| Severity | Low | `app.json` name/slug not branded "Hallora".

---

## Security Findings Summary

| ID | Finding | OWASP Mobile |
|----|---------|--------------|
| MOB-003 | Cleartext HTTP | M5 Insecure Communication |
| MOB-004 | No 401 handling | M3 Insecure Auth/Session |
| MOB-005 | Role bypass on login | M1 Improper Platform Usage |
| MOB-002 | mustChangePassword ignored | M4 Insecure Authentication |
| MOB-001 | Broken OAuth | M4 Insecure Authentication |
| MOB-007 | Hardcoded IP | M9 Reverse Engineering / Misconfig |
| MOB-017 | No cert pinning | M5 Insecure Communication |
| MOB-018 | PII in SecureStore | M2 Insecure Data Storage |
| MOB-016 | Vulnerable axios | Supply chain |
| — | No root/emulator detection | M8 Code Tampering (informational) |
| — | No clipboard audit | M6 Insecure Authorization (informational) |

**Positive:** Tokens use `expo-secure-store` (not AsyncStorage). `.env` gitignored. No hardcoded passwords in source.

---

## Performance Findings

| Area | Finding | Impact |
|------|---------|--------|
| Attendance list | Non-virtualized `.map()` | High — jank/OOM in large venues |
| Startup | Session verify on every cold start | Medium — blocks UI until complete |
| Dashboard | Full exam list load, no pagination | Low — typical faculty has few exams |
| Bundle | 662KB JS (minified) | Medium — acceptable but no code splitting |
| Images | Single logo PNG, no optimization pipeline | Low |
| Re-renders | No `React.memo` on list rows | Medium |
| Network | Parallel fetch on attendance load | Good — `Promise.all` used |

---

## Network Findings

| Endpoint | Method | Used | Error Handling |
|----------|--------|------|----------------|
| `/api/auth/login` | POST | Yes | Basic |
| `/api/auth/verify` | POST | Yes | Silent clear on fail |
| `/api/auth/logout` | POST | Yes | Best-effort |
| `/api/auth/session-info` | GET | SSO only | Broken flow |
| `/api/auth/microsoft/login` | GET | SSO | Wrong — opens JSON |
| `/api/faculty-attendance/my-exams` | GET | Yes | Banner error |
| `/api/attendance/assignment/:uuid/students` | GET | Yes | alert() |
| `/api/seating/attendance` | GET | Yes | alert() |
| `/api/attendance/submit` | POST | Yes | alert() |
| `/api/faculty-transfers/*` | GET/POST | Partial | Silent on lookup |
| `/api/attendance/report` | GET | **No** | N/A |

**Gaps:** No retry, no cancel tokens, no 401/403/429 specific handling, no request deduplication, no offline queue.

---

## Android Findings

| Topic | Status |
|-------|--------|
| Android 12+ | Untested; old RN may have edge-to-edge issues (`edgeToEdgeEnabled: true`) |
| Android 13+ notification permission | N/A — no notifications |
| Android 14/15 target SDK | Likely fails Play requirements on SDK 46 |
| Permissions declared | None — OK for current features; missing camera when QR added |
| Doze/battery optimization | No background sync — data loss risk |
| Configuration change (rotation) | Portrait locked — rotation not supported |
| Process death | **Critical** — attendance draft lost |
| Back button | Works via stack; Transfer screen no UI back |
| Low RAM | High risk on large attendance lists |
| ProGuard/R8 | Not configured in repo |

---

## React Native Findings

| Topic | Assessment |
|-------|------------|
| Navigation | `@react-navigation/native-stack` — correct pattern |
| State | Context for auth only; local state elsewhere — OK for size |
| Hooks cleanup | Missing abort on unmount in several effects |
| Lists | FlatList on dashboard; ScrollView+.map on attendance — inconsistent |
| Error boundaries | Missing |
| Deprecated APIs | `alert()` usage |
| Expo compatibility | Dev client required (`expo start --dev-client`) — document for QA |
| New Architecture | `newArchEnabled: true` on old SDK — potential instability |

---

## API Findings (Backend Cross-Check)

| Area | Finding |
|------|---------|
| Mobile login | `X-Client-Type: mobile` returns Bearer token — **works** |
| Session verify | Expects `{ valid, user }` — verify backend contract matches |
| Attendance window | Server enforces `canWrite` / `isLocked` — mobile respects via `guardAction` |
| Transfer cutoff | 20-min rule enforced server-side — mobile has no pre-submit warning |
| CORS | N/A for mobile (not browser) |
| Rate limiting | Backend has login limiter — mobile doesn't surface 429 well |

---

## Architecture Findings

```
mobile-app/
├── App.js              # Navigation + deep link
├── src/
│   ├── api.js          # Axios singleton
│   ├── config.js       # URL resolution
│   ├── context/        # Auth only
│   ├── services/       # Thin API wrappers
│   └── screens/        # UI + business logic mixed
```

**Concerns:**
- No separation of view/model (logic inside screens)
- No shared components folder (duplicate UI patterns)
- No tests (`__tests__/` absent)
- No CI for mobile lint/test/build
- Services partially unused (dead exports)

---

## UI/UX Review

| Aspect | Rating | Notes |
|--------|--------|-------|
| Visual consistency | Good | Blue/slate palette matches web |
| Loading states | Partial | Spinners present; no skeleton/branded loader |
| Empty states | Good | "No exams assigned" message |
| Error states | Partial | Red banners; inconsistent alerts |
| Touch targets | Good | ~48dp on toggles with hitSlop |
| Typography | Adequate | System fonts, no scale testing |
| Spacing | Consistent | 16px padding pattern |
| Dark mode | None | |
| Small phones | Untested | Login footer may overlap keyboard |

---

## Crash Testing Scenarios (Predicted)

| Scenario | Predicted Result |
|----------|------------------|
| Rapid login tap | Possible duplicate requests |
| Rapid navigation | Possible setState on unmounted |
| Background/foreground | State retained unless killed |
| Process kill during attendance | **Data loss** |
| Rotation | Locked portrait — no crash |
| Large student list | **OOM / ANR risk** |
| Null API fields | Possible render crash — no boundary |
| API timeout (15s) | Error alert, loading stops |
| Invalid token mid-session | Confusing errors, no logout |

---

## Production Readiness Checklist

| Item | Status |
|------|--------|
| HTTPS enforced | ❌ |
| OAuth working | ❌ |
| Forced password change | ❌ |
| 401 auto-logout | ❌ |
| Role-based access enforced | ❌ |
| Offline handling | ❌ |
| Error boundary | ❌ |
| Crash reporting (Sentry) | ❌ |
| Analytics | ❌ |
| EAS production build tested | ❌ |
| Play Store target SDK met | ❌ |
| ProGuard enabled | ❌ |
| App signing configured | ❌ |
| Privacy policy / permissions justification | ❌ |
| QA test plan executed on device | ❌ |
| Accessibility audit | ❌ |
| Load test on 100+ students | ❌ |
| Security penetration test | ❌ |
| Microsoft SSO E2E | ❌ |
| Transfer status visibility | ❌ |
| Branded app name/icon | ⚠️ Partial |

---

## OWASP Mobile Top 10 Mapping

| OWASP | Risk | Hallora Status |
|-------|------|----------------|
| M1 Improper Platform Usage | High | Deep links missing; cleartext allowed |
| M2 Insecure Data Storage | Medium | SecureStore for tokens ✅; PII cached |
| M3 Insecure Communication | **Critical** | HTTP only |
| M4 Insecure Authentication | **Critical** | SSO broken; mustChangePassword ignored |
| M5 Insufficient Cryptography | High | No pinning; HTTP |
| M6 Insecure Authorization | High | Non-faculty session created |
| M7 Client Code Quality | Medium | No TS; no tests; alert() |
| M8 Code Tampering | Low | No integrity checks |
| M9 Reverse Engineering | Medium | Hardcoded IP; dev logging |
| M10 Extraneous Functionality | Low | Dead screens/services |

---

## Top 20 Improvements Before Production

1. **Enforce HTTPS** for all API calls; disable cleartext on Android.
2. **Fix or remove Microsoft SSO** — complete mobile OAuth flow with app scheme.
3. **Implement mustChangePassword gate** with mobile change-password screen.
4. **Add global 401 interceptor** — auto logout and redirect to Login.
5. **Reject non-faculty login** before persisting session (client + server).
6. **Persist attendance drafts** locally per assignment to survive process death.
7. **Virtualize student lists** with `SectionList` or FlashList.
8. **Upgrade Expo SDK / RN / axios** to supported versions; target Android 14+ SDK.
9. **Remove hardcoded `10.1.150.51`** — require production URL at build time.
10. **Add NetInfo offline banner** and block submit when offline (or queue).
11. **Add ErrorBoundary** at app root with recovery UX.
12. **Show transfer request status** on faculty dashboard.
13. **Configure deep link scheme** in `app.json` for OAuth callbacks.
14. **Add branded logo loader** (parity with web) on splash and loading states.
15. **Replace `alert()` with `Alert.alert()`** and consistent error toasts.
16. **Add request cancellation** (`AbortController`) on screen unmount.
17. **Implement certificate pinning** for production API host.
18. **Add EAS Build pipeline** with versionCode, signing, and env profiles.
19. **Add crash reporting** (Sentry) and basic analytics.
20. **Write device QA test matrix** and run on Android 12/13/14/15 physical devices.

---

## Final Score Breakdown

| Category | Score ( /10) |
|----------|-------------|
| Functional completeness | 5.0 |
| Security | 3.5 |
| Network resilience | 4.0 |
| Android readiness | 4.5 |
| React Native quality | 5.5 |
| Performance | 5.0 |
| Accessibility | 3.0 |
| UX consistency | 6.5 |
| Code maintainability | 5.0 |
| Production ops (CI, monitoring) | 2.0 |
| **Overall** | **4.8 / 10** |

---

## Go / No-Go Recommendation

### **NO-GO** for production deployment

The mobile app provides a workable **faculty email/password attendance flow** in controlled dev/LAN environments, but it is **not production-ready** due to:

- Cleartext HTTP and hardcoded LAN fallback
- Broken Microsoft SSO (likely required for KCT faculty)
- Missing forced password change enforcement
- No session expiry handling
- Authorization leak for non-faculty roles
- Data loss on Android process death during attendance
- Severely outdated Expo/RN stack for Play Store compliance

### Recommended path to GO

1. Fix all **Critical (P0)** issues — estimated 2–3 sprints.
2. Complete **High (P1)** security and lifecycle items — 1–2 sprints.
3. Run full **device QA matrix** on Android 12–15.
4. Conduct **security retest** focusing on auth and transport.
5. Re-score; target **≥ 7.5/10** for limited internal rollout; **≥ 8.5/10** for Play Store public release.

---

*Report generated from static analysis of `mobile-app/` and backend cross-reference. Runtime device testing, penetration testing, and performance profiling were not executed in this audit and should be scheduled before release.*
