const db = require("../config/db");
const XLSX = require("xlsx");
const AttendanceWindow = require("../utils/attendanceWindow");
const AttendanceService = require("./attendanceService");

const EXAM_TYPE_VALUES = ["CAT 1", "CAT 2", "Model", "Semester", "Retest"];

function deriveExamType(examName = "", examCode = "", seatingExamType = "") {
  if (seatingExamType) return seatingExamType;
  const hay = `${examName} ${examCode}`.toUpperCase();
  if (hay.includes("CAT 1") || hay.includes("CAT1")) return "CAT 1";
  if (hay.includes("CAT 2") || hay.includes("CAT2")) return "CAT 2";
  if (hay.includes("MODEL")) return "Model";
  if (hay.includes("SEMESTER")) return "Semester";
  if (hay.includes("RETEST")) return "Retest";
  return examName || examCode || "—";
}

function normalizeSessionLabel(raw) {
  if (!raw) return "—";
  const s = String(raw).toUpperCase();
  if (s.includes("FN") || s === "MORNING") return "FN";
  if (s.includes("AN") || s === "AFTERNOON") return "AN";
  return raw;
}

function toRow(row) {
  const present = Number(row.present_count ?? row.presentcount ?? 0);
  const absent = Number(row.absent_count ?? row.absentcount ?? 0);
  const total = present + absent;
  const examType = deriveExamType(
    row.exam_name ?? row.examname,
    row.exam_code ?? row.examcode,
    row.exam_type ?? row.examtype
  );

  return {
    sessionUuid: row.session_uuid ?? row.sessionuuid ?? null,
    assignmentUuid: row.assignment_uuid ?? row.assignmentuuid ?? null,
    examDate: row.exam_date ?? row.examdate,
    session: normalizeSessionLabel(row.exam_session ?? row.examsession),
    examType,
    hall: row.venue_name ?? row.venuename,
    venueUuid: row.venue_uuid ?? row.venueuuid,
    subject: row.exam_name ?? row.examname,
    department: row.faculty_department ?? row.facultydepartment ?? row.department ?? "—",
    batchSection: row.batch_section ?? row.batchsection ?? "—",
    facultyName: row.faculty_name ?? row.facultyname,
    facultyUuid: row.faculty_uuid ?? row.facultyuuid,
    presentCount: present,
    absentCount: absent,
    attendancePercentage: total > 0 ? Math.round((present / total) * 100) : 0,
    status: row.lifecycle_status ?? row.lifecyclestatus ?? "ACTIVE",
    completedAt: row.completed_at ?? row.completedat,
    examEndTime: row.exam_end_time ?? row.examendtime,
    examTime: row.exam_time ?? row.examtime,
    windowStatus: row.attendance_status ?? row.attendancestatus,
    studentCount: Number(row.student_count ?? row.studentcount ?? 0),
  };
}

async function buildRoleScope(user, role) {
  const scope = { sql: "", params: [] };

  if (role === "faculty") {
    const facultyId = await AttendanceService.resolveFacultyIdForUser(user);
    if (!facultyId) {
      scope.sql = " AND 1=0";
      return scope;
    }
    scope.sql = " AND fa.faculty_id = ?";
    scope.params.push(facultyId);
    return scope;
  }

  if (role === "admin") {
    return scope;
  }

  if (role === "faculty_incharge" || role === "hod") {
    const User = require("../models/User");
    const { attendanceAssignmentOwnerScope } = require("../utils/attendanceOwnerScope");
    const ownerIds = await User.getWorkspaceOwnerIds({
      id: user?.id,
      role,
      created_by_hod_id: user?.createdByHodId ?? user?.created_by_hod_id ?? null,
    });
    const owner = attendanceAssignmentOwnerScope({
      role,
      ownerUserId: user?.id,
      ownerIds,
    });
    scope.sql = owner.sql;
    scope.params = owner.params;
    return scope;
  }

  return scope;
}

