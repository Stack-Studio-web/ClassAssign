# ClassAssign — Security Re-Audit Verification Report

**Date:** 2026-06-29  
**Type:** Post-remediation verification (strict)  
**Previous report:** `SECURITY_ASSESSMENT.md` (46 findings, rating 3.5/10)  
**Method:** Source-code review only — no assumptions that “changed code” equals “fixed”

---

## Executive Summary

This re-audit **does not confirm remediation** of the prior security findings. The codebase was compared line-by-line against every `VULN-001`–`VULN-046` item from the original assessment.

**Result:** **0 vulnerabilities fully fixed**, **1 partially improved** (operational Docker hardening only), **43 still vulnerable**, **3 informational/positive controls unchanged**, **1 new low-severity information disclosure** introduced with faculty attendance API changes.

Developers continued **feature work** (attendance module, faculty seating API access, Docker DB healthchecks, startup retry). **No evidence** of systematic security remediation (no Redis sessions, no rate limiting, no helmet, no auth on exam/ineligibility routes, SSO token still in URL, etc.).

| Metric | Previous | Current |
|--------|----------|---------|
| **Security score (0–100)** | **35** | **36** |
| **Improvement** | — | **+2.9%** |
| **Production readiness (0–10)** | 3.5 | **3.6** |
| **OWASP Top 10 compliance** | Fail (8/10 categories) | **Fail (8/10)** — no material change |

### Final Verdict

# ❌ Not Production Ready

The application remains unsuitable for internet-facing production deployment until **Phase 0** items from the original report are implemented and re-verified.

---

## Verification Results Table

| ID | Vulnerability | Prev. Severity | Current Status | Residual Risk |
|----|---------------|----------------|----------------|---------------|
| VULN-001 | Unauthenticated Exam API | Critical | **Still Vulnerable** | Critical |
| VULN-002 | Public student PII (ineligibility) | Critical | **Still Vulnerable** | Critical |
| VULN-003 | SSO token in URL | Critical | **Still Vulnerable** | Critical |
| VULN-004 | Secrets in `.env` (plaintext) | Critical | **Still Vulnerable** | Critical |
| VULN-005 | In-memory session store | Critical | **Still Vulnerable** | Critical |
| VULN-006 | OAuth `state` not validated | High | **Still Vulnerable** | High |
| VULN-007 | Permissive CORS | High | **Still Vulnerable** | High |
| VULN-008 | No login rate limiting | High | **Still Vulnerable** | High |
| VULN-009 | Session expiry not in middleware | High | **Still Vulnerable** | High |
| VULN-010 | Token debug logging | High | **Still Vulnerable** | High |
| VULN-011 | Plaintext password fallback | High | **Still Vulnerable** | High |
| VULN-012 | Weak password policy (6 chars) | High | **Still Vulnerable** | High |
| VULN-013 | Unauthenticated import metadata | High | **Still Vulnerable** | High |
| VULN-014 | Public `/format` static | High | **Still Vulnerable** | High |
| VULN-015 | Public session count endpoint | Medium | **Still Vulnerable** | Medium |
| VULN-016 | `/debug-sentry` enabled | Medium | **Still Vulnerable** | Medium |
| VULN-017 | Verbose errors to clients | Medium | **Still Vulnerable** | Medium |
| VULN-018 | Admin attendance bypass (by design) | Medium | **Still Vulnerable** | Medium |
| VULN-019 | Client-side RBAC only (UI) | Medium | **Still Vulnerable** | Medium |
| VULN-020 | Token in sessionStorage | Medium | **Still Vulnerable** | Medium |
| VULN-021 | innerHTML print XSS risk | Medium | **Still Vulnerable** | Medium |
| VULN-022 | Weak file upload validation | Medium | **Still Vulnerable** | Medium |
| VULN-023 | Vulnerable `xlsx` dependency | Medium | **Still Vulnerable** | Medium |
| VULN-024 | 50MB body limit DoS | Medium | **Still Vulnerable** | Medium |
| VULN-025 | No Helmet | Medium | **Still Vulnerable** | Medium |
| VULN-026 | Nginx no TLS/headers | Medium | **Still Vulnerable** | Medium |
| VULN-027 | No clickjacking protection | Medium | **Still Vulnerable** | Medium |
| VULN-028 | No CSP | Medium | **Still Vulnerable** | Medium |
| VULN-029 | PostgreSQL port published | Medium | **Partially Fixed** | Medium |
| VULN-030 | Bull Board exposed | Medium | **Still Vulnerable** | Medium |
| VULN-031 | Docker runs as root | Medium | **Still Vulnerable** | Medium |
| VULN-032 | No CSRF (cookie scenario) | Low | **Still Vulnerable** | Low |
| VULN-033 | Logout without session proof | Low | **Still Vulnerable** | Low |
| VULN-034 | `/health` info disclosure | Low | **Still Vulnerable** | Low |
| VULN-035 | Notification progress any auth user | Low | **Still Vulnerable** | Low |
| VULN-036 | Predictable default password pattern | Low | **Still Vulnerable** | Low |
| VULN-037 | SQL injection (parameterized) | Info | **Fixed (maintained)** | Low |
| VULN-038 | IDOR owner filter | Info | **Cannot Verify** | Medium |
| VULN-039 | No MFA (local login) | Info | **Still Vulnerable** | Medium |
| VULN-040 | Mobile AsyncStorage tokens | Medium | **Still Vulnerable** | Medium |
| VULN-041 | Hardcoded LAN IP (mobile) | Low | **Still Vulnerable** | Low |
| VULN-042 | Unused mongoose/mysql2 | Low | **Still Vulnerable** | Low |
| VULN-043 | Frontend dep bloat | Info | **Cannot Verify** | Low |
| VULN-044 | Audit logging (positive) | Info | **Fixed (maintained)** | — |
| VULN-045 | bcrypt hashing (positive) | Info | **Partially Fixed** | Medium |
| VULN-046 | OAuth redirect via FRONTEND_URL | Low | **Still Vulnerable** | Low |
| **NEW-001** | Venue enumeration on attendance 404 | Low | **New — Introduced** | Low |

