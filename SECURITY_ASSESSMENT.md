# ClassAssign — Security Vulnerability Assessment

**Project:** ClassAssign Exam Seating System  
**Assessment Date:** 2026-06-29  
**Assessor Role:** Senior Application Security Engineer / Penetration Tester  
**Scope:** React frontend, Node.js/Express backend, PostgreSQL, Docker, Nginx, mobile app (Expo), REST API  

---

## Important Scope Notes

| Item | Finding |
|------|---------|
| **Authentication mechanism** | The stack description mentions **JWT**, but the codebase implements **opaque server-side session tokens** stored in an **in-memory `Map`** (`backend/routes/authRoutes.js`). This is **not JWT**. JWT-specific risks (alg:none, weak signing) do not apply; session-store risks do. |
| **Files reviewed** | Backend routes/middleware/models, `server.js`, `docker-compose.yml`, `nginx.conf`, Dockerfiles, frontend auth (`App.jsx`, `Landing.jsx`), import/upload flows, attendance/seating/ineligibility APIs, `.gitignore`, dependency manifests. |
| **Not available for review** | Production TLS certificates, WAF rules, host firewall, Azure AD app registration settings, runtime `.env` deployment process, full penetration test traffic captures, mobile production build signing, PostgreSQL host hardening outside Docker. |

---

## Executive Summary

ClassAssign is a functional university exam-management application with **role-based access control on most admin routes**, **bcrypt password hashing for new passwords**, and **parameterized SQL** via a Sequelize wrapper. However, several **Critical** and **High** issues would allow **unauthenticated data access and modification**, **credential/session compromise**, and **information disclosure** in a production deployment.

The most urgent problems are:

1. **Completely unauthenticated exam creation/listing** (`/api/exams`).
2. **Public student PII endpoints** under `/api/ineligibility/students/*` (registration numbers, names, emails, departments).
3. **Unauthenticated import metadata endpoints** exposing internal batch IDs.
4. **Public static template downloads** at `/format` without authentication.
5. **Session token passed in URL** after Microsoft SSO (browser history, logs, referrer leakage).
6. **Secrets and credentials present in local `backend/.env`** (gitignored but high risk if copied, shared, or mis-committed).
7. **No rate limiting**, **permissive CORS**, **missing security headers**, **HTTP-only Nginx**, and **debug endpoints** left enabled.

**Overall security rating: 3.5 / 10** (development/internal LAN acceptable with network isolation; **not production-ready** without remediation).

---

## Vulnerability Summary by Severity

| Severity | Count |
|----------|------:|
| Critical | 5 |
| High | 12 |
| Medium | 14 |
| Low | 9 |
| Informational | 6 |
| **Total** | **46** |

**Risk score (weighted):** **82 / 100** (High organizational risk if internet-exposed)

---

## Detailed Findings

---

### VULN-001: Unauthenticated Exam API (Create & List)

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **OWASP** | A01:2021 Broken Access Control |
| **CWE** | CWE-306 (Missing Authentication for Critical Function) |
| **File** | `backend/routes/examRoutes.js` |
| **Lines** | 9–72 |

**Why vulnerable:** `POST /api/exams` and `GET /api/exams` have **no** `sessionAuth` or `checkRole` middleware.

**Attack scenario:** Any anonymous client creates arbitrary exams or enumerates all exam records, polluting attendance/seating linkage and exam schedules.

**PoC:**
```bash
curl -X POST http://localhost:5000/api/exams \
  -H "Content-Type: application/json" \
  -d '{"examName":"Fake","examCode":"FAKE001","examTime":"09:00 - 11:00","examSession":"FN","examDate":"2026-06-30"}'
```

**Fix:**
```javascript
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");

router.post("/", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => { /* ... */ });
router.get("/", sessionAuth, checkRole(["admin", "faculty_incharge", "hod", "faculty"]), async (req, res) => { /* ... */ });
```

**Best practice:** Default-deny: all `/api/*` routes require authentication unless explicitly public.

