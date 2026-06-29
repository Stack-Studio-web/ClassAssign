# UUID Migration — ClassAssign

Public-facing routes and APIs now use **UUIDs** (`public_uuid` column). Numeric `id` values remain internal primary keys for joins and foreign keys only.

## Database

**Migration:** `backend/databasemigration/007_add_public_uuids.sql`  
**Runtime bootstrap:** `backend/utils/ensureUuidSchema.js` (runs on every server start)

Tables with `public_uuid`:

| Table | Public use |
|-------|------------|
| `users` | User management, auth session |
| `students` | Student CRUD, attendance rows |
| `faculty` | Faculty CRUD, assignments |
| `venues` | Venue CRUD, seating |
| `exams` | Exam metadata |
| `timetable` | Timetable CRUD |
| `ineligible_students` | Ineligibility CRUD |
| `seating_plans` | Reports, allotment |
| `faculty_assignments` | **Attendance URL key** (`assignmentUuid`) |
| `attendance_sessions` | Window lock/unlock/configure (`sessionUuid`) |

Apply manually on existing DB:

```bash
docker compose exec db psql -U root -d venuedb -f /migrations/007_add_public_uuids.sql
```

## URL changes

### Web (React Router)

| Before | After |
|--------|-------|
| `/faculty/attendance/2?venueId=2&facultyId=37` | `/faculty/attendance/{assignmentUuid}` |

### API (examples)

| Before | After |
|--------|-------|
| `GET /api/attendance/exam/2/venue/2/students` | `GET /api/attendance/assignment/{uuid}/students` |
| `POST /api/attendance/submit` `{ examId, venueId, facultyId }` | `{ assignmentUuid, attendance: [{ studentUuid, status }] }` |
| `POST /api/attendance/lock` `{ examId, venueId }` | `{ sessionUuid }` |
| `DELETE /api/students/5` | `DELETE /api/students/{uuid}` |
| `DELETE /api/faculty/37` | `DELETE /api/faculty/{uuid}` |
| `PUT /api/venues/5` | `PUT /api/venues/{uuid}` |

### Mobile (React Navigation params)

| Before | After |
|--------|-------|
| `{ examId, venueId, facultyId }` | `{ assignmentUuid, ...metadata }` |

## Backward compatibility

- **GET** requests with legacy numeric path params receive **308 redirect** to the UUID URL (via `resolveEntity` middleware).
- `GET /api/attendance/exam/:examId/venue/:venueId/students` redirects to assignment UUID route when a matching assignment exists.
- Legacy numeric IDs in request bodies are still resolved where noted (`allowLegacyNumeric: true`) during transition.

## Security

- Malformed or unknown UUIDs → **404 Not Found** (no distinction between invalid format and missing record).
- Unauthorized access → **403 Forbidden**.
- Numeric IDs are not returned in API responses or URLs.

## Core backend files

| File | Role |
|------|------|
| `utils/publicId.js` | UUID validation, resolve internal id, response helpers |
| `middleware/resolvePublicId.js` | Route param → `req.internalId` |
| `middleware/attendanceGuard.js` | Assignment UUID context for attendance |
| `services/attendanceService.js` | Assignment/session/student UUID mapping |
| `controllers/attendanceController.js` | UUID-based attendance endpoints |
| `routes/attendanceRoutes.js` | New assignment/window routes |

## Modified files (full list)

### Database
- `backend/databasemigration/007_add_public_uuids.sql`
- `backend/utils/ensureUuidSchema.js`
- `backend/server.js`

### Backend utils / middleware
- `backend/utils/publicId.js` *(new)*
- `backend/utils/attendanceWindow.js`
- `backend/middleware/resolvePublicId.js` *(new)*
- `backend/middleware/attendanceGuard.js`
- `backend/middleware/sessionAuth.js` *(publicUuid on user)*