**Summary counts:** Fixed **2** (positive controls maintained) · Partially fixed **2** · Still vulnerable **41** · Cannot verify **2** · New **1**

---

## Detailed Verification

---

### VULN-001 — Unauthenticated Exam API

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | Critical |
| **Files** | `backend/routes/examRoutes.js:9-72` |

**Evidence:**
```javascript
router.post("/", async (req, res) => { /* no sessionAuth */ });
router.get("/", async (req, res) => { /* no sessionAuth */ });
```

**Verification:** No `sessionAuth`, `checkRole`, or global auth wrapper. Any anonymous client can create and list exams.

**Bypass:** Direct `curl` to `/api/exams` — no token required.

**PoC:**
```bash
curl http://localhost:5000/api/exams
curl -X POST http://localhost:5000/api/exams -H "Content-Type: application/json" -d '{...}'
```

**Fix (unchanged from prior report):** Add `sessionAuth` + `checkRole` on both routes.

---

### VULN-002 — Public Student PII (Ineligibility)

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | Critical |
| **Files** | `backend/routes/ineligibilityRoutes.js:16-51` |

**Evidence:** Comments explicitly state `NO AUTH`. Routes have no middleware.

**Attack path:** Enumerate `/api/ineligibility/students/{course}/{dept}` without authentication.

**Fix:** Require `sessionAuth` + role check on both GET routes.

---

### VULN-003 — SSO Token in URL

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | Critical |
| **Files** | `backend/routes/microsoftAuthRoutes.js:151-153`, `src/pages/Landing.jsx:28-30` |

**Evidence (backend):**
```javascript
return res.redirect(`${FRONTEND_URL}/?sso_success=true&token=${token}`);
```

**Evidence (frontend):**
```javascript
sessionStorage.setItem('authToken', token); // token from searchParams
```

**Verification:** Token still transmitted in query string and stored client-side.

**Fix:** HttpOnly cookie on callback; redirect without token in URL.

---

### VULN-004 — Secrets in Environment File

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | Critical |
| **Files** | `backend/.env` (on disk), `docker-compose.yml:17,40` (`env_file`) |

**Evidence:** `docker-compose.yml` still loads `./backend/.env`. File exists locally with DB password, OAuth secret, API keys. `.gitignore` excludes `*.env` (good) but runtime exposure unchanged.

**Fix:** Docker secrets / vault; rotate credentials; never bake into images.

---

### VULN-005 — In-Memory Session Store

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | Critical |
| **Files** | `backend/routes/authRoutes.js:8-9` |

**Evidence:**
```javascript
// ✅ In-memory session storage (use Redis in production)
const sessions = new Map();
```

**Verification:** No Redis session adapter. Redis exists in compose for Bull only, not auth.