---

### VULN-002: Public Student Data Exposure (Ineligibility Routes)

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **OWASP** | A01 Broken Access Control / A02 Cryptographic Failures (sensitive data) |
| **CWE** | CWE-200 (Exposure of Sensitive Information) |
| **File** | `backend/routes/ineligibilityRoutes.js` |
| **Lines** | 16–51 |

**Why vulnerable:** Endpoints explicitly marked `NO AUTH` return student lists by course/department including PII from the students table.

**Attack scenario:** Attacker iterates course codes and harvests student registration numbers, names, emails, and departments without logging in.

**PoC:**
```bash
curl http://localhost:5000/api/ineligibility/students/CAT1/CSE
```

**Fix:** Require `sessionAuth` + appropriate role on both routes. If allotment UI needs data, use authenticated API calls only.

---

### VULN-003: Session Token in URL (Microsoft SSO Callback)

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **OWASP** | A07:2021 Identification and Authentication Failures |
| **CWE** | CWE-598 (Use of GET Request Method With Sensitive Query Strings) |
| **Files** | `backend/routes/microsoftAuthRoutes.js` (151–153), `src/pages/Landing.jsx` (20–30) |
| **Lines** | 151–153, 20–30 |

**Why vulnerable:** After OAuth, server redirects to `/?sso_success=true&token=<session_token>`. Tokens appear in browser history, server/proxy logs, Referer headers, and analytics.

**Attack scenario:** Shared computer, compromised logging pipeline, or malicious browser extension steals session token from URL.

**Fix:** Use short-lived authorization code + POST exchange, or set `HttpOnly`/`Secure` cookie on callback instead of query param:
```javascript
// Callback: set cookie, redirect without token
res.cookie('session', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 86400000 });
return res.redirect(`${FRONTEND_URL}/?sso_success=true`);
```

**Best practice:** Never place bearer/session tokens in URLs.

---

### VULN-004: Secrets in Environment File (Local)

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **OWASP** | A02:2021 Cryptographic Failures / A05 Security Misconfiguration |
| **CWE** | CWE-798 (Use of Hard-coded Credentials) |
| **File** | `backend/.env` (present on disk; gitignored via `.gitignore:25`) |

**Why vulnerable:** File contains database password, `SECRET_KEY`, Microsoft OAuth client secret, Teams API credentials, and Sentry DSN in plaintext. Any container image layer, backup, or developer laptop compromise exposes full stack.

**Attack scenario:** Attacker with read access to repo workspace or Docker volume exfiltrates DB and OAuth secrets.

**Fix:**
- Use Docker secrets / Azure Key Vault / HashiCorp Vault.
- Rotate all exposed credentials immediately if this file was ever committed or shared.
- Never mount `.env` into images; inject at runtime.

**Note:** Actual secret values are **not reproduced** in this report.

---

### VULN-005: In-Memory Session Store (No Persistence / No Cluster Safety)

| Field | Value |
|-------|-------|
| **Severity** | Critical (availability + session hijack window in multi-instance) |
| **OWASP** | A07 Identification and Authentication Failures |
| **CWE** | CWE-613 (Insufficient Session Expiration) |
| **File** | `backend/routes/authRoutes.js` |
| **Lines** | 8–9, 65–73 |

**Why vulnerable:** Sessions live in process memory. Backend restart invalidates all sessions; horizontal scaling breaks auth; no centralized revocation.

**Attack scenario:** Rolling deploy logs out all users; attacker exploits race during restart; multiple backend replicas accept different session sets.

**Fix:** Store sessions in **Redis** with TTL (comment in code acknowledges this). Example:
```javascript
await redis.setex(`session:${token}`, 86400, JSON.stringify(session));
```

---

### VULN-006: Missing OAuth `state` Validation (CSRF on SSO)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **OWASP** | A01 Broken Access Control |
| **CWE** | CWE-352 (CSRF) |
| **File** | `backend/routes/microsoftAuthRoutes.js` |
| **Lines** | 35 (generated), 56–70 (callback — no validation) |

