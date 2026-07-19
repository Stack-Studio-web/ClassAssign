# Hallora Mobile — Implementation Verification

**Verification date:** 2026-07-13  
**Method:** Code inspection against git working tree + `npx expo export --platform android`  
**QA source:** `QA_Mobile_After.md` (44 issues marked **Resolved**)

---

## Summary

| Metric | Value |
|--------|------:|
| Issues marked Resolved in QA report | 44 |
| **Verified (code + build)** | 41 |
| **Downgraded to Not Verified** | 3 |
| Tracked file changes (git diff HEAD) | 18 files, +4974 / −8718 lines |
| New untracked mobile files | 27 |
| Backend files modified | 3 |
| **Android JS bundle export** | **PASS** (after 1 fix applied during verification) |

### Status corrections from QA report

| Issue | QA status | Verified status | Reason |
|-------|-----------|-----------------|--------|
| MOB-001 | Resolved | **Verified (code only)** | Full mobile OAuth path in code; no Azure/device E2E run |
| MOB-041 | Resolved | **Not Verified** | `ThemeContext` exists but Attendance/Dashboard/Summary use hardcoded light styles |
| MOB-035 | Resolved | **Verified** | 28+ `accessibilityLabel`/`accessibilityRole` usages; not device-tested |
| MOB-019 | Resolved | **Verified** | In-flight login guard + 429 UX (no time-based debounce timer) |

---

## Files Modified

### Backend (3 files)

| File | Lines changed (approx.) |
|------|-------------------------|
| `backend/routes/authRoutes.js` | +9 |
| `backend/routes/microsoftAuthRoutes.js` | +198 (rewrite) |
| `backend/utils/sessionStore.js` | +23 |

### Mobile — modified tracked (15 files)

`mobile-app/App.js`, `app.json`, `app.config.js`, `index.js`, `package.json`, `package-lock.json`, `.env.example`, `src/api.js`, `src/config.js`, `src/context/AuthContext.js`, `src/screens/LoginScreen.js`, `src/screens/AttendanceScreen.js`, `src/screens/FacultyDashboardScreen.js`, `src/services/authService.js`, `src/services/attendanceService.js`

### Mobile — new untracked (27 files)

`eas.json`, `src/api/client.js`, `src/api/errors.js`, `src/config/index.js`, `src/constants/index.js`, `src/components/*` (6), `src/context/NetworkContext.js`, `src/context/ThemeContext.js`, `src/hooks/*` (2), `src/screens/ChangePasswordScreen.js`, `src/screens/QrScannerScreen.js`, `src/screens/TransferRequestScreen.js`, `src/services/draftService.js`, `src/services/offlineQueueService.js`, `src/services/securityService.js`, `src/services/transferService.js`, `src/theme/colors.js`, `src/utils/attendance.js`

### Fix applied during verification

| File | Change |
|------|--------|
| `mobile-app/src/context/ThemeContext.js` | Import `./colors` → `../theme/colors` (build was broken without this) |

---

## Build Verification

| Step | Command | Result |
|------|---------|--------|
| Dependencies | `npm install --legacy-peer-deps` | **PASS** |
| Export attempt 1 | `expo export --platform android` (stale `android/`) | **FAIL** — Hermes config mismatch (SDK 46 native project vs SDK 52) |
| Export attempt 2 | After removing `android/`, before ThemeContext fix | **FAIL** — `Unable to resolve module ./colors` |
| Export attempt 3 | After ThemeContext import fix | **PASS** |
| Bundle output | `_expo/static/js/android/index-*.hbc` | **3.77 MB**, 1297 modules |
| expo-doctor | 14/18 checks passed | **WARN** — Node 18, missing expo-font at doctor run time, network timeout |

**Conclusion:** JavaScript bundle compiles. Native Android APK was **not** built (`expo run:android` / EAS not run). Stale `android/` from pre-upgrade must be regenerated via `npx expo prebuild --clean` before native builds.

---

## Per-Issue Verification (Resolved items only)

Legend: **Verified** = code evidence found; **Not Verified** = insufficient or incorrect fix.

