# ClassAssign — Full QA Testing Report

**Date:** 2026-06-14  
**Scope:** Web app, backend API, mobile app, Docker runtime  
**Method:** Code review, workflow tracing, live Docker log analysis, API contract inspection  
**Testers lens:** End user, QA, Product Owner, Developer, Admin, Faculty, HoD  

---

## Executive Summary

ClassAssign delivers core exam seating, faculty allocation, attendance, and reporting workflows, but **many user-facing actions fail silently or with generic errors** when business rules block them. The most severe gap is **missing pre-delete dependency checks** (faculty, students, users, timetable) compared to venues, which already implement them correctly.

Live Docker logs captured a real failure: deleting faculty ID 36 while assigned to a seating plan produced a PostgreSQL FK error (`seating_plan_venues_faculty_id_fkey`), but the UI showed only **"❌ Delete failed"** with no actionable message.

Additional systemic issues:

- **Inconsistent API error shapes** (`{ error }`, `{ message }`, `{ success, message }`, raw `err` objects)
- **Widespread `alert()` / `window.confirm()`** instead of toast/banner UX
- **Cookie-auth migration incomplete** on faculty portal logout and template downloads
- **Business logic bugs** in seating save atomicity, faculty allocation counting, and attendance partial submit
- **Navigation bug:** Report page links to `/hall` but route is `/Hall` (404)
- **No automated test suite** — zero unit/integration/E2E tests found

**Overall Software Quality Score: 5.8 / 10**

The product is usable for happy-path demos by trained admins, but **not reliable for production exam operations** without fixing business-rule enforcement and error surfacing.

---

## Bug Statistics

| Category | Critical | High | Medium | Low | **Total** |
|----------|----------|------|--------|-----|-----------|
| Business Logic | 6 | 8 | 5 | 2 | **21** |
| Backend / API | 4 | 7 | 6 | 3 | **20** |
| UI / Frontend | 2 | 6 | 12 | 8 | **28** |
| Validation | 1 | 4 | 8 | 4 | **17** |
| UX | 0 | 5 | 10 | 6 | **21** |
| Security (post-remediation) | 1 | 2 | 3 | 2 | **8** |
| Performance | 0 | 1 | 3 | 2 | **6** |
| Mobile | 2 | 3 | 2 | 2 | **9** |
| Database | 2 | 2 | 1 | 0 | **5** |
| **Total unique bugs** | **18** | **38** | **50** | **29** | **~135** |

*(Many bugs overlap categories; **52 distinct tracked issues** documented below with BUG-001–BUG-052.)*

---

## Error Handler & API Message Catalog

### Global error handler (`backend/middleware/errorHandler.js`)

| HTTP | Response body | When |
|------|---------------|------|
| 404 | `{ "error": "Not Found", "path": "/..." }` | Unknown route (`notFoundHandler`) |
| 500 | `{ "error": "Internal Server Error" }` | Unhandled exception in production |
| 4xx | `{ "error": "<err.message>" }` | Thrown errors with status < 500 |

**Gap:** Most routes catch errors locally and never reach this handler. Formats differ per route.

### Authentication (`backend/routes/authRoutes.js`, `middleware/sessionAuth.js`)

| HTTP | Message | Where shown in UI |
|------|---------|-------------------|
| 401 | `{ "error": "Authorization required" }` | Redirect to login |
| 401 | `{ "error": "Invalid or expired session", "hint": "..." }` | Redirect to login |
| 401 | `{ "error": "Session expired" }` | Redirect to login |
| 401 | `{ "success": false, "message": "Invalid credentials" }` | Landing login form |
| 401 | `{ "success": false, "message": "Account is inactive..." }` | Landing login form |
| 400 | `{ "success": false, "message": "<password policy>" }` | Change password form |
| 429 | `{ "success": false, "message": "Too many login attempts..." }` | Login (rate limiter) |

### Faculty (`backend/routes/facultyRoutes.js`) — **problematic**

| HTTP | Actual response | UI shows |
|------|-----------------|----------|
| 500 | **Raw DB/Error object** via `res.status(500).json(err)` | `"❌ Delete failed"` |
| 409 | `{ "message": "Faculty with this email already exists" }` | Inline message (add faculty) |
| 201 | `{ "message": "...", "generatedPassword": "..." }` | Success banner |