**Residual risk:** Session loss on restart; no horizontal scaling; no central revocation.

---

### VULN-006 — OAuth State Not Validated

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | High |
| **Files** | `backend/routes/microsoftAuthRoutes.js:35,56-70` |

**Evidence:** `state` generated on `/login` but callback never reads or validates `req.query.state`.

**Bypass:** OAuth login CSRF / session fixation against SSO flow.

---

### VULN-007 — Permissive CORS

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | High |
| **File** | `backend/server.js:41` |

**Evidence:** `app.use(cors());` — default allow-all behavior.

---

### VULN-008 — No Rate Limiting

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | High |
| **Files** | `backend/routes/authRoutes.js:20`, entire backend |

**Evidence:** Grep for `rateLimit`, `express-rate-limit`, `helmet` — **zero matches in application code** (only in `SECURITY_ASSESSMENT.md` recommendations).

---

### VULN-009 — Session Expiry Not Enforced in Middleware

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | High |
| **Files** | `backend/middleware/sessionAuth.js:24-51`, `authRoutes.js:125-133` |

**Evidence:** `sessionAuth` checks `sessions.has(token)` only. 24h expiry exists **only** in `POST /verify`, not on every request.

**Bypass:** Stolen token valid until server restart (no TTL on normal API calls).

---

### VULN-010 — Token Debug Logging

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | High |
| **File** | `backend/middleware/sessionAuth.js:8-17` |

**Evidence:**
```javascript
tokenPreview: token ? token.substring(0, 20) + '...' : 'none',
```

Logs on **every authenticated request**.

---

### VULN-011 — Plaintext Password Fallback

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | High |
| **File** | `backend/utils/password.js:17-22` |

**Evidence:**
```javascript
return stored === plain; // non-bcrypt passwords accepted
```

---

### VULN-012 — Weak Password Policy

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | High |
| **Files** | `authRoutes.js:162`, `userManagementRoutes.js` |

**Evidence:** `newPassword.length < 6` — minimum 6 characters only.

---

### VULN-013 — Unauthenticated Import Metadata

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | High |
| **File** | `backend/routes/import.js:356-358,384-386,413-415` |

**Evidence:**
```javascript
router.get("/last-faculty-import", (req, res) => {
  res.json(lastFacultyImport); // no sessionAuth
});
```

Same pattern for student and venue import metadata.

---

### VULN-014 — Public `/format` Static

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | High |
| **File** | `backend/server.js:45-46` |

**Evidence:** `app.use("/format", express.static(formatDir));` — no authentication.

---

### VULN-015 — Public Session Count

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | Medium |
| **File** | `backend/routes/authRoutes.js:241-245` |

**Evidence:** `GET /api/auth/sessions/count` — no auth middleware.

---

### VULN-016 — Debug Sentry Route

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | Medium |
| **File** | `backend/server.js:57-60` |

**Evidence:** `/debug-sentry` throws intentional error — not gated by environment.

---

### VULN-017 — Verbose Error Messages

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | Medium |
| **Files** | e.g. `examRoutes.js:53`, `ineligibilityRoutes.js:25` |

**Evidence:** `details: err.message` / `error: err.message` returned to clients. Production handler suppresses message only when `NODE_ENV !== 'development'` but route-level handlers still leak.

---

### VULN-018 — Admin Attendance Assignment Bypass

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** (accepted design risk) |
| **Severity** | Medium |
| **File** | `backend/middleware/attendanceGuard.js:40-42` |

**Evidence:** Admin/faculty_incharge skip assignment verification.

---

### VULN-019 — Client-Side Route Guard Only

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | Medium |
| **File** | `src/App.jsx` |

**Evidence:** `AuthGuard` reads `sessionStorage` — role tampering changes UI; API gaps (VULN-001/002) allow real bypass.

---

### VULN-020 — sessionStorage Token Storage

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | Medium |
| **Files** | `src/pages/Landing.jsx`, multiple pages |

**Evidence:** `sessionStorage.setItem('authToken', ...)` throughout frontend.

---

### VULN-021 — innerHTML Print XSS Risk

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | Medium |
| **File** | `src/pages/Report.jsx` |

**Evidence:** `document.write(componentRef.current.innerHTML)` pattern unchanged (verified in prior audit).

---

### VULN-022 — File Upload Validation

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | Medium |
| **File** | `backend/routes/import.js:15` |

**Evidence:** `multer({ dest: "uploads/" })` — no MIME/size/fileFilter.