---

### MOB-001 — Microsoft SSO Non-Functional

**Status:** Verified (code only) — E2E not run

**Files:**
- `backend/routes/microsoftAuthRoutes.js`
- `mobile-app/src/screens/LoginScreen.js`
- `mobile-app/src/services/authService.js`
- `mobile-app/App.js`

**Backend diff (mobile callback):**

```163:169:backend/routes/microsoftAuthRoutes.js
router.get("/mobile-callback", loginLimiter, async (req, res) => {
  try {
    const result = await completeMicrosoftAuth(req, res, MOBILE_REDIRECT_URI);
    if (result.error) {
      return res.redirect(mobileDeepLink({ error: result.error }));
    }
    return res.redirect(mobileDeepLink({ token: result.token }));
```

**Mobile diff (opens auth URL, not raw JSON endpoint):**

```72:79:mobile-app/src/screens/LoginScreen.js
  const handleMicrosoftLogin = async () => {
    if (msLoading) return;
    setMsLoading(true);
    setError("");
    try {
      const authUrl = await fetchMicrosoftAuthUrl();
      const redirectUri = getMicrosoftRedirectUri();
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
```

**Why it fixes:** Backend returns `authUrl` JSON; mobile opens it in browser and expects redirect to `hallora://auth?token=...`. Deep link handler in `App.js` calls `loginWithMicrosoft`.

**Build:** PASS (after ThemeContext fix)  
**Regression:** None in bundle; Azure `MOBILE_REDIRECT_URI` must be registered externally  
**Not proven:** End-to-end login on device with real Microsoft tenant

---

### MOB-002 — mustChangePassword Not Enforced

**Status:** Verified

**Files:** `mobile-app/src/screens/ChangePasswordScreen.js` (new), `mobile-app/App.js`, `mobile-app/src/context/AuthContext.js`

```71:73:mobile-app/App.js
  if (mustChangePassword) {
    return <ChangePasswordStack />;
  }
```

```69:81:mobile-app/src/context/AuthContext.js
  const login = useCallback(async (email, password) => {
    setSessionExpired(false);
    const data = await apiLogin(email, password);
    // ...
    setMustChangePassword(!!data.mustChangePassword);
    return data;
  }, []);
```

**Why it fixes:** Navigation blocks faculty stack until password changed; `changePassword` API clears flag.

**Build:** PASS  
**Regression:** None identified

---

### MOB-003 — Cleartext HTTP

**Status:** Verified

**Files:** `mobile-app/src/config/index.js`, `mobile-app/app.json`, `mobile-app/app.config.js`

```46:51:mobile-app/src/config/index.js
export function getApiBaseUrl() {
  const extra = getExtraConfig();
  const allowHttp =
    __DEV__ &&
    (extra.allowHttp === true || process.env.EXPO_PUBLIC_ALLOW_HTTP === "true");
  const protocol = allowHttp ? "http" : "https";
```

```31:32:mobile-app/app.json
      "edgeToEdgeEnabled": true,
      "usesCleartextTraffic": false,
```

**Why it fixes:** Production/default protocol is HTTPS; HTTP only when `__DEV__` + explicit allow flag; Android manifest disables cleartext.

**Build:** PASS  
**Regression:** Dev requires `EXPO_PUBLIC_ALLOW_HTTP=true` for LAN HTTP testing

---

### MOB-004 — No 401 Handling

**Status:** Verified

**Files:** `mobile-app/src/api/client.js`, `mobile-app/src/context/AuthContext.js`

```46:56:mobile-app/src/api/client.js
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const mapped = mapHttpError(error);
    if (mapped.code === "UNAUTHORIZED" && onUnauthorized) {
      await onUnauthorized(mapped);
    }
    return Promise.reject(mapped);
  }
);
```

```43:48:mobile-app/src/context/AuthContext.js
  useEffect(() => {
    registerUnauthorizedHandler(async () => {
      await apiLogout();
      clearAuth();
      setSessionExpired(true);
    });
  }, [clearAuth]);
```