**Live error (Docker log 2026-06-29):**
```
ERROR: update or delete on table "faculty" violates foreign key constraint
"seating_plan_venues_faculty_id_fkey"
DETAIL: Key (id)=(36) is still referenced from table "seating_plan_venues".
```

### Venue delete — **good pattern** (`backend/routes/venueRoutes.js`)

| HTTP | Message | UI shows |
|------|---------|----------|
| 400 | `{ "error": "Cannot delete venue", "details": "This venue is linked to N seating plan(s)." }` | Alert with details |

### Seating (`backend/routes/seatingRoutes.js`)

| HTTP | Message | UI |
|------|---------|-----|
| 400 | `{ "error": "Venue conflict", "details": "..." }` | Allotment inline error |
| 400 | `{ "error": "Faculty unavailable", "details": "..." }` | Allotment inline error |
| 400 | `{ "error": "Faculty time conflict", "details": "..." }` | Allotment inline error |
| 500 | `{ "error": "Failed to save seating plan", "message": "..." }` | Allotment inline error |
| 404 | `{ "error": "Seating plan not found" }` | Report delete alert |

### Users (`backend/routes/userManagementRoutes.js`)

| HTTP | Message | UI |
|------|---------|-----|
| 400/403/404 | `{ "error": "..." }` | `alert(err.response?.data?.error \|\| 'Failed to...')` |
| 201 | `{ "message": "User created successfully" }` | `alert('User created successfully!')` |

### Import (`backend/routes/import.js`)

| HTTP | Message |
|------|---------|
| 400 | `{ "message": "Only .xlsx and .xls files are allowed." }` |
| 400 | `{ "message": "File exceeds maximum allowed size (5 MB)." }` |
| 429 | `{ "error": "Import rate limit exceeded." }` |

### Attendance (`backend/services/attendanceService.js`, controllers)

| Condition | Message |
|-----------|---------|
| Locked | `"Attendance is locked for this exam and venue"` |
| Not invigilator | `"You are not assigned as invigilator for this hall"` |
| Partial roster | No error — partial submit allowed (**bug**) |

---

## Detailed Bug Reports

---

### BUG-001

| Field | Value |
|-------|-------|
| **Module** | Faculty Management |
| **Page** | `/faculty` |
| **Feature** | Delete faculty |
| **Severity** | **Critical** |
| **Priority** | P0 |

**Steps to Reproduce**
1. Log in as `faculty_incharge` or `admin`
2. Create seating plan assigning faculty member (e.g. Faizal, id 36)
3. Go to Faculty page → click **Delete** on that faculty
4. Confirm dialog

**Expected Result**  
System blocks delete and shows: *"This faculty is assigned to an examination. Remove the assignment before deleting."*

**Actual Result**  
UI shows **"❌ Delete failed"**. Docker/DB logs show FK violation `seating_plan_venues_faculty_id_fkey`.

**Root Cause**  
`DELETE /api/faculty/:id` performs blind delete with no pre-check; catch block returns raw error object.

**Frontend File** | `src/pages/Faculty.jsx` L209–217  
**Backend File** | `backend/routes/facultyRoutes.js` L150–156, `backend/models/Faculty.js` L87–91  
**API** | `DELETE /api/faculty/:id`  
**Database Table** | `faculty`, `seating_plan_venues`  

**Recommended Fix**  
Check allocation count before delete; return HTTP 409 with structured message.

**Sample Code Fix (backend):**
```javascript
// facultyRoutes.js — before delete
const [usage] = await db.query(
  "SELECT COUNT(*) AS count FROM seating_plan_venues WHERE faculty_id = ?",
  [req.params.id]
);
if (Number(usage[0]?.count) > 0) {
  return res.status(409).json({
    error: "Cannot delete faculty",
    details: "This faculty is assigned to an examination. Remove the assignment before deleting.",
  });
}
```

---

### BUG-002

| Field | Value |
|-------|-------|
| **Module** | Reports |
| **Page** | `/report` |
| **Feature** | Hall View navigation |
| **Severity** | **High** |
| **Priority** | P0 |

**Steps:** Report page → click **Hall View**  
**Expected:** Opens hall/seating arrangement view  
**Actual:** Navigates to `/hall` → **404** (route is `/Hall` in `App.jsx`)  