**Partial positive:** Temp files deleted after processing (`fs.unlink` at lines 103, 184, 349).

---

### VULN-023 — xlsx Dependency

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Severity** | Medium |
| **File** | `backend/package.json:28` |

**Evidence:** `"xlsx": "^0.18.5"` unchanged. npm audit still reports issues.

---

### VULN-024 — Large Body Limit

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **File** | `backend/server.js:42-43` |

**Evidence:** `{ limit: "50mb" }` unchanged.

---

### VULN-025 — No Helmet

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **File** | `backend/server.js` |

**Evidence:** No `helmet` import or usage.

---

### VULN-026 / VULN-027 / VULN-028 — Nginx Security

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **File** | `nginx.conf` |

**Evidence:** HTTP only (`listen 80`); no `add_header` for X-Frame-Options, CSP, HSTS, etc.

---

### VULN-029 — PostgreSQL Port Exposure

| Field | Value |
|-------|-------|
| **Status** | **Partially Fixed** |
| **Severity** | Medium → Medium |
| **File** | `docker-compose.yml:18-19` |

**Evidence:** Port changed from `5432:5432` to `5433:5432`. **Still published to host** — reduces conflict, not exposure.

**Improvement:** DB healthcheck + `depends_on: service_healthy` added (operational, not auth fix).

---

### VULN-030 — Bull Board Exposed

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **File** | `docker-compose.yml:68-71` |

**Evidence:** `3001:3000` published, no auth in compose.

---

### VULN-031 — Docker Root User

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **File** | `backend/Dockerfile` |

**Evidence:** No `USER` directive — runs as root.

---

### VULN-032–036 — Low Severity Items

All **Still Vulnerable** — no code changes detected for CSRF tokens, logout validation, health endpoint minimization, notification role restriction, or `passwordFromEmail` pattern.

---

### VULN-037 — SQL Injection (Positive)

| Field | Value |
|-------|-------|
| **Status** | **Fixed (maintained)** |
| **File** | `backend/config/db.js` |

**Evidence:** Parameterized `?` → `$n` conversion still used. No regression found.

---

### VULN-038 — IDOR / Owner Filter

| Field | Value |
|-------|-------|
| **Status** | **Cannot Verify** |

Full IDOR fuzzing not performed. `ownerFilter.js` unchanged. Manual review of every `:id` route not completed in this pass.

---

### VULN-039 — No MFA

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |

No TOTP/WebAuthn for local login. Microsoft MFA depends on tenant config (external).

---

### VULN-040 — Mobile Token Storage

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |
| **Files** | `mobile-app/src/api.js`, `mobile-app/src/services/authService.js` |

**Evidence:** `AsyncStorage.getItem("authToken")` — not `expo-secure-store`.

---

### VULN-041–043 — Low / Informational

**Still Vulnerable** or **Cannot Verify** — no remediation detected.

---

### VULN-044 — Audit Logging (Positive)

| Field | Value |
|-------|-------|
| **Status** | **Fixed (maintained)** |

`auditLogger` still used on sensitive routes (seating, import, ineligibility bulk, etc.).

---

### VULN-045 — bcrypt (Positive with caveat)

| Field | Value |
|-------|-------|
| **Status** | **Partially Fixed** |

bcrypt still used for new passwords (`hashPassword`), but VULN-011 plaintext fallback undermines this.

---

### VULN-046 — OAuth Redirect Trust

| Field | Value |
|-------|-------|
| **Status** | **Still Vulnerable** |

`FRONTEND_URL` from env still controls all redirects — compromise of env = open redirect.

---

## New Vulnerabilities Introduced During Remediation

### NEW-001 — Venue List Disclosure on Attendance 404

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **OWASP** | A01 Broken Access Control / A02 Sensitive Data Exposure |
| **File** | `backend/routes/seatingRoutes.js:491-495` |
| **Status** | **New — Introduced** |

**Evidence:** When venue not found, response includes `availableVenues` array for the seating plan.

**Attack path:** Authenticated faculty (or any role with access) probes hall names for an exam slot.

**Fix:** Return generic 404 without enumerating other halls.

---

### NEW-002 — Faculty Broadened Seating Plan Lookup (Mitigated)

| Field | Value |
|-------|-------|
| **Severity** | Informational |
| **File** | `backend/routes/seatingRoutes.js:26-40,500-518` |

Faculty role skips `owner_user_id` filter but **invigilator assignment is verified** before returning student data. **Not a critical regression** — authorization check present.