**Why vulnerable:** `state` is generated on `/login` but **never stored or verified** on `/callback`.

**Attack scenario:** OAuth CSRF/login confusion — victim completes Microsoft login and attacker's session gets linked (classic OAuth CSRF).

**Fix:** Store `state` in Redis/cookie on login; reject callback if `req.query.state` mismatch.

---

### VULN-007: Permissive CORS (`cors()` Default)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **OWASP** | A05 Security Misconfiguration / API4 Unrestricted Resource Consumption |
| **CWE** | CWE-942 (Permissive Cross-domain Policy) |
| **File** | `backend/server.js` |
| **Line** | 41 |

**Why vulnerable:** `app.use(cors())` reflects/allows cross-origin requests by default configuration.

**Attack scenario:** Malicious site in user's browser calls API with stolen `sessionStorage` token (if XSS exists) or probes endpoints from arbitrary origins.

**Fix:**
```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ['GET','POST','PUT','DELETE'],
}));
```

---

### VULN-008: No Rate Limiting on Authentication

| Field | Value |
|-------|-------|
| **Severity** | High |
| **OWASP** | A07 Identification and Authentication Failures / API4 Unrestricted Resource Consumption |
| **CWE** | CWE-307 (Improper Restriction of Excessive Authentication Attempts) |
| **File** | `backend/routes/authRoutes.js` |
| **Lines** | 20–107 |

**Why vulnerable:** Unlimited login attempts enable credential stuffing and password spraying.

**Fix:**
```javascript
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Too many attempts' } });
router.post('/login', loginLimiter, async (req, res) => { /* ... */ });
```

---

### VULN-009: Session Never Expires in `sessionAuth` Middleware

| Field | Value |
|-------|-------|
| **Severity** | High |
| **OWASP** | A07 Identification and Authentication Failures |
| **CWE** | CWE-613 |
| **Files** | `backend/middleware/sessionAuth.js`, `backend/routes/authRoutes.js` |
| **Lines** | sessionAuth: 4–51; verify expiry only at authRoutes: 125–133 |

**Why vulnerable:** 24-hour expiry is enforced only on `POST /api/auth/verify`, not on every authenticated request. Stolen tokens remain valid until server restart.

**Fix:** In `sessionAuth`, check `Date.now() - session.createdAt` and delete expired sessions.

---

### VULN-010: Authentication Debug Logging (Token Leakage)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **OWASP** | A09:2021 Security Logging and Monitoring Failures |
| **CWE** | CWE-532 (Insertion of Sensitive Information into Log File) |
| **File** | `backend/middleware/sessionAuth.js` |
| **Lines** | 8–17 |

**Why vulnerable:** Logs token preview, path, session count on **every request** in production.

**Attack scenario:** Log aggregation system compromise reveals valid session prefixes and user roles.

**Fix:** Remove debug logging or gate with `NODE_ENV === 'development'`.

---

### VULN-011: Plaintext Password Fallback

| Field | Value |
|-------|-------|
| **Severity** | High |
| **OWASP** | A02 Cryptographic Failures |
| **CWE** | CWE-256 (Unprotected Storage of Credentials) |
| **File** | `backend/utils/password.js` |
| **Lines** | 17–22 |

**Why vulnerable:** `verifyPassword` accepts **plain-text match** if hash does not start with `$2`.

**Attack scenario:** Legacy/plaintext passwords in DB remain exploitable; DB dump exposes passwords directly.

**Fix:** Remove plaintext branch; force password reset migration for non-bcrypt hashes.

---

### VULN-012: Weak Password Policy

| Field | Value |
|-------|-------|
| **Severity** | High |
| **OWASP** | A07 Identification and Authentication Failures |
| **CWE** | CWE-521 |
| **Files** | `backend/routes/authRoutes.js` (162), `backend/routes/userManagementRoutes.js` (232) |