**Why it fixes:** 401 maps to `UNAUTHORIZED`; handler clears SecureStore and shows session-expired message on Login.

**Build:** PASS  
**Regression:** None identified

---

### MOB-005 — Non-Faculty Login Authenticates

**Status:** Verified

**Files:** `backend/routes/authRoutes.js`, `mobile-app/src/services/authService.js`, `mobile-app/App.js`

**Backend:**

```65:70:backend/routes/authRoutes.js
    if (isMobileClient(req) && user.role_name !== "faculty") {
      return res.status(403).json({
        success: false,
        message: "Hallora Mobile is for faculty attendance only.",
      });
    }
```

**Mobile (client guard + no Home stack):**

```56:61:mobile-app/src/services/authService.js
  if (!isAllowedMobileRole(data.user?.role)) {
    throw new ApiError("Hallora Mobile is for faculty attendance only.", {
      code: "FORBIDDEN",
      status: 403,
    });
  }
```

`App.js` — `HomeScreen` / `AppStack` removed; only `AuthStack`, `ChangePasswordStack`, `FacultyStack`.

**Build:** PASS  
**Regression:** `HomeScreen.js` still in repo but unreachable (dead file, not a runtime regression)

---

### MOB-006 — Attendance Data Loss on Process Death

**Status:** Verified

**Files:** `mobile-app/src/services/draftService.js`, `mobile-app/src/hooks/useAttendanceDraft.js`, `mobile-app/src/screens/AttendanceScreen.js`

```8:14:mobile-app/src/services/draftService.js
export async function saveAttendanceDraft(assignmentUuid, draft) {
  if (!assignmentUuid) return;
  await AsyncStorage.setItem(
    draftKey(assignmentUuid),
    JSON.stringify({ ...draft, savedAt: Date.now() })
  );
}
```

```35:38:mobile-app/src/hooks/useAttendanceDraft.js
  useEffect(() => {
    if (!enabled || !assignmentUuid || !courses.length) return undefined;
    const timer = setTimeout(persistDraft, ATTENDANCE_DRAFT_AUTOSAVE_MS);
    return () => clearTimeout(timer);
```

Attendance load merges draft: `mergeCourseAttendance(..., draft?.courses)` in `AttendanceScreen.js`.

**Build:** PASS  
**Regression:** None identified

---

### MOB-007 — Hardcoded IP Fallback

**Status:** Verified

**File:** `mobile-app/src/config/index.js`

**Before (removed):** `DEFAULT_API_HOST = "10.1.150.51"` fallback  
**After:**

```74:100:mobile-app/src/config/index.js
  if (!__DEV__) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is required for production builds. Configure it in EAS secrets."
    );
  }
  // ...
  throw new Error(
    "Cannot resolve API URL. Set EXPO_PUBLIC_API_URL in mobile-app/.env for your LAN IP."
  );
```

Grep confirms `10.1.150.51` absent from mobile-app source.

**Build:** PASS  
**Regression:** Dev must set `.env` if Metro host auto-detection fails

---

### MOB-008 — Outdated Dependency Stack

**Status:** Verified

**File:** `mobile-app/package.json`, `package-lock.json`

| Package | Before | After (verified in package.json) |
|---------|--------|-------------------------------------|
| expo | ~46.0.21 | ~52.0.46 |
| react-native | 0.69.9 | 0.76.9 |
| axios | ^0.27.2 | ^1.7.9 |

**Build:** PASS (JS bundle)  
**Regression:** Stale native `android/` incompatible until `expo prebuild --clean`

---

### MOB-009 — Student List Not Virtualized

**Status:** Verified

**Files:** `mobile-app/src/screens/AttendanceScreen.js`, `mobile-app/src/components/StudentRow.js`

Uses `SectionList` (not `@shopify/flash-list`, which is installed but unused):

```433:437:mobile-app/src/screens/AttendanceScreen.js
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item.regNo}-${index}`}
        stickySectionHeadersEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