function buildFilterClauses(filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.date) {
    clauses.push("e.exam_date = ?");
    params.push(filters.date);
  }
  if (filters.session) {
    const s = String(filters.session).toUpperCase();
    if (s === "FN") {
      clauses.push("(UPPER(e.exam_session) LIKE '%FN%' OR UPPER(e.exam_session) LIKE '%MORNING%')");
    } else if (s === "AN") {
      clauses.push("(UPPER(e.exam_session) LIKE '%AN%' OR UPPER(e.exam_session) LIKE '%AFTERNOON%')");
    } else {
      clauses.push("e.exam_session ILIKE ?");
      params.push(`%${filters.session}%`);
    }
  }
  if (filters.examType) {
    clauses.push(`(
      COALESCE(sp_meta.exam_type, '') ILIKE ?
      OR e.exam_name ILIKE ?
      OR e.exam_code ILIKE ?
    )`);
    const pattern = `%${filters.examType}%`;
    params.push(pattern, pattern, pattern);
  }
  if (filters.hall) {
    clauses.push("v.name ILIKE ?");
    params.push(`%${filters.hall}%`);
  }
  if (filters.department) {
    clauses.push("f.department ILIKE ?");
    params.push(`%${filters.department}%`);
  }
  if (filters.faculty) {
    clauses.push("(f.name ILIKE ? OR f.email ILIKE ?)");
    const pattern = `%${filters.faculty}%`;
    params.push(pattern, pattern);
  }
  if (filters.search) {
    const q = `%${filters.search.trim()}%`;
    clauses.push(`(
      v.name ILIKE ? OR f.name ILIKE ? OR f.email ILIKE ?
      OR e.exam_name ILIKE ? OR f.department ILIKE ?
      OR COALESCE(sp_meta.batch_section, '') ILIKE ?
    )`);
    params.push(q, q, q, q, q, q);
  }

  return { clauses, params };
}

const BASE_FROM = `
  FROM faculty_assignments fa
  JOIN faculty f ON f.id = fa.faculty_id
  JOIN exams e ON e.id = fa.exam_id
  JOIN venues v ON v.id = fa.venue_id
  JOIN attendance_sessions sess
    ON sess.exam_id = fa.exam_id AND sess.venue_id = fa.venue_id
  LEFT JOIN LATERAL (
    SELECT sp.exam_type,
           COALESCE(sp.selected_courses, '') AS batch_section
    FROM seating_plan_venues spv
    JOIN seating_plans sp ON sp.id = spv.seating_plan_id
    WHERE spv.venue_id = fa.venue_id
      AND sp.exam_date = e.exam_date
      AND (e.exam_session IS NULL OR sp.exam_session = e.exam_session)
    ORDER BY sp.id DESC
    LIMIT 1
  ) sp_meta ON TRUE
`;

const BASE_SELECT = `
  SELECT
    fa.public_uuid AS assignment_uuid,
    sess.public_uuid AS session_uuid,
    sess.lifecycle_status,
    sess.exam_end_time,
    sess.completed_at,
    sess.attendance_status,
    e.exam_date,
    e.exam_session,
    e.exam_name,
    e.exam_code,
    e.exam_time,
    v.name AS venue_name,
    v.public_uuid AS venue_uuid,
    f.name AS faculty_name,
    f.public_uuid AS faculty_uuid,
    f.department AS faculty_department,
    sp_meta.exam_type,
    sp_meta.batch_section,
    (
      SELECT COUNT(*) FROM seating_arrangements sa
      JOIN seating_plan_venues spv ON spv.id = sa.seating_plan_venue_id
      JOIN seating_plans sp ON sp.id = spv.seating_plan_id
      WHERE spv.venue_id = fa.venue_id AND sp.exam_date = e.exam_date
        AND sa.regn_no IS NOT NULL AND TRIM(sa.regn_no) <> '' AND sa.regn_no <> '-'
    ) AS student_count,
    (
      SELECT COUNT(*) FROM attendance att
      WHERE att.exam_id = fa.exam_id AND att.venue_id = fa.venue_id AND att.status = 'Present'
    ) AS present_count,
    (
      SELECT COUNT(*) FROM attendance att
      WHERE att.exam_id = fa.exam_id AND att.venue_id = fa.venue_id AND att.status = 'Absent'
    ) AS absent_count
`;