**Why vulnerable:** Minimum length **6 characters** only; no complexity, breach check, or MFA.

**Fix:** Enforce NIST-aligned policy (≥12 chars or passphrase), zxcvbn scoring, optional TOTP/WebAuthn for admin roles.

---

### VULN-013: Unauthenticated Import Metadata Endpoints

| Field | Value |
|-------|-------|
| **Severity** | High |
| **OWASP** | A01 Broken Access Control |
| **CWE** | CWE-306 |
| **File** | `backend/routes/import.js` |
| **Lines** | 356–358, 384–386, 413–415 |

**Why vulnerable:** `GET /api/import/last-*-import` returns inserted record IDs without authentication.

**Attack scenario:** Attacker learns internal DB IDs for faculty/students/venues to target IDOR or undo operations.

**Fix:** Add `sessionAuth` + `checkRole` to all three GET routes.

---

### VULN-014: Unauthenticated Static Template Directory

| Field | Value |
|-------|-------|
| **Severity** | High |
| **OWASP** | A01 Broken Access Control |
| **CWE** | CWE-552 |
| **File** | `backend/server.js` |
| **Lines** | 45–46 |

**Why vulnerable:** `/format` served via `express.static` with no auth (comment says intentional).

**Attack scenario:** Information disclosure of import templates; if misconfigured, directory listing or extra files could leak.

**Fix:** Serve templates through authenticated `templateRoutes` only; remove public static mount or restrict to nginx internal path.

---

### VULN-015: Unauthenticated Session Count Endpoint

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A01 Broken Access Control |
| **CWE** | CWE-200 |
| **File** | `backend/routes/authRoutes.js` |
| **Lines** | 241–245 |

**Why vulnerable:** `GET /api/auth/sessions/count` reveals active session count to anyone.

**Fix:** Remove in production or protect with admin auth.

---

### VULN-016: Debug Sentry Endpoint in Production

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A05 Security Misconfiguration |
| **CWE** | CWE-489 |
| **File** | `backend/server.js` |
| **Lines** | 57–60 |

**Why vulnerable:** `/debug-sentry` intentionally throws errors — DoS/noise injection vector.

**Fix:** Remove or guard: `if (process.env.NODE_ENV !== 'production')`.

---

### VULN-017: Verbose Error Messages to Clients

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A05 Security Misconfiguration |
| **CWE** | CWE-209 |
| **Files** | Multiple routes (e.g. `examRoutes.js:53`, `seatingRoutes.js:572–576`, `ineligibilityRoutes.js:25`) |

**Why vulnerable:** `err.message`, stack traces (dev), and internal details returned in JSON.

**Fix:** Generic client messages; log details server-side only.

---

### VULN-018: Admin Can Submit Attendance Without Assignment Check

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A01 Broken Access Control |
| **CWE** | CWE-639 (Authorization Bypass Through User-Controlled Key) |
| **File** | `backend/middleware/attendanceGuard.js` |
| **Lines** | 40–42 |

**Why vulnerable:** `admin` and `faculty_incharge` skip assignment verification; `facultyId` taken from request body in submit.

**Attack scenario:** Compromised admin token submits attendance for halls not assigned (may be intended — document as accepted risk or enforce audit).

**Fix:** Always verify assignment or log immutable audit with invigilator identity from seating plan.

---

### VULN-019: Client-Side Role Enforcement Only (Frontend)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A01 Broken Access Control |
| **CWE** | CWE-602 |
| **File** | `src/App.jsx` |
| **Lines** | 27–79 |

**Why vulnerable:** `AuthGuard` uses `sessionStorage` role for route protection; backend must enforce (mostly does, except noted gaps).

**Attack scenario:** User edits `sessionStorage.user.role` and accesses UI routes; API calls still blocked if backend correct.

**Fix:** Treat frontend guards as UX only; ensure API default-deny (see VULN-001).

---