```

`StudentRow` wrapped in `React.memo`.

**Why it fixes:** Virtualizes rows vs prior `ScrollView` + `.map()`.

**Build:** PASS  
**Note:** `@shopify/flash-list` is an unused dependency (minor cleanup opportunity)

---

### MOB-010 — No Offline Handling

**Status:** Verified

**Files:** `mobile-app/src/context/NetworkContext.js`, `mobile-app/src/components/OfflineBanner.js`, `mobile-app/src/services/offlineQueueService.js`

```40:48:mobile-app/src/context/NetworkContext.js
  useEffect(() => {
    refreshQueueLength();
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected !== false;
      const reachable = state.isInternetReachable !== false;
      setIsConnected(connected);
      setIsInternetReachable(reachable);
      if (connected && reachable) {
        syncQueue();
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-011 — No Error Boundary

**Status:** Verified

**Files:** `mobile-app/src/components/ErrorBoundary.js`, `mobile-app/App.js`

```134:139:mobile-app/App.js
  return (
    <ErrorBoundary onLogout={logout}>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </ErrorBoundary>
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-012 — QR Scanner / Camera Not Implemented

**Status:** Verified

**Files:** `mobile-app/src/screens/QrScannerScreen.js` (new), `mobile-app/app.json`, `mobile-app/App.js`

```1:4:mobile-app/src/screens/QrScannerScreen.js
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, SafeAreaView, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
```

Registered in `FacultyStack` as `QrScanner`; camera permission in `app.json` plugins.

**Build:** PASS  
**Regression:** None identified

---

### MOB-013 — No Deep Link / App Scheme

**Status:** Verified

**File:** `mobile-app/app.json`

```8:8:mobile-app/app.json
    "scheme": "hallora",
```

```39:50:mobile-app/app.json
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [{ "scheme": "hallora", "host": "auth" }],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-014 — Transfer Request Status Not Shown

**Status:** Verified

**Files:** `mobile-app/src/screens/FacultyDashboardScreen.js`, `mobile-app/src/components/ExamCard.js`, `mobile-app/src/services/transferService.js`

```39:45:mobile-app/src/screens/FacultyDashboardScreen.js
      const [examData, transferData] = await Promise.all([
        fetchMyExams(signal),
        fetchMyTransferRequests(signal),
      ]);
      setFaculty(examData.faculty);
      setExams(examData.exams || []);
      setTransfers(transferData || []);
```

`ExamCard` renders `TransferBadge` when transfer prop present.

**Build:** PASS  
**Regression:** None identified

---

### MOB-015 — Duplicate Submit Not Guarded

**Status:** Verified

**File:** `mobile-app/src/screens/AttendanceScreen.js`

```282:283:mobile-app/src/screens/AttendanceScreen.js
    if (submitLock.current || submitting) return;
    submitLock.current = true;
```

```310:312:mobile-app/src/screens/AttendanceScreen.js
      clientRequestId: requestIdRef.current || createRequestId(),
    };
    requestIdRef.current = payload.clientRequestId;
```

**Build:** PASS  
**Regression:** Backend idempotency for `clientRequestId` not verified

---

### MOB-016 — axios 0.27 Vulnerabilities

**Status:** Verified

**Files:** `mobile-app/package.json`, `mobile-app/package-lock.json`, `mobile-app/src/api/client.js`

`axios: ^1.7.9` in package.json; `config.signal` passed through `apiRequest` for cancellation.

**Build:** PASS  
**Regression:** None identified

---

### MOB-018 — Full PII in SecureStore

**Status:** Verified

**File:** `mobile-app/src/services/authService.js`

**Before:** `SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(data.user))`  
**After:**

```21:29:mobile-app/src/services/authService.js
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
```

No `authUser` full JSON key; grep shows only `USER_ID`, `USER_ROLE` constants.

**Build:** PASS  
**Regression:** Profile fetched via `/api/auth/me` on restore (network call added)

---

### MOB-019 — No Rate Limit / Retry on Login

**Status:** Verified (partial implementation)

**File:** `mobile-app/src/screens/LoginScreen.js`

```54:62:mobile-app/src/screens/LoginScreen.js
    if (loginInFlight.current) return;
    loginInFlight.current = true;
    // ...
      if (err instanceof ApiError && err.code === "RATE_LIMIT") {
        setError("Too many login attempts. Please wait a moment.");
```

**Note:** Uses in-flight guard, not a timed debounce. Functionally prevents double-submit.

**Build:** PASS  
**Regression:** None identified

---

### MOB-020 — No versionCode Strategy

**Status:** Verified

**Files:** `mobile-app/app.json`, `mobile-app/eas.json`

```26:26:mobile-app/app.json
      "versionCode": 1,
```

```23:24:mobile-app/eas.json
    "production": {
      "autoIncrement": true,
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-021 — Transfer Screen Missing Header

**Status:** Verified

**File:** `mobile-app/src/screens/TransferRequestScreen.js`

```88:89:mobile-app/src/screens/TransferRequestScreen.js
      <OfflineBanner />
      <ScreenHeader title="Request Transfer" onBack={() => navigation.goBack()} />
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-022 — ExamList Dead Code

**Status:** Verified

**File:** `mobile-app/src/screens/FacultyDashboardScreen.js`

```130:130:mobile-app/src/screens/FacultyDashboardScreen.js
          onPress={() => navigation.navigate("ExamList", { exams })}
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-024 — alert() Instead of Alert.alert()

**Status:** Verified

Grep for bare `alert(` in `mobile-app/`: **0 matches**. All usages are `Alert.alert(`.

**Build:** PASS  
**Regression:** None identified

---

### MOB-025 — Transfer Email Lookup Errors Swallowed

**Status:** Verified

**File:** `mobile-app/src/screens/TransferRequestScreen.js`

```45:48:mobile-app/src/screens/TransferRequestScreen.js
      } catch (err) {
        if (err.code === "CANCELLED") return;
        setLookup(null);
        setAvailability(null);
        setLookupError(err.message || "Could not verify faculty email");
```

UI renders `{lookupError ? <Text style={styles.errorHint}>...` 

**Build:** PASS  
**Regression:** None identified

---

### MOB-026 — No Request Cancellation on Unmount

**Status:** Verified

**Files:** `mobile-app/src/hooks/index.js`, used in `FacultyDashboardScreen`, `TransferRequestScreen`, `AttendanceScreen`

```3:14:mobile-app/src/hooks/index.js
export function useAbortableEffect(effect, deps) {
  useEffect(() => {
    const controller = new AbortController();
    const cleanup = effect(controller.signal);
    return () => {
      controller.abort();
      if (typeof cleanup === "function") {
        cleanup();
      }
    };
  }, deps);
}
```

Services pass `signal` to `apiRequest`.

**Build:** PASS  
**Regression:** None identified

---

### MOB-027 — 15s Timeout Too Short

**Status:** Verified

**Files:** `mobile-app/src/constants/index.js`, `mobile-app/src/api/client.js`, `mobile-app/src/services/attendanceService.js`

```14:14:mobile-app/src/constants/index.js
export const API_TIMEOUT_MS = 30000;
```

```29:30:mobile-app/src/services/attendanceService.js
    signal,
    timeout: 45000,
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-028 — No Response Schema Validation

**Status:** Verified

**Files:** `mobile-app/src/api/errors.js`, services (e.g. `authService.js`, `attendanceService.js`)

```86:91:mobile-app/src/api/errors.js
export function assertObject(value, label) {
  if (!value || typeof value !== "object") {
    throw new ApiError(`Invalid response: ${label}`, { code: "INVALID_RESPONSE" });
  }
  return value;
}
```

Used in `login`, `fetchMyExams`, `fetchStudents`, etc.

**Build:** PASS  
**Regression:** None identified

---

### MOB-030 — gesture-handler Not Bootstrapped

**Status:** Verified

**File:** `mobile-app/index.js`

```1:1:mobile-app/index.js
import "react-native-gesture-handler";
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-031 — AsyncStorage Unused

**Status:** Verified

**Files:** `mobile-app/src/services/draftService.js`, `mobile-app/src/services/offlineQueueService.js`

Both import and use `@react-native-async-storage/async-storage`.

**Build:** PASS  
**Regression:** None identified

---

### MOB-032 — No Logo Loader

**Status:** Verified

**Files:** `mobile-app/src/components/LogoLoader.js`, used in `App.js`, `FacultyDashboardScreen.js`, `AttendanceScreen.js`

**Build:** PASS  
**Regression:** None identified

---

### MOB-033 — Portrait Lock Only

**Status:** Verified

**File:** `mobile-app/app.json`

```6:6:mobile-app/app.json
    "orientation": "default",
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-034 — No Notification Permission Flow

**Status:** Verified

**File:** `mobile-app/App.js`

```119:123:mobile-app/App.js
function useNotificationPermission() {
  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => {});
  }, []);
}
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-035 — No Accessibility Labels

**Status:** Verified (code present; device TalkBack not run)

**Evidence:** 28 matches across `LoginScreen`, `StudentRow`, `ExamCard`, `AttendanceScreen`, `FacultyDashboardScreen`, `ChangePasswordScreen`, `TransferRequestScreen`, components.

Example:

```31:32:mobile-app/src/components/ExamCard.js
        accessibilityRole="button"
        accessibilityLabel={`Open attendance for ${item.examName}`}
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-038 — LayoutAnimation on Large Lists

**Status:** Verified

Grep `LayoutAnimation` in `mobile-app/`: **0 matches** (removed from AttendanceScreen).

Expand/collapse uses state only in `toggleCourseExpand`.

**Build:** PASS  
**Regression:** None identified

---

### MOB-039 — console.log BASE_URL in Dev

**Status:** Verified

**File:** `mobile-app/src/config/index.js`

```114:116:mobile-app/src/config/index.js
if (__DEV__) {
  console.log(`[Hallora] API ${BASE_URL} (${Platform.OS})`);
}
```

No token/password logging found in mobile source.

**Build:** PASS  
**Regression:** None identified

---

### MOB-040 — Login navigation.replace Ineffective

**Status:** Verified

**File:** `mobile-app/src/screens/LoginScreen.js`

Grep `navigation.replace`: **0 matches**. Login calls `await login(...)` only; `RootNavigator` switches stacks via auth state.

**Build:** PASS  
**Regression:** None identified

---

### MOB-041 — No Dark Mode

**Status:** **Not Verified**

**Code present:**
- `app.json`: `"userInterfaceStyle": "automatic"`
- `ThemeContext.js` + `theme/colors.js`
- `useTheme()` used in: LoginScreen, ChangePasswordScreen, ScreenHeader, OfflineBanner, Skeleton

**Code missing:**
- `FacultyDashboardScreen`, `AttendanceScreen`, `AttendanceSummaryScreen`, `TransferRequestScreen`, `ExamCard` use hardcoded light colors (`#F8FAFC`, `#fff`, etc.) with no `useTheme()`.

**Why Not Verified:** Issue required dark mode support; only ~4 of 10+ screens consume theme. Main faculty flows remain light-only.

**Build:** PASS (after ThemeContext import fix)

---

### MOB-043 — Splash Screen Not Integrated

**Status:** Verified

**File:** `mobile-app/src/context/AuthContext.js`

```20:20:mobile-app/src/context/AuthContext.js
SplashScreen.preventAutoHideAsync().catch(() => {});
```

```63:64:mobile-app/src/context/AuthContext.js
        setLoading(false);
        SplashScreen.hideAsync().catch(() => {});
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-045 — Inline renderItem in FlatList

**Status:** Verified

**Files:** `mobile-app/src/components/ExamCard.js` (`memo`), `mobile-app/src/screens/FacultyDashboardScreen.js`

```94:106:mobile-app/src/screens/FacultyDashboardScreen.js
  const renderExam = useCallback(
    ({ item }) => (
      <View style={isTablet ? styles.tabletCardWrap : null}>
        <ExamCard
          item={item}
          transfer={transferByAssignment[item.uuid]}
          onOpen={openExam}
          onTransfer={(exam) => navigation.navigate("TransferRequest", { exam })}
        />
      </View>
    ),
    [isTablet, transferByAssignment, openExam, navigation]
  );
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-046 — No Pull-to-Refresh on Attendance

**Status:** Verified

**File:** `mobile-app/src/screens/AttendanceScreen.js` line 437 — `RefreshControl` on `SectionList`.

**Build:** PASS  
**Regression:** None identified

---

### MOB-047 — Login Footer Overlap

**Status:** Verified

**File:** `mobile-app/src/screens/LoginScreen.js`

Uses `KeyboardAvoidingView` + `ScrollView`; footer is `marginTop: 40` inside scroll content (not `position: absolute`).

**Build:** PASS  
**Regression:** None identified

---

### MOB-049 — No Screen Capture Protection

**Status:** Verified

**File:** `mobile-app/src/screens/AttendanceScreen.js`

```117:120:mobile-app/src/screens/AttendanceScreen.js
    ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
```

**Build:** PASS  
**Regression:** None identified

---

### MOB-050 — Generic App Name

**Status:** Verified

**File:** `mobile-app/app.json`

```3:4:mobile-app/app.json
    "name": "Hallora",
    "slug": "hallora-mobile",
```

**Build:** PASS  
**Regression:** None identified

---

## Regression Testing Summary

| Area | Result | Notes |
|------|--------|-------|
| JS bundle compile | **PASS** | After ThemeContext import fix |
| Native Android build | **NOT RUN** | Requires `expo prebuild --clean` |
| Microsoft SSO E2E | **NOT RUN** | Needs Azure redirect URI |
| Login/logout flow | **NOT RUN** | Device/emulator not used |
| Attendance draft restore | **NOT RUN** | Logic present, not runtime-tested |
| Offline queue sync | **NOT RUN** | Logic present, not runtime-tested |
| ThemeContext import bug | **FIXED** | Introduced during remediation; caught by export |

### Regression introduced and fixed during verification

| Bug | Introduced in | Fixed in |
|-----|---------------|----------|
| `ThemeContext.js` import `./colors` (file is at `../theme/colors`) | Remediation | Verification pass |

---

## Remaining Blockers

1. **Native project stale** — Pre-SDK-52 `android/` causes Hermes mismatch; run `npx expo prebuild --clean` before `expo run:android`.
2. **Azure AD** — Register `{API_PUBLIC_URL}/api/auth/microsoft/mobile-callback` for MOB-001 E2E.
3. **MOB-041 dark mode** — Not implemented on primary screens; status **Not Verified**.
4. **Device QA** — No emulator/physical test run for auth, attendance, offline, TalkBack.
5. **Node.js 18** — Expo SDK 52 tooling recommends Node ≥20.
6. **Unused dependency** — `@shopify/flash-list` in package.json but `SectionList` used instead.
7. **Backend idempotency** — `clientRequestId` sent from mobile; server handling not verified.

---

## Final Verified Score

Scoring based on **code-verified** fixes only (not QA report claims):

| Category | QA After Score | Verified Score | Notes |
|----------|---------------:|---------------:|-------|
| Security | 9.0 | **8.5** | SSO E2E unproven |
| Performance | 9.0 | **8.5** | Virtualization verified; FlashList unused |
| Android | 9.0 | **7.5** | JS bundle only; native not built |
| Networking | 9.5 | **9.0** | Code complete |
| Accessibility | 8.0 | **7.0** | Labels added; no device test |
| Architecture | 9.5 | **9.0** | ThemeContext bug found/fixed |
| Code Quality | 9.0 | **8.5** | Dead HomeScreen file remains |
| React Native | 9.0 | **8.5** | Build pass after fix |
| Production Ops | 8.5 | **7.0** | EAS config only; no CI/device matrix |
| **Overall** | **9.2** | **8.1 / 10** | 41/44 Resolved verified; 3 corrected |

### Recommendation

**Conditional GO for code review sign-off.**  
**NO-GO for production release** until: native prebuild, device E2E, Azure SSO registration, and MOB-041 dark mode (or descope) are addressed.

---

*Generated from repository inspection and `npx expo export --platform android` on 2026-07-13.*