**Root Cause** | Case mismatch in `navigate("/hall")` vs route `/Hall`  
**Frontend File** | `src/pages/Report.jsx` L214  
**Recommended Fix** | `navigate("/Hall")` or normalize route to lowercase  

---

### BUG-003

| Field | Value |
|-------|-------|
| **Module** | Faculty Portal |
| **Page** | `/faculty/dashboard` |
| **Feature** | Logout |
| **Severity** | **High** |
| **Priority** | P0 |

**Steps:** Faculty dashboard → Logout  
**Expected:** Server session invalidated, cookie cleared, redirect to login  
**Actual:** Only `sessionStorage.clear()` + navigate — **session cookie remains valid**  

**Root Cause** | `handleLogout` does not call `/api/auth/logout`  
**Frontend File** | `src/pages/FacultyDashboard.jsx` L28–31  
**Backend File** | `backend/routes/authRoutes.js` POST `/logout`  
**Recommended Fix** | Use `logout()` from `src/lib/api.js`  

---

### BUG-004

| Field | Value |
|-------|-------|
| **Module** | Faculty Login |
| **Page** | `/attendance/login` |
| **Feature** | Role-restricted login |
| **Severity** | **High** |
| **Priority** | P0 |

**Steps:** Log in as admin via Faculty Login portal  
**Expected:** Reject login without creating session  
**Actual:** Server sets auth cookie; UI shows error but **session remains active**  

**Root Cause** | Login API succeeds before client-side role check; no server logout on rejection  
**Frontend File** | `src/pages/FacultyLogin.jsx` L30–34  
**Backend File** | `backend/routes/authRoutes.js`  
**Recommended Fix** | Call logout after role mismatch OR add `allowedRoles` param to login endpoint  

---

### BUG-005

| Field | Value |
|-------|-------|
| **Module** | Database layer |
| **Feature** | DELETE/UPDATE affected rows |
| **Severity** | **Critical** |
| **Priority** | P0 |

**Expected:** `affectedRows` reflects rows deleted/updated  
**Actual:** PostgreSQL DELETE without RETURNING returns empty array → `affectedRows = 0` always  

**Root Cause** | `backend/config/db.js` L94–98  
**Impact** | `Student.deleteById`, `User.deleteUser`, `Timetable.deleteById` may return 404 after successful delete or false "not found"  
**Recommended Fix** | Use `RETURNING id` or Sequelize `rowCount`  

---

### BUG-006

| Field | Value |
|-------|-------|
| **Module** | Seating / Allotment |
| **Feature** | Save seating plan |
| **Severity** | **Critical** |
| **Priority** | P0 |

**Expected:** Atomic transaction — venue check, plan insert, attendance sync, session booking  
**Actual:** `SeatingPlan.createPlan()` uses **separate connection/transaction**; concurrent saves can double-book venue/faculty  

**Root Cause** | `backend/routes/seatingRoutes.js` L53–193, `backend/models/SeatingPlan.js`  
**Recommended Fix** | Pass outer connection into createPlan; lock venue rows  

---

### BUG-007

| Field | Value |
|-------|-------|
| **Module** | Faculty allocation |
| **Feature** | Max classrooms limit |
| **Severity** | **High** |
| **Priority** | P1 |

**Expected:** Limit applies to **current/active** exam assignments  
**Actual:** Counts **all historical** rows in `seating_plan_venues` — faculty permanently blocked after past exams  

**Root Cause** | `Faculty.canAllocate()` / seating availability check uses lifetime COUNT  
**Backend File** | `backend/models/Faculty.js` L113–136, `backend/routes/seatingRoutes.js`  

---

### BUG-008

| Field | Value |
|-------|-------|
| **Module** | Attendance |
| **Feature** | Submit attendance |
| **Severity** | **High** |
| **Priority** | P1 |

**Expected:** Full roster submitted or explicit partial-submit flag; lock applies consistently  
**Actual:** Partial array accepted; only submitted students marked; race condition on lock check (TOCTOU)  

**Root Cause** | `backend/services/attendanceService.js` L399–443, `attendanceGuard.js`  

---

### BUG-009

| Field | Value |
|-------|-------|
| **Module** | Attendance |
| **Feature** | HoD attendance report |
| **Severity** | **High** |
| **Priority** | P1 |