### VULN-020: Session Token in sessionStorage (XSS Impact)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A03:2021 Injection (XSS) |
| **CWE** | CWE-922 |
| **Files** | `src/pages/Landing.jsx`, `src/App.jsx`, multiple pages |

**Why vulnerable:** Bearer token in `sessionStorage` is fully readable by any XSS.

**Fix:** Prefer `HttpOnly` `Secure` `SameSite=Strict` cookies for session; implement CSP (see VULN-028).

---

### VULN-021: DOM XSS Risk via innerHTML (Print Flow)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A03 Injection |
| **CWE** | CWE-79 |
| **File** | `src/pages/Report.jsx` |
| **Lines** | 141, 176 |

**Why vulnerable:** `innerHTML` copied to print window — if seating data ever includes unsanitized user input, XSS executes.

**Fix:** Use `react-to-print` with React refs only; sanitize or text-escape dynamic content.

---

### VULN-022: File Upload — Insufficient Validation

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A04:2021 Insecure Design / A08 Software and Data Integrity |
| **CWE** | CWE-434 |
| **File** | `backend/routes/import.js` |
| **Lines** | 15, 49–57 |

**Why vulnerable:** Multer accepts any file to `uploads/`; validation is implicit via xlsx parsing only; no MIME/extension whitelist, size cap, or virus scan.

**Fix:**
```javascript
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    cb(null, allowed.includes(file.mimetype));
  },
});
```
Delete temp files after processing.

---

### VULN-023: xlsx Library — Known Prototype Pollution / ReDoS History

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A06:2021 Vulnerable and Outdated Components |
| **CWE** | CWE-1035 |
| **File** | `backend/package.json` |
| **Line** | 28 (`xlsx@0.18.5`) |

**Why vulnerable:** SheetJS community edition has had multiple advisories; parsing untrusted uploads is a high-risk surface.

**Fix:** Upgrade to patched fork (`@e965/xlsx` or commercial SheetJS), sandbox parsing, or server-side validation service.

---

### VULN-024: Large Request Body Limit (DoS)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | API4 Unrestricted Resource Consumption |
| **CWE** | CWE-400 |
| **File** | `backend/server.js` |
| **Lines** | 42–43 |

**Why vulnerable:** `50mb` JSON/urlencoded limits allow memory exhaustion.

**Fix:** Reduce to application-realistic limits (e.g. 1–5 MB) per route.

---

### VULN-025: No Security Headers (Helmet) on Express

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A05 Security Misconfiguration |
| **CWE** | CWE-693 |
| **File** | `backend/server.js` |

**Fix:**
```javascript
const helmet = require('helmet');
app.use(helmet({ contentSecurityPolicy: false })); // tune CSP separately
```

---

### VULN-026: Nginx Missing Security Headers, HSTS, TLS

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A05 Security Misconfiguration |
| **CWE** | CWE-319 |
| **File** | `nginx.conf` |

**Why vulnerable:** HTTP only (port 80); no `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `CSP`, or HSTS.

**Fix (example):**
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
# Terminate TLS at nginx with valid certificates + HSTS
```

---

### VULN-027: Clickjacking — No Frame Protection

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A05 Security Misconfiguration |
| **CWE** | CWE-1021 |
| **Files** | `nginx.conf`, `backend/server.js` |

**Fix:** `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`.

---

### VULN-028: Missing Content-Security-Policy (React App)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A03 Injection |
| **CWE** | CWE-79 |
| **File** | `nginx.conf` / frontend build |

**Fix:** Deploy strict CSP allowing only self + required CDN origins.

---

### VULN-029: Docker — Database Port Published to Host

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A05 Security Misconfiguration |
| **CWE** | CWE-668 |
| **File** | `docker-compose.yml` |
| **Lines** | 18–19 (`5433:5432`) |

**Why vulnerable:** PostgreSQL reachable from host network; combined with default/weak creds in `.env` increases blast radius.

**Fix:** Remove `ports` mapping for `db` in production; use internal Docker network only.