### Backend models
- `backend/models/Student.js`
- `backend/models/Faculty.js`
- `backend/models/venue.js`
- `backend/models/Exam.js`
- `backend/models/Timetable.js`
- `backend/models/IneligibleStudent.js`
- `backend/models/SeatingPlan.js`
- `backend/models/User.js`
- `backend/models/AuditLog.js`

### Backend routes / controllers / services
- `backend/routes/attendanceRoutes.js`
- `backend/routes/facultyAttendanceRoutes.js`
- `backend/controllers/attendanceController.js`
- `backend/services/attendanceService.js`
- `backend/routes/studentRoutes.js`
- `backend/routes/facultyRoutes.js`
- `backend/routes/venueRoutes.js`
- `backend/routes/userManagementRoutes.js`
- `backend/routes/timetableRoutes.js`
- `backend/routes/ineligibilityRoutes.js`
- `backend/routes/seatingRoutes.js`
- `backend/routes/examRoutes.js`
- `backend/routes/authRoutes.js`

### Web frontend
- `src/App.jsx`
- `src/pages/FacultyDashboard.jsx`
- `src/pages/FacultyAttendance.jsx`
- `src/pages/AttendanceReports.jsx`
- `src/pages/Faculty.jsx`
- `src/pages/Venue.jsx`
- `src/pages/Student.jsx`
- `src/pages/Timetable.jsx`
- `src/pages/UserManagement.jsx`
- `src/pages/Report.jsx`
- `src/pages/IneligibleStudentsView.jsx`
- `src/pages/Allotment.jsx`

### Mobile app
- `mobile-app/src/services/attendanceService.js`
- `mobile-app/src/screens/FacultyDashboardScreen.js`
- `mobile-app/src/screens/ExamListScreen.js`
- `mobile-app/src/screens/AttendanceScreen.js`

---

## Regression testing checklist

### Database
- [ ] Migration `007` applied; all tables have unique `public_uuid`
- [ ] Existing rows retain data; no orphaned FKs
- [ ] Server starts; `ensureUuidSchema` runs without error

### Attendance (web + mobile)
- [ ] Faculty dashboard lists exams with `uuid` per assignment
- [ ] Open attendance via `/faculty/attendance/{uuid}` — page loads on refresh
- [ ] Mark present/absent; submit with `studentUuid`
- [ ] Window PENDING/OPEN/LOCKED banners still work
- [ ] Admin lock/unlock/configure via `sessionUuid`
- [ ] Attendance report filters by `sessionUuid` / assignment
- [ ] Legacy URL with numeric examId redirects to UUID URL

### CRUD modules
- [ ] Students: list shows `uuid`; delete by UUID works
- [ ] Faculty: create, max-classrooms, availability, delete by UUID
- [ ] Venues: create, update, delete, availability by UUID
- [ ] Timetable: delete and bulk-delete by UUID
- [ ] Ineligibility: delete by UUID
- [ ] Seating plans: save with venue/faculty UUIDs; get/delete plan by UUID
- [ ] User management: CRUD by user UUID
- [ ] Exams: create returns `uuid`

### Auth & security
- [ ] Login returns `user.uuid` (no numeric id)
- [ ] Invalid UUID in URL → 404
- [ ] Unauthorized faculty cannot access another assignment UUID → 403
- [ ] Browser history / network tab shows no numeric entity IDs

### Mobile
- [ ] Login → dashboard → attendance flow with `assignmentUuid`
- [ ] Submit attendance from mobile
- [ ] Reload app on attendance screen (params restored)

### Bookmarks & navigation
- [ ] Bookmark UUID attendance URL remains valid after restart
- [ ] Sidebar and internal links use UUID routes only

---

## Post-migration cleanup (future)

Once all clients are updated, remove:

- Legacy routes: `/api/attendance/exam/:examId/venue/:venueId/*`, `/api/window/:examId/:venueId`
- `allowLegacyNumeric` in middleware
- Numeric ID resolution in request bodies