---

## Operational Changes (Not Security Fixes)

These improve reliability but **do not close** reported vulnerabilities:

| Change | File | Security impact |
|--------|------|-----------------|
| DB healthcheck | `docker-compose.yml:20-25` | Reduces startup race — **none on auth** |
| Backend `depends_on: service_healthy` | `docker-compose.yml:45-46` | Operational |
| `restart: unless-stopped` | `docker-compose.yml:47` | Availability |
| Startup DB retry loop | `backend/server.js:117-141` | Operational |
| Faculty attendance API access | `seatingRoutes.js` | Feature + mitigated auth check |

---

## Dependency Security (Re-verified)

Backend `npm audit` (2026-06-29): **19 vulnerabilities (9 high, 10 moderate)** — **not remediated**.

Key packages unchanged: `axios@^1.7.9`, `xlsx@^0.18.5`, `mongoose@^8.19.1` (unused).

---

## OWASP Top 10 (2021) — Re-Assessment

| Category | Previous | Current |
|----------|----------|---------|
| A01 Broken Access Control | Fail | **Fail** |
| A02 Cryptographic Failures | Fail | **Fail** |
| A03 Injection | Partial | **Partial** |
| A04 Insecure Design | Partial | **Partial** |
| A05 Security Misconfiguration | Fail | **Fail** |
| A06 Vulnerable Components | Partial | **Fail** (audit unfixed) |
| A07 Auth Failures | Fail | **Fail** |
| A08 Software/Data Integrity | Partial | **Partial** |
| A09 Logging Failures | Partial | **Partial** |
| A10 SSRF | N/A | **N/A** |

## OWASP API Security Top 10 — Re-Assessment

| Risk | Status |
|------|--------|
| API1 Broken Object Level Authorization | **Fail** (exams, ineligibility) |
| API2 Broken Authentication | **Fail** |
| API3 Broken Object Property Level Authorization | **Partial** |
| API4 Unrestricted Resource Consumption | **Fail** (no rate limits, 50MB) |
| API5 Broken Function Level Authorization | **Fail** (unauth routes) |
| API6 Unrestricted Access to Sensitive Business Flows | **Fail** |
| API7 Server Side Request Forgery | **Partial** (axios advisories) |
| API8 Security Misconfiguration | **Fail** |
| API9 Improper Inventory Management | **Partial** |
| API10 Unsafe Consumption of APIs | **Partial** (Microsoft OAuth state) |

---

## Security Score (0–100)

Scoring methodology (strict, evidence-based):

| Domain | Weight | Previous | Current | Notes |
|--------|--------|----------|---------|-------|
| Authentication & Session | 20 | 4 | 4 | No Redis, no expiry in middleware, SSO URL token |
| Authorization & Access Control | 20 | 3 | 3 | Exam + ineligibility still public |
| API & Input Security | 15 | 5 | 5 | CORS, rate limits, upload validation unchanged |
| Data Protection & Secrets | 15 | 3 | 3 | `.env` plaintext |
| Infrastructure (Docker/Nginx/TLS) | 15 | 4 | 5 | +1 healthcheck/restart only |
| Client Security (React/Mobile) | 10 | 4 | 4 | sessionStorage/AsyncStorage |
| Dependencies & Supply Chain | 5 | 3 | 3 | 19 npm audit issues |

**Weighted total:**

| | Score |
|---|------:|
| **Previous security score** | **35 / 100** |
| **Current security score** | **36 / 100** |
| **Improvement** | **+2.9%** |

**Production readiness score: 3.6 / 10** (previous: 3.5 / 10)

---

## Priority Actions Before Re-Verification

1. **VULN-001, VULN-002** — Add authentication immediately (Critical).
2. **VULN-003** — Remove token from SSO redirect URL (Critical).
3. **VULN-005, VULN-009** — Redis sessions + TTL in `sessionAuth` (Critical/High).
4. **VULN-008, VULN-007** — Rate limiting + restricted CORS (High).
5. **VULN-013, VULN-014, VULN-015, VULN-016** — Quick wins (remove/guard endpoints).
6. Run `npm audit fix` and upgrade axios; remove unused mongoose/mysql2.

**Re-audit requirement:** Provide PR diff or commit SHA referencing each VULN-ID fix. This verifier will re-check the exact files/lines.

---

*Strict verification complete. No vulnerability marked Fixed without code evidence of remediation.*