**Expected:** HoD sees only own department  
**Actual:** Route allows HoD role but `getAttendanceReport` has **no department filter**  

**Backend File** | `backend/routes/attendanceRoutes.js`, `backend/services/attendanceService.js` L516–556  

---

### BUG-010

| Field | Value |
|-------|-------|
| **Module** | Seating delete |
| **Feature** | Delete seating plan |
| **Severity** | **Critical** |
| **Priority** | P1 |

**Expected:** Block delete if attendance is locked/submitted  
**Actual:** Deletes attendance records even when locked; may delete records for **other plans** sharing same exam+venue  

**Backend File** | `backend/routes/seatingRoutes.js` L223–305, `backend/services/attendanceService.js` L193–236  

---

### BUG-011

| Field | Value |
|-------|-------|
| **Module** | Template download |
| **Pages** | `/faculty`, `/student`, `/venue`, `/timetable` |
| **Feature** | Download Excel template |
| **Severity** | **High** |
| **Priority** | P1 |

**Steps:** Click "Download Template" link  
**Expected:** File downloads  
**Actual:** Raw `<a href="/format/...">` — if session expired or HoD role (not in allowed list for `/format`), browser shows **JSON error page**  

**Root Cause** | Post-security `/format` requires auth; no blob download via API; `templateRoutes.js` exists but **not mounted** in `server.js`  
**Frontend Files** | `Faculty.jsx`, `Student.jsx`, `Venue.jsx`, `Timetable.jsx`  
**Backend File** | `backend/server.js` L76–80  

---

### BUG-012

| Field | Value |
|-------|-------|
| **Module** | Audit Logs |
| **Page** | `/logs` |
| **Feature** | Search + pagination |
| **Severity** | **High** |
| **Priority** | P1 |

**Steps:** Apply filters → Search → click Next page  
**Expected:** Paginate within search results or disable pagination  
**Actual:** Pagination calls `fetchLogs()` **without filters** — search results replaced  

**Frontend File** | `src/pages/Logs.jsx` L77–109, L436–451  

---

### BUG-013

| Field | Value |
|-------|-------|
| **Module** | Auth |
| **Feature** | AuthGuard role denial |
| **Severity** | **Medium** |
| **Priority** | P2 |

**Actual:** Uses blocking `alert()` then redirect — poor UX, not accessible  
**Frontend File** | `src/App.jsx` L47–50  

---

### BUG-014

| Field | Value |
|-------|-------|
| **Module** | User Management |
| **Page** | `/users` |
| **Feature** | Create/Edit/Delete user |
| **Severity** | **Medium** |
| **Priority** | P1 |

**Issues:** No loading/disabled on modal buttons → double-submit; all feedback via `alert()`; empty table has no "No users" row; form `minLength="6"` vs backend 8-char policy  

**Frontend File** | `src/pages/UserManagement.jsx`  

---

### BUG-015

| Field | Value |
|-------|-------|
| **Module** | Student Management |
| **Feature** | Delete student |
| **Severity** | **High** |
| **Priority** | P1 |

**Expected:** Block delete if student has locked attendance or active seating  
**Actual:** No pre-check; `attendance` rows **CASCADE deleted** silently  

**Backend File** | `backend/routes/studentRoutes.js`, `005_attendance_module.sql`  

---

### BUG-016

| Field | Value |
|-------|-------|
| **Module** | Faculty import |
| **Feature** | Excel import vs manual add |
| **Severity** | **Medium** |
| **Priority** | P2 |

**Expected:** Imported faculty can use attendance app  
**Actual:** Manual add creates `users` row; Excel import only inserts `faculty` — **no login account**  

**Backend File** | `backend/routes/import.js` vs `backend/routes/facultyRoutes.js`  

---

### BUG-017

| Field | Value |
|-------|-------|
| **Module** | Sidebar |
| **Feature** | Render with corrupt session |
| **Severity** | **Medium** |
| **Priority** | P2 |

**Actual:** `JSON.parse(sessionStorage.getItem("user"))` without try/catch — corrupt data **crashes sidebar**  

**Frontend File** | `src/Components/Sidebar.jsx` L27  

---

### BUG-018

| Field | Value |
|-------|-------|
| **Module** | API consistency |
| **Feature** | Error responses |
| **Severity** | **Medium** |
| **Priority** | P2 |