---

### VULN-030: Docker — Bull Board (Flower) Exposed

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A05 Security Misconfiguration |
| **File** | `docker-compose.yml` |
| **Lines** | 56–65 (`3001:3000`) |

**Why vulnerable:** Queue monitor has **no authentication** in compose file.

**Fix:** Bind to localhost only, add auth proxy, or disable in production.

---

### VULN-031: Docker Container Runs as Root (Default)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A05 Security Misconfiguration |
| **CWE** | CWE-250 |
| **Files** | `backend/Dockerfile`, `Dockerfile.frontend` |

**Fix:**
```dockerfile
RUN addgroup -S app && adduser -S app -G app
USER app
```

---

### VULN-032: No CSRF Protection for Cookie-Based Flows

| Field | Value |
|-------|-------|
| **Severity** | Low (currently Bearer header — lower risk) |
| **OWASP** | A01 Broken Access Control |
| **CWE** | CWE-352 |

**Note:** Current API uses `Authorization: Bearer` header from JS — classic CSRF less likely. If migrating to cookies, add CSRF tokens (`csurf` / double-submit cookie).

---

### VULN-033: Logout Does Not Require Valid Session

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **OWASP** | A07 Identification and Authentication Failures |
| **File** | `backend/routes/authRoutes.js` |
| **Lines** | 199–211 |

**Why vulnerable:** Logout accepts any token in body without authenticating caller.

**Fix:** Require valid session to logout (minor).

---

### VULN-034: `/health` Information Disclosure

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **OWASP** | A05 Security Misconfiguration |
| **File** | `backend/server.js` |
| **Lines** | 49–55 |

**Fix:** Return minimal `{ status: "ok" }` publicly; detailed metrics on internal network only.

---

### VULN-035: Notification Progress — Any Authenticated User

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **OWASP** | A01 Broken Access Control |
| **File** | `backend/routes/notificationRoutes.js` |
| **Lines** | 22–50 |

**Why vulnerable:** `sessionAuth` only — any role can poll queue stats.

**Fix:** Restrict to admin/faculty_incharge.

---

### VULN-036: Predictable Default Password Pattern

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **OWASP** | A07 Identification and Authentication Failures |
| **File** | `backend/utils/password.js` |
| **Lines** | 5–7 |

**Why vulnerable:** `passwordFromEmail()` derives password from email local-part — documented pattern aids guessing for provisioned accounts.

**Fix:** Generate random temporary passwords; force change on first login.

---

### VULN-037: SQL Injection — Low Risk (Parameterized Queries)

| Field | Value |
|-------|-------|
| **Severity** | Informational (positive) |
| **OWASP** | A03 Injection |
| **File** | `backend/config/db.js` |

**Finding:** Queries use `?` placeholders converted to PostgreSQL `$1..$n`. No string-concatenated user SQL observed in reviewed routes. **Continue avoiding dynamic SQL.**

---

### VULN-038: IDOR — Owner Filter Pattern

| Field | Value |
|-------|-------|
| **Severity** | Informational / Medium (requires further ID testing) |
| **OWASP** | A01 Broken Access Control |
| **File** | `backend/utils/ownerFilter.js` |

**Finding:** `faculty_incharge` scoped by `owner_user_id` on many resources — good pattern. **Verify** all delete/update by `:id` routes apply owner scoping (student/faculty/seating). Full IDOR fuzzing not completed in this review.

---

### VULN-039: Missing MFA

| Field | Value |
|-------|-------|
| **Severity** | Informational |
| **OWASP** | A07 Identification and Authentication Failures |

Microsoft SSO provides external MFA if tenant-enforced; local password login has **no MFA**.

---

### VULN-040: Mobile App — Token in AsyncStorage

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **OWASP** | A07 Identification and Authentication Failures |
| **File** | `mobile-app/src/api.js`, `mobile-app/src/context/AuthContext.js` |