async function querySessions({ lifecycleStatus, filters, roleScope, page, limit }) {
  const { clauses, params: filterParams } = buildFilterClauses(filters);
  const whereParts = [`sess.lifecycle_status = ?`, ...clauses];
  const params = [lifecycleStatus, ...filterParams, ...roleScope.params];

  const whereSql = `WHERE ${whereParts.join(" AND ")}${roleScope.sql}`;

  const countSql = `SELECT COUNT(*) AS total ${BASE_FROM} ${whereSql}`;
  const [countRows] = await db.query(countSql, params);
  const total = Number(countRows[0]?.total ?? countRows[0]?.TOTAL ?? 0);

  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const dataSql = `
    ${BASE_SELECT}
    ${BASE_FROM}
    ${whereSql}
    ORDER BY e.exam_date DESC, e.exam_time DESC, v.name ASC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await db.query(dataSql, [...params, safeLimit, offset]);

  return {
    sessions: (rows || []).map(toRow),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

const AttendanceLifecycleService = {
  refreshLifecycle: async () => {
    await AttendanceWindow.refreshDueLifecycleStatuses();
  },

  getActiveSessions: async (user, role, filters = {}) => {
    await AttendanceLifecycleService.refreshLifecycle();
    const roleScope = await buildRoleScope(user, role);
    return querySessions({
      lifecycleStatus: "ACTIVE",
      filters,
      roleScope,
      page: filters.page,
      limit: filters.limit,
    });
  },

  getCompletedSessions: async (user, role, filters = {}) => {
    await AttendanceLifecycleService.refreshLifecycle();
    const roleScope = await buildRoleScope(user, role);
    return querySessions({
      lifecycleStatus: "COMPLETED",
      filters,
      roleScope,
      page: filters.page,
      limit: filters.limit,
    });
  },

  getCounts: async (user, role) => {
    await AttendanceLifecycleService.refreshLifecycle();
    const roleScope = await buildRoleScope(user, role);
    const base = `SELECT sess.lifecycle_status, COUNT(*) AS cnt ${BASE_FROM}
      WHERE sess.lifecycle_status IN ('ACTIVE', 'COMPLETED')${roleScope.sql}
      GROUP BY sess.lifecycle_status`;
    const [rows] = await db.query(base, roleScope.params);
    let active = 0;
    let completed = 0;
    for (const r of rows || []) {
      const status = r.lifecycle_status ?? r.lifecyclestatus;
      const cnt = Number(r.cnt ?? r.CNT ?? 0);
      if (status === "ACTIVE") active = cnt;
      if (status === "COMPLETED") completed = cnt;
    }
    return { active, completed };
  },

  exportCompletedExcel: async (user, role, filters = {}) => {
    await AttendanceLifecycleService.refreshLifecycle();
    const roleScope = await buildRoleScope(user, role);
    const { clauses, params: filterParams } = buildFilterClauses(filters);
    const whereParts = [`sess.lifecycle_status = 'COMPLETED'`, ...clauses];
    const params = [...filterParams, ...roleScope.params];
    const whereSql = `WHERE ${whereParts.join(" AND ")}${roleScope.sql}`;

    const dataSql = `
      ${BASE_SELECT}
      ${BASE_FROM}
      ${whereSql}
      ORDER BY e.exam_date DESC, e.exam_time DESC, v.name ASC
    `;
    const [rows] = await db.query(dataSql, params);
    const sessions = (rows || []).map(toRow);

    const sheetRows = sessions.map((s) => ({
      Date: s.examDate,
      Session: s.session,
      "Exam Type": s.examType,
      Hall: s.hall,
      Subject: s.subject,
      Faculty: s.facultyName,
      Department: s.department,
      Batch: s.batchSection,
      Present: s.presentCount,
      Absent: s.absentCount,
      "Attendance Percentage": `${s.attendancePercentage}%`,
      "Completed Time": s.completedAt
        ? new Date(s.completedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
        : "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, "Completed Attendance");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `Attendance_Completed_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return { buffer, filename };
  },

  getCompletedSessionDetail: async (sessionUuid, user, role) => {
    await AttendanceLifecycleService.refreshLifecycle();
    const session = await AttendanceService.resolveSessionByUuid(sessionUuid);
    if (!session) return null;

    const [sessRows] = await db.query(
      `SELECT lifecycle_status FROM attendance_sessions WHERE id = ?`,
      [session.sessionId]
    );
    const lifecycle = sessRows[0]?.lifecycle_status ?? sessRows[0]?.lifecyclestatus;
    if (lifecycle !== "COMPLETED") {
      const err = new Error("Session is not completed");
      err.statusCode = 400;
      throw err;
    }

    const roleScope = await buildRoleScope(user, role);
    // roleScope for FI/HOD references exams (e) and venues (v) — must JOIN them.
    const [accessRows] = await db.query(
      `SELECT fa.id
       FROM faculty_assignments fa
       JOIN faculty f ON f.id = fa.faculty_id
       JOIN exams e ON e.id = fa.exam_id
       JOIN venues v ON v.id = fa.venue_id
       WHERE fa.exam_id = ?
         AND fa.venue_id = ?
         ${roleScope.sql}
       LIMIT 1`,
      [session.examId, session.venueId, ...roleScope.params]
    );
    if (!accessRows.length) {
      const err = new Error("Access denied");
      err.statusCode = 403;
      throw err;
    }

    let students = [];
    try {
      students = await AttendanceService.getRecordedAttendanceForExamVenue(
        session.examId,
        session.venueId
      );
    } catch (recordErr) {
      console.error(
        "getRecordedAttendanceForExamVenue failed, falling back to seating roster:",
        recordErr?.message || recordErr
      );
      students = await AttendanceService.getStudentsForExamVenue(
        session.examId,
        session.venueId
      );
      // Completed view should only show recorded statuses when possible;
      // seating fallback may include unmarked rows — keep recorded only.
      students = (students || []).filter(
        (s) => s.status === "Present" || s.status === "Absent"
      );
    }

    const present = students.filter((s) => s.status === "Present");
    const absent = students.filter((s) => s.status === "Absent");
    const unmarked = students.filter((s) => !s.status);

    return {
      sessionUuid,
      examId: session.examId,
      venueId: session.venueId,
      readOnly: true,
      students,
      statistics: {
        total: students.length,
        present: present.length,
        absent: absent.length,
        unmarked: unmarked.length,
        percentage:
          students.length > 0
            ? Math.round((present.length / students.length) * 100)
            : 0,
      },
      presentStudents: present,
      absentStudents: absent,
    };
  },

  /**
   * Distinct exam dates / sessions / times available for absentee Excel export.
   * Sourced from existing examination assignments (exams + faculty_assignments),
   * not from already-marked Absent rows — otherwise Day stays empty until absentees exist.
   */
  getAbsenteeExportOptions: async (user, role, filters = {}) => {
    const roleScope = await buildRoleScope(user, role);
    const date = filters.date || null;
    const session = filters.session || null;

    const scheduleFrom = `
      FROM faculty_assignments fa
      JOIN faculty f ON f.id = fa.faculty_id
      JOIN exams e ON e.id = fa.exam_id
      JOIN venues v ON v.id = fa.venue_id
    `;

    const [dateRows] = await db.query(
      `SELECT DISTINCT to_char(e.exam_date, 'YYYY-MM-DD') AS exam_date
       ${scheduleFrom}
       WHERE e.exam_date IS NOT NULL${roleScope.sql}
       ORDER BY 1 DESC`,
      roleScope.params
    );

    const dates = (dateRows || [])
      .map((r) => {
        const d = r.exam_date ?? r.examdate;
        if (!d) return null;
        const s = String(d).trim();
        return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
      })
      .filter(Boolean);

    let sessions = [];
    if (date) {
      const [sessRows] = await db.query(
        `SELECT DISTINCT e.exam_session
         ${scheduleFrom}
         WHERE e.exam_date = ?${roleScope.sql}
         ORDER BY e.exam_session`,
        [date, ...roleScope.params]
      );
      sessions = [
        ...new Set(
          (sessRows || [])
            .map((r) => normalizeSessionLabel(r.exam_session ?? r.examsession))
            .filter((s) => s && s !== "—")
        ),
      ];
    }

    let examTimes = [];
    if (date && session) {
      const sessionClause =
        String(session).toUpperCase() === "FN"
          ? "(UPPER(e.exam_session) LIKE '%FN%' OR UPPER(e.exam_session) LIKE '%MORNING%')"
          : String(session).toUpperCase() === "AN"
            ? "(UPPER(e.exam_session) LIKE '%AN%' OR UPPER(e.exam_session) LIKE '%AFTERNOON%')"
            : "e.exam_session ILIKE ?";
      const sessParams =
        String(session).toUpperCase() === "FN" || String(session).toUpperCase() === "AN"
          ? []
          : [`%${session}%`];

      const [timeRows] = await db.query(
        `SELECT DISTINCT
           COALESCE(
             CASE WHEN fa.start_time IS NOT NULL THEN to_char(fa.start_time, 'HH24:MI') END,
             NULLIF(TRIM(split_part(COALESCE(e.exam_time, ''), '-', 1)), '')
           ) AS start_time,
           COALESCE(
             CASE WHEN fa.end_time IS NOT NULL THEN to_char(fa.end_time, 'HH24:MI') END,
             NULLIF(TRIM(split_part(COALESCE(e.exam_time, ''), '-', 2)), '')
           ) AS end_time,
           e.exam_time
         ${scheduleFrom}
         WHERE e.exam_date = ?
           AND ${sessionClause}${roleScope.sql}
         ORDER BY 1, 2`,
        [date, ...sessParams, ...roleScope.params]
      );

      const seen = new Set();
      for (const r of timeRows || []) {
        const start = String(r.start_time ?? r.starttime ?? "")
          .trim()
          .slice(0, 5);
        const end = String(r.end_time ?? r.endtime ?? "")
          .trim()
          .slice(0, 5);
        const label =
          start && end
            ? `${start} - ${end}`
            : String(r.exam_time ?? r.examtime ?? "").trim();
        if (!label || seen.has(label)) continue;
        seen.add(label);
        examTimes.push({
          label,
          startTime: start || null,
          endTime: end || null,
          examTime: r.exam_time ?? r.examtime ?? label,
        });
      }
    }

    return { dates, sessions, examTimes };
  },

  /**
   * Excel of ABSENT students only across ALL classrooms for day+session+exam time.
   */
  exportAbsenteesExcel: async (user, role, filters = {}) => {
    const date = filters.date;
    const session = filters.session;
    const startTime = filters.startTime ? String(filters.startTime).slice(0, 5) : null;
    const endTime = filters.endTime ? String(filters.endTime).slice(0, 5) : null;
    const examTime = filters.examTime || null;

    if (!date || !session) {
      const err = new Error("date and session are required");
      err.statusCode = 400;
      throw err;
    }
    if (!startTime && !endTime && !examTime) {
      const err = new Error("exam time is required");
      err.statusCode = 400;
      throw err;
    }

    const roleScope = await buildRoleScope(user, role);
    const sessionClause =
      String(session).toUpperCase() === "FN"
        ? "(UPPER(e.exam_session) LIKE '%FN%' OR UPPER(e.exam_session) LIKE '%MORNING%')"
        : String(session).toUpperCase() === "AN"
          ? "(UPPER(e.exam_session) LIKE '%AN%' OR UPPER(e.exam_session) LIKE '%AFTERNOON%')"
          : "e.exam_session ILIKE ?";
    const sessParams =
      String(session).toUpperCase() === "FN" || String(session).toUpperCase() === "AN"
        ? []
        : [`%${session}%`];

    const timeClauses = [];
    const timeParams = [];
    if (startTime && endTime) {
      timeClauses.push(`(
        (fa.start_time IS NOT NULL AND fa.end_time IS NOT NULL
          AND to_char(fa.start_time, 'HH24:MI') = ?
          AND to_char(fa.end_time, 'HH24:MI') = ?)
        OR (fa.start_time IS NULL AND e.exam_time ILIKE ?)
      )`);
      timeParams.push(startTime, endTime, `%${startTime}%`);
    } else if (examTime) {
      timeClauses.push("e.exam_time ILIKE ?");
      timeParams.push(`%${String(examTime).trim()}%`);
    }

    const { resolveVenueStudentsWithCourses } = require("../utils/venueAttendanceCourses");

    const [rows] = await db.query(
      `SELECT
         att.id AS attendance_id,
         att.status,
         st.regn_no,
         st.student_name,
         st.course_description AS student_course,
         e.exam_date,
         e.exam_session,
         e.exam_time,
         e.id AS exam_id,
         v.id AS venue_id,
         v.name AS venue_name,
         fa.start_time,
         fa.end_time,
         spv.id AS spv_id,
         spv.seating_layout_json,
         spv.seating_plan_id,
         sa.seat_row,
         sa.seat_col,
         sa.seat_index
       FROM attendance att
       JOIN students st ON st.id = att.student_id
       JOIN exams e ON e.id = att.exam_id
       JOIN venues v ON v.id = att.venue_id
       JOIN faculty_assignments fa
         ON fa.exam_id = att.exam_id AND fa.venue_id = att.venue_id
       JOIN faculty f ON f.id = fa.faculty_id
       LEFT JOIN seating_plans sp
         ON sp.exam_date = e.exam_date
        AND (e.exam_session IS NULL OR sp.exam_session = e.exam_session)
       LEFT JOIN seating_plan_venues spv
         ON spv.seating_plan_id = sp.id AND spv.venue_id = v.id
       LEFT JOIN seating_arrangements sa
         ON sa.seating_plan_venue_id = spv.id
        AND sa.regn_no = st.regn_no
       WHERE att.status = 'Absent'
         AND e.exam_date = ?
         AND ${sessionClause}
         ${timeClauses.length ? `AND ${timeClauses.join(" AND ")}` : ""}
         ${roleScope.sql}
       ORDER BY v.name ASC, st.regn_no ASC, att.id ASC`,
      [date, ...sessParams, ...timeParams, ...roleScope.params]
    );

    // Deduplicate by student+venue (joins can multiply via seating plans)
    const seen = new Set();
    const absentees = [];
    const courseCache = new Map();

    for (const r of rows || []) {
      const regn = String(r.regn_no ?? r.regnno ?? "").trim();
      const venueName = r.venue_name ?? r.venuename ?? "";
      const key = `${regn}::${r.venue_id ?? r.venueid}`;
      if (!regn || seen.has(key)) continue;
      seen.add(key);

      let courseCode = "";
      const spvId = r.spv_id ?? r.spvid;
      const cacheKey = String(spvId || "");
      if (spvId && !courseCache.has(cacheKey)) {
        const [planStudents] = await db.query(
          `SELECT regn_no, student_name, course_description
           FROM seating_plan_students WHERE seating_plan_id = ? ORDER BY id ASC`,
          [r.seating_plan_id ?? r.seatingplanid]
        );
        const [arr] = await db.query(
          `SELECT regn_no, seat_row, seat_col, seat_index
           FROM seating_arrangements WHERE seating_plan_venue_id = ?`,
          [spvId]
        );
        const students = resolveVenueStudentsWithCourses({
          layoutJson: r.seating_layout_json ?? r.seatinglayoutjson,
          arrangementRows: arr || [],
          planStudentRows: planStudents || [],
        });
        const map = new Map(students.map((s) => [s.regNo, s.courseCode]));
        courseCache.set(cacheKey, map);
      }
      if (spvId && courseCache.has(cacheKey)) {
        courseCode = courseCache.get(cacheKey).get(regn) || "";
      }
      if (!courseCode) {
        courseCode = String(r.student_course ?? r.studentcourse ?? "").trim();
      }

      const start =
        String(r.start_time ?? r.starttime ?? "")
          .trim()
          .slice(0, 5) ||
        String(r.exam_time ?? r.examtime ?? "")
          .split("-")[0]
          ?.trim()
          .slice(0, 5) ||
        "";
      const end =
        String(r.end_time ?? r.endtime ?? "")
          .trim()
          .slice(0, 5) ||
        String(r.exam_time ?? r.examtime ?? "")
          .split("-")[1]
          ?.trim()
          .slice(0, 5) ||
        "";

      absentees.push({
        regnNo: regn,
        studentName: r.student_name ?? r.studentname ?? "",
        courseCode,
        examDate: r.exam_date ?? r.examdate,
        session: normalizeSessionLabel(r.exam_session ?? r.examsession),
        examTime: start && end ? `${start} - ${end}` : r.exam_time ?? r.examtime ?? "",
        classroom: venueName,
        seat:
          r.seat_row != null
            ? `R${Number(r.seat_row) + 1}-C${Number(r.seat_col ?? 0) + 1}`
            : "",
        status: "Absent",
      });
    }

    const sheetRows = absentees.map((s, idx) => ({
      "S.No": idx + 1,
      "Register Number": s.regnNo,
      "Student Name": s.studentName,
      "Course Code": s.courseCode,
      "Exam Date": s.examDate,
      Session: s.session,
      "Exam Time": s.examTime,
      Classroom: s.classroom,
      Seat: s.seat,
      "Attendance Status": s.status,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(
      sheetRows.length
        ? sheetRows
        : [
            {
              "S.No": "",
              "Register Number": "",
              "Student Name": "",
              "Course Code": "",
              "Exam Date": "",
              Session: "",
              "Exam Time": "",
              Classroom: "",
              Seat: "",
              "Attendance Status": "",
            },
          ]
    );
    XLSX.utils.book_append_sheet(wb, ws, "Absentees");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const safeTime = String(startTime || examTime || "time")
      .replace(/[^0-9A-Za-z]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const safeSession = String(session).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const filename = `attendance_absentees_${date}_${safeSession}_${safeTime || "exam"}.xlsx`;
    return { buffer, filename, count: absentees.length };
  },

  EXAM_TYPE_VALUES,
};

module.exports = AttendanceLifecycleService;