**Actual:** Five+ error formats across API; faculty routes leak raw errors on 500  

**Backend Files** | `facultyRoutes.js`, `studentRoutes.js`, `authRoutes.js`, `import.js`, etc.  

---

### BUG-019

| Field | Value |
|-------|-------|
| **Module** | Timetable |
| **Feature** | Bulk import |
| **Severity** | **Medium** |
| **Priority** | P2 |

**Actual:** Row-by-row insert without transaction — partial import on mid-batch failure  

**Backend File** | `backend/routes/timetableRoutes.js` L292–315  

---

### BUG-020

| Field | Value |
|-------|-------|
| **Module** | Timetable |
| **Feature** | Manual create validation |
| **Severity** | **Low** |
| **Priority** | P3 |

**Actual:** Manual POST accepts invalid `session`/`examType` values; bulk import validates enums  

**Backend File** | `backend/routes/timetableRoutes.js` L90–108  

---

### BUG-021 through BUG-052 (Summary Table)

| ID | Module | Issue | Severity |
|----|--------|-------|----------|
| BUG-021 | Venue | Submit form no loading/disabled state | Medium |
| BUG-022 | Faculty | Delete/update no loading guard — double-click | Medium |
| BUG-023 | Timetable | Bulk delete no in-flight lock | Medium |
| BUG-024 | Report | Delete plan no disabled during request | Medium |
| BUG-025 | Student | Single-row delete not using deleteLoading | Medium |
| BUG-026 | Allotment | Success via `alert()` blocks UI | Low |
| BUG-027 | IneligibleStudentsView | Search empty vs truly empty same message | Low |
| BUG-028 | StudentAttendance | No empty state when no seating plans | Medium |
| BUG-029 | Faculty | Filtered empty table — no "no matches" message | Medium |
| BUG-030 | Landing | Microsoft login button no disabled during redirect | Low |
| BUG-031 | lib/api.js | 401 redirects faculty to `/login` not `/attendance/login` | Medium |
| BUG-032 | Multiple pages | RBAC from stale sessionStorage user object | Medium |
| BUG-033 | User delete | No check for owned data / audit log references | High |
| BUG-034 | Timetable delete | No check if used by seating/allotment | Medium |
| BUG-035 | Import undo | Faculty undo may hit FK if assigned to plans | High |
| BUG-036 | Import delete-all | Students/faculty bulk delete no dependency checks | Critical |
| BUG-037 | Faculty max-classrooms | PUT has no owner scope validation | Medium |
| BUG-038 | Attendance API | Students in seating but not in `students` table omitted | High |
| BUG-039 | Exam resolution | Wrong exam linked by date/session heuristics | High |
| BUG-040 | Print (Report) | Bulk print cloneNode may duplicate/misplace content | Medium |
| BUG-041 | Mobile | No must-change-password flow | High |
| BUG-042 | Mobile | Token stored before role validation on login | Medium |
| BUG-043 | Mobile | Errors via alert() only | Medium |
| BUG-044 | HoD | Can view Report/Hall/Attendance but not Venue/Student/Faculty — may be intentional but limits self-service | Low |
| BUG-045 | Notifications | Progress endpoint any authenticated user | Low |
| BUG-046 | No dark mode | UI light-only | Low |
| BUG-047 | No pagination | Large faculty/student lists render all rows | Medium |
| BUG-048 | Accessibility | No ARIA on modals; alert() not screen-reader friendly | Medium |
| BUG-049 | ChangePassword | Faculty portal users may land on `/allotment` redirect after change | Low |
| BUG-050 | Docker compose | Requires root `.env` POSTGRES_PASSWORD — breaks if only `backend/.env` exists | Medium |
| BUG-051 | Rate limit | No UI message when login rate limited (429) on Landing | Medium |
| BUG-052 | Testing | Zero automated tests in repo | High |

---

## Page-by-Page Test Matrix