**Why vulnerable:** Tokens in AsyncStorage are accessible on rooted/jailbroken devices.

**Fix:** Use `expo-secure-store` for tokens.

---

### VULN-041: Mobile Hardcoded LAN IP

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **OWASP** | A05 Security Misconfiguration |
| **File** | `mobile-app/src/config.js` |

**Finding:** `LAN_HOST` hardcoded — not a direct vuln but complicates secure deployment; use build-time env.

---

### VULN-042: Dependency Surface — Unused mongoose/mysql2

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **OWASP** | A06 Vulnerable Components |
| **File** | `backend/package.json` |

**Finding:** `mongoose`, `mysql2` listed but PostgreSQL/Sequelize used — remove unused deps to reduce supply-chain risk.

---

### VULN-043: Frontend Dependencies in Root package.json

| Field | Value |
|-------|-------|
| **Severity** | Informational |
| **File** | `package.json` |

**Finding:** React Native/Expo packages in web `package.json` increase audit noise and install size.

---

### VULN-044: Audit Logging — Good Control (Positive)

| Field | Value |
|-------|-------|
| **Severity** | Informational |
| **File** | `backend/middleware/auditLogger.js`, seating/import routes |

**Finding:** Sensitive admin actions often wrapped with `auditLogger` — continue expanding coverage.

---

### VULN-045: bcrypt for Password Hashing (Positive)

| Field | Value |
|-------|-------|
| **Severity** | Informational |
| **File** | `backend/utils/password.js` |

**Finding:** New passwords use bcrypt cost 10 — acceptable; increase to 12 for admin accounts if performance allows.

---

### VULN-046: Open Redirect Partial Risk (OAuth error params)

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **OWASP** | A01 Broken Access Control |
| **CWE** | CWE-601 |
| **File** | `backend/routes/microsoftAuthRoutes.js` |

**Finding:** Redirects use fixed `FRONTEND_URL` — safe if env is trusted. Compromised `FRONTEND_URL` env enables redirect attacks.

---

## OWASP Top 10 (2021) Coverage

| Category | Status | Key Issues |
|----------|--------|------------|
| A01 Broken Access Control | **Fail** | VULN-001, 002, 013, 014, 018 |
| A02 Cryptographic Failures | **Fail** | VULN-004, 011, secrets handling |
| A03 Injection | **Partial** | XSS risk VULN-021; SQL mostly OK |
| A04 Insecure Design | **Partial** | In-memory sessions, public APIs by design |
| A05 Security Misconfiguration | **Fail** | CORS, Nginx, Docker exposure, debug routes |
| A06 Vulnerable Components | **Partial** | xlsx, npm audit not fully run |
| A07 Auth Failures | **Fail** | No rate limit, weak passwords, SSO token in URL |
| A08 Software/Data Integrity | **Partial** | Upload parsing trust |
| A09 Logging Failures | **Partial** | Token logging; audit logs present |
| A10 SSRF | **Not assessed** | axios used for Microsoft Graph only |

---

## Priority Remediation Plan

### Phase 0 — Immediate (0–48 hours)
1. Add authentication to **`/api/exams`** and **`/api/ineligibility/students/*`**.
2. Remove or protect **`/api/import/last-*-import`**, **`/api/auth/sessions/count`**, **`/debug-sentry`**.
3. Stop passing **session token in URL** (SSO callback).
4. **Rotate** all secrets in `backend/.env` if ever exposed.
5. Remove **sessionAuth debug logging** in production.

### Phase 1 — Short term (1–2 weeks)
6. Migrate sessions to **Redis** with TTL + sliding expiration.
7. Implement **rate limiting** on auth and import endpoints.
8. Lock down **CORS** and add **Helmet** + Nginx security headers.
9. Enable **TLS** termination at Nginx with HSTS.
10. Fix **OAuth state** validation.
11. Remove **plaintext password** verification path; migrate hashes.