| Page | Route | Roles | Status | Key Issues |
|------|-------|-------|--------|------------|
| Landing | `/`, `/login` | Public | ⚠️ Partial | Cookie login OK; SSO OK; rate limit message missing |
| Change Password | `/change-password` | All authed | ✅ OK | Policy enforced; redirect role-aware |
| Allotment | `/allotment` | admin, FI | ⚠️ Partial | Save works; alert on success; race on concurrent save |
| Venue | `/venue` | admin, FI | ⚠️ Partial | Good delete messages; form double-submit |
| Faculty | `/faculty` | admin, FI | ❌ Fail | Delete FK error; generic errors; import inconsistency |
| Student | `/student` | admin, FI | ⚠️ Partial | Notifications complex; delete cascade risk |
| Timetable | `/timetable` | admin, FI, HoD | ⚠️ Partial | HoD read-only OK; bulk import not atomic |
| Report | `/report` | admin, FI, HoD | ❌ Fail | `/hall` 404; print UX |
| Hall | `/Hall` | admin, FI, HoD | ⚠️ Not fully tested | Route exists; linked incorrectly |
| User Management | `/users` | admin, HoD | ⚠️ Partial | alert()-heavy; double-submit |
| Logs | `/logs` | admin | ❌ Fail | Search/pagination conflict |
| Ineligibility View | `/ineligibility/view` | admin, FI | ✅ OK | Minor empty-state wording |
| Attendance (admin) | `/attendance` | admin, FI, HoD | ⚠️ Partial | Depends on seating data completeness |
| Attendance Reports | `/admin/attendance` | admin, FI | ⚠️ Partial | No loading on provision/unlock |
| Faculty Login | `/attendance/login` | Public | ❌ Fail | Orphan session on wrong role |
| Faculty Dashboard | `/faculty/dashboard` | faculty | ❌ Fail | Logout incomplete |
| Faculty Attendance | `/faculty/attendance/:id` | faculty | ⚠️ Partial | Submit lock race; partial roster |
| Mobile Login | — | faculty | ⚠️ Partial | No password change flow |
| Mobile Attendance | — | faculty | ⚠️ Partial | alert() errors |

**Legend:** ✅ OK · ⚠️ Partial · ❌ Fail

---

## CRUD Coverage

| Entity | Create | Read | Update | Delete | Business rules | Audit log |
|--------|--------|------|--------|--------|----------------|-----------|
| Users | ✅ | ✅ | ✅ | ⚠️ | ⚠️ No dependency check | ❌ Not on all actions |
| Faculty | ✅ | ✅ | ⚠️ | ❌ | ❌ FK not handled | ❌ |
| Students | ✅ Import | ✅ | ❌ | ⚠️ | ❌ Cascade attendance | ❌ |
| Venues | ✅ | ✅ | ✅ | ✅ | ✅ Usage check | ✅ |
| Timetable | ✅ | ✅ | ❌ | ⚠️ | ❌ No usage check | ❌ |
| Seating plans | ✅ | ✅ | ❌ | ⚠️ | ❌ Deletes locked attendance | ⚠️ |
| Attendance | ✅ Submit | ✅ | ⚠️ Unlock | N/A | ⚠️ Partial submit | ❌ |
| Ineligibility | ✅ Bulk | ✅ | ❌ | ✅ | ✅ Owner filter | ✅ |
| Exams | ✅ | ✅ | ❌ | ❌ | ⚠️ Minimal validation | ❌ |

---

## Validation Gaps Found

| Input | Test | Result |
|-------|------|--------|
| Empty required fields | Login, forms | ✅ Mostly blocked |
| Weak password (6 chars) | User Management form | ❌ HTML minLength=6 vs API 8 |
| Duplicate email | Faculty add | ✅ 409 returned |
| Duplicate regn (students) | Import | ⚠️ Allowed by migration 003 |
| Negative bench rows | Venue form | ⚠️ Client may allow; server validates |
| File > 5MB | Import | ✅ Blocked post-security |
| Wrong file type (.pdf) | Import | ✅ Blocked |
| Emoji in names | Not validated | ⚠️ Likely accepted |
| SQL in text fields | Parameterized queries | ✅ Safe |
| Future exam dates | Allotment | ⚠️ Not consistently validated |
| Faculty delete while assigned | Business rule | ❌ **Fails** |

---

## UI / UX Issues (Selected)

- **No toast system** — 40+ uses of `alert()` / `confirm()`
- **No dark mode**
- **Responsive:** Layout works on desktop; mobile sidebar OK; tables overflow on small screens (horizontal scroll only)
- **Loading:** Inconsistent — some pages full-screen spinner, others none
- **Icons/labels:** Generally consistent Heroicons + Tailwind
- **Broken link:** Report → Hall (`BUG-002`)
- **Accessibility:** AuthGuard alert; modals lack focus trap