### Phase 2 — Medium term (2–6 weeks)
12. File upload hardening + temp file cleanup.
13. Replace or sandbox **xlsx** parsing.
14. Move secrets to **Docker secrets** / vault.
15. Run **`npm audit`** in CI; Dependabot/Snyk.
16. IDOR test all `:id` routes with cross-tenant users.
17. Mobile: **expo-secure-store** for tokens.

### Phase 3 — Ongoing
18. Annual penetration test, SAST/DAST in CI, security training, incident response runbooks.

---

## Security Hardening Checklist

- [ ] Default-deny authentication on all `/api/*` routes
- [ ] Redis-backed sessions with 24h TTL enforced on every request
- [ ] Rate limiting on `/api/auth/login` and Microsoft OAuth
- [ ] CORS restricted to known frontend origin(s)
- [ ] Helmet + Nginx security headers + CSP
- [ ] TLS 1.2+ with HSTS preload (production)
- [ ] Secrets in vault, not `.env` in images
- [ ] PostgreSQL not published to host in production
- [ ] Bull Board / Flower not public
- [ ] Non-root Docker users
- [ ] Remove debug endpoints and verbose errors in production
- [ ] Password policy ≥ 12 chars + breach check
- [ ] MFA for admin / faculty_incharge (Microsoft SSO + Conditional Access)
- [ ] File upload validation + size limits + AV scan
- [ ] Centralized structured logging without secrets
- [ ] Regular dependency scanning (`npm audit`, OSV)
- [ ] SAST (Semgrep/CodeQL) in CI
- [ ] Backup encryption for PostgreSQL volumes

---

## Additional Files / Configurations Needed for Complete Assessment

1. Production deployment diagram (TLS termination, firewall rules).
2. Azure AD app registration (redirect URIs, token settings, admin consent).
3. Results of **`npm audit`** and **`docker scout`** on built images.
4. PostgreSQL `pg_hba.conf` and SSL settings inside container.
5. WAF / reverse proxy rules if any (Cloudflare, Azure Front Door).
6. Mobile app production signing and release configuration.
7. Data classification policy for student PII retention.
8. Penetration test report after fixes (validation retest).

---

## Overall Security Rating

| Metric | Score |
|--------|------:|
| **Overall security rating** | **3.5 / 10** |
| Confidentiality | 3 / 10 |
| Integrity | 4 / 10 |
| Availability | 5 / 10 |
| Compliance readiness (FERPA-like student data) | 2 / 10 |

**Conclusion:** The application has a solid foundation (parameterized SQL, bcrypt, role middleware on many routes, audit logging on sensitive actions) but **critical access-control gaps** and **authentication/session weaknesses** make it unsuitable for internet-facing production until Phase 0 and Phase 1 remediations are complete.

## Appendix A — Backend `npm audit` (2026-06-29)

Initial automated audit run timed out on JSON output; retry completed successfully.

**Summary:** **19 vulnerabilities** — **9 high**, **10 moderate**, **0 critical**

| Package | Severity | Notes |
|---------|----------|--------|
| `axios` (^1.7.9) | **High** | Multiple SSRF, prototype pollution, header injection, DoS advisories — upgrade to latest patched 1.x |
| `@sentry/node` | Moderate | Transitive via `@opentelemetry/*` (memory allocation in baggage propagation) |
| `follow-redirects` | Moderate | Auth header leak on cross-domain redirects (axios transitive) |
| `mongoose` | High | NoSQL injection in `$nor` sanitization — **unused in runtime**; remove dependency |
| `xlsx` | High/Moderate | Prototype pollution / ReDoS history — see VULN-023 |

**Recommended actions:**
```bash
cd backend
npm audit fix          # safe fixes
npm update axios @sentry/node
npm uninstall mongoose mysql2   # if confirmed unused
npm audit              # re-check
```

Add `npm audit --audit-level=high` to CI and fail builds on new high/critical findings.

---

*This document is a point-in-time static analysis based on repository source code. It is not a substitute for a full black-box penetration test or compliance audit.*