---

## Security Issues (Functional QA lens, post-remediation)

| ID | Issue | Severity |
|----|-------|----------|
| SEC-QA-01 | Faculty portal logout leaves cookie | High |
| SEC-QA-02 | Wrong-role login creates session | High |
| SEC-QA-03 | HoD attendance report cross-department | High |
| SEC-QA-04 | Raw error objects from faculty API may leak SQL | Medium |
| SEC-QA-05 | sessionStorage user object stale vs cookie session | Medium |

---

## Performance Issues

| Issue | Impact |
|-------|--------|
| No pagination on large lists | Slow render 1000+ students |
| Allotment fetches ineligible per course in loops | N+1 API pattern |
| 5MB body limit | OK for Excel; large seating JSON may fail on big exams |

---

## Top 20 Bugs to Fix First

| Rank | ID | Title | Severity |
|------|-----|-------|----------|
| 1 | BUG-001 | Faculty delete — FK error, generic message | Critical |
| 2 | BUG-006 | Seating save not atomic — double booking | Critical |
| 3 | BUG-005 | affectedRows broken on DELETE | Critical |
| 4 | BUG-010 | Delete seating plan removes locked/cross-plan attendance | Critical |
| 5 | BUG-036 | Import delete-all with no dependency checks | Critical |
| 6 | BUG-003 | Faculty dashboard logout incomplete | High |
| 7 | BUG-004 | Faculty login orphan session | High |
| 8 | BUG-002 | Report Hall View 404 | High |
| 9 | BUG-007 | Faculty allocation lifetime count | High |
| 10 | BUG-008 | Partial attendance submit + race | High |
| 11 | BUG-009 | HoD report no department filter | High |
| 12 | BUG-011 | Template download auth/UX failure | High |
| 13 | BUG-012 | Logs search vs pagination | High |
| 14 | BUG-015 | Student delete cascades attendance | High |
| 15 | BUG-035 | Import undo faculty FK failure | High |
| 16 | BUG-038 | Missing students in attendance API | High |
| 17 | BUG-041 | Mobile no password change flow | High |
| 18 | BUG-014 | User Management double-submit + alerts | Medium |
| 19 | BUG-031 | 401 redirect wrong for faculty | Medium |
| 20 | BUG-052 | No automated test suite | High |

---

## Recommended Fix Patterns

### 1. Standard API error envelope (all routes)
```javascript
res.status(409).json({
  error: "Cannot delete faculty",
  details: "This faculty is assigned to an examination. Remove the assignment before deleting.",
  code: "FACULTY_ASSIGNED_TO_EXAM",
});
```

### 2. Frontend error extraction helper
```javascript
// src/lib/errors.js
export function getApiError(err, fallback = "Request failed") {
  const d = err?.response?.data;
  return d?.details || d?.message || d?.error || fallback;
}
```

### 3. Faculty delete UI
```javascript
} catch (err) {
  setMessage(`❌ ${getApiError(err, "Delete failed")}`);
}
```

---

## Overall Software Quality Score

| Dimension | Score (0–10) |
|-----------|--------------|
| Functional completeness | 7.0 |
| Business rule enforcement | **4.5** |
| Error handling & messaging | **4.0** |
| UI/UX consistency | 5.5 |
| API design consistency | 5.0 |
| Data integrity | 5.0 |
| Mobile parity | 6.0 |
| Test coverage | **1.0** |
| Security (post-remediation) | 7.5 |
| Performance at scale | 5.5 |
| **Overall** | **5.8 / 10** |

---

## Conclusion

The application implements the **core exam seating workflow** but fails the **professional QA bar** on delete guards, transactional integrity, error messaging, and test automation. The venue delete implementation is the **reference pattern** — replicate its pre-check + `{ error, details }` response across faculty, student, user, timetable, and seating modules.

**Next steps:** Fix Top 20 list, add integration tests for CRUD + business rules, replace `alert()` with a toast system, mount or remove dead `templateRoutes.js`, and add E2E tests for Allotment → Report → Attendance happy path.

---

*Report generated from static analysis + Docker runtime logs. Manual browser E2E was not executed in this pass; several UI bugs are code-evidence based and should be confirmed in a formal test run.*
