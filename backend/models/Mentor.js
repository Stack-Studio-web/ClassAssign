const db = require("../config/db");
const { studentScopeWhere } = require("../utils/ownerFilter");
const { hashPassword } = require("../utils/password");
const { DEFAULT_MENTOR_PASSWORD } = require("../utils/mentorDefaults");

function toMentorRow(row) {
  if (!row) return null;
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    name: row.name ?? row.NAME,
    email: row.email ?? row.EMAIL,
    studentCount: Number(row.student_count ?? row.studentcount ?? row.studentCount ?? 0),
    createdAt: row.created_at ?? row.createdat ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedat ?? row.updatedAt,
  };
}

function toAssignedStudentRow(row) {
  if (!row) return null;
  const regnNo = row.regn_no ?? row.regnno ?? row.regnNo;
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    regnNo,
    studentName: row.student_name ?? row.studentname ?? row.studentName,
    email: row.email ?? row.student_email ?? row.studentemail,
    department: row.department ?? null,
    batchName: row.batch_name ?? row.batchname ?? row.batchName,
    assignedAt: row.assigned_at ?? row.assignedat ?? row.assignedAt,
  };
}

const Mentor = {
  findByEmail: async (email, conn = null) => {
    const q = conn?.query ?? db.query;
    const [rows] = await q(
      `SELECT id, public_uuid, name, email, department, role, created_at, updated_at
       FROM mentors WHERE LOWER(email) = LOWER(?) LIMIT 1`,
      [String(email).trim()]
    );
    return rows[0] ?? null;
  },

  findByEmailForAuth: async (email, conn = null) => {
    const q = conn?.query ?? db.query;
    const [rows] = await q(
      `SELECT id, public_uuid, name, email, password_hash, microsoft_id, department, role,
              must_change_password, created_at, updated_at
       FROM mentors WHERE LOWER(email) = LOWER(?) LIMIT 1`,
      [String(email).trim()]
    );
    return rows[0] ?? null;
  },

  findByMicrosoftId: async (microsoftId) => {
    if (!microsoftId) return null;
    const [rows] = await db.query(
      `SELECT id, public_uuid, name, email, password_hash, microsoft_id, department, role
       FROM mentors WHERE microsoft_id = ? LIMIT 1`,
      [String(microsoftId)]
    );
    return rows[0] ?? null;
  },

  linkMicrosoftId: async (mentorId, microsoftId) => {
    if (!mentorId || !microsoftId) return;
    await db.query(`UPDATE mentors SET microsoft_id = ?, updated_at = NOW() WHERE id = ?`, [
      String(microsoftId),
      mentorId,
    ]);
  },

  setPassword: async (mentorId, passwordHash, { clearMustChange = false } = {}) => {
    if (clearMustChange) {
      await db.query(
        `UPDATE mentors SET password_hash = ?, must_change_password = FALSE, updated_at = NOW() WHERE id = ?`,
        [passwordHash, mentorId]
      );
      return;
    }
    await db.query(`UPDATE mentors SET password_hash = ?, updated_at = NOW() WHERE id = ?`, [
      passwordHash,
      mentorId,
    ]);
  },

  clearMustChangePassword: async (mentorId) => {
    await db.query(
      `UPDATE mentors SET must_change_password = FALSE, updated_at = NOW() WHERE id = ?`,
      [mentorId]
    );
  },

  applyDefaultPassword: async (mentorId, conn = null) => {
    const q = conn?.query ?? db.query;
    const passwordHash = await hashPassword(DEFAULT_MENTOR_PASSWORD);
    await q(
      `UPDATE mentors
       SET password_hash = ?, must_change_password = TRUE, updated_at = NOW()
       WHERE id = ? AND password_hash IS NULL`,
      [passwordHash, mentorId]
    );
  },

  getPortalDashboardStats: async (mentorId) => {
    const [countRows] = await db.query(
      `SELECT COUNT(DISTINCT ms.student_id)::int AS assigned
       FROM mentor_students ms WHERE ms.mentor_id = ?`,
      [mentorId]
    );
    const assignedStudents = Number(countRows[0]?.assigned ?? 0);

    return {
      assignedStudents,
      absentStudents: 0,
      pendingRetestApplications: 0,
      approvedApplications: 0,
      attendanceOverview: { present: assignedStudents, absent: 0 },
      recentNotifications: assignedStudents
        ? [
            {
              message: "Student submitted a retest application",
              timestamp: new Date(Date.now() - 3600000).toISOString(),
            },
            {
              message: "Student uploaded supporting proof",
              timestamp: new Date(Date.now() - 7200000).toISOString(),
            },
            {
              message: "Faculty Incharge approved an application",
              timestamp: new Date(Date.now() - 86400000).toISOString(),
            },
          ]
        : [],
      recentActivity: assignedStudents
        ? [
            {
              message: "Student submitted proof",
              timestamp: new Date(Date.now() - 1800000).toISOString(),
            },
            {
              message: "Mentor approved application",
              timestamp: new Date(Date.now() - 5400000).toISOString(),
            },
            {
              message: "Faculty approved application",
              timestamp: new Date(Date.now() - 9000000).toISOString(),
            },
          ]
        : [],
      upcomingDeadlines: [
        { label: "Retest Submission End Date", date: "—" },
        { label: "Faculty Approval End Date", date: "—" },
        { label: "Retest Examination Date", date: "—" },
      ],
    };
  },

  listPortalStudents: async (mentorId, filters = {}) => {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 25));
    const offset = (page - 1) * limit;
    const search = String(filters.search || "").trim();

    const conditions = ["ms.mentor_id = ?"];
    const params = [mentorId];

    if (search) {
      conditions.push("(st.regn_no ILIKE ? OR st.student_name ILIKE ? OR st.email ILIKE ?)");
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    if (filters.batch) {
      conditions.push("b.name = ?");
      params.push(String(filters.batch));
    }
    if (filters.department) {
      conditions.push("UPPER((regexp_match(st.regn_no, '^[0-9]{2}([A-Z]+)'))[1]) = ?");
      params.push(String(filters.department).toUpperCase());
    }
    if (filters.course) {
      conditions.push("(st.course_name = ? OR st.course_description = ?)");
      params.push(String(filters.course), String(filters.course));
    }

    const whereSql = `WHERE ${conditions.join(" AND ")}`;

    const [countRows] = await db.query(
      `SELECT COUNT(DISTINCT st.id)::int AS total
       FROM mentor_students ms
       JOIN students st ON st.id = ms.student_id
       LEFT JOIN batches b ON b.id = st.batch_id
       ${whereSql}`,
      params
    );
    const totalItems = Number(countRows[0]?.total ?? 0);

    const [rows] = await db.query(
      `SELECT DISTINCT ON (st.id)
         st.public_uuid,
         st.regn_no,
         st.student_name,
         COALESCE(ms.student_email, st.email) AS email,
         st.course_name,
         st.course_description,
         b.name AS batch_name,
         UPPER((regexp_match(st.regn_no, '^[0-9]{2}([A-Z]+)'))[1]) AS department
       FROM mentor_students ms
       JOIN students st ON st.id = ms.student_id
       LEFT JOIN batches b ON b.id = st.batch_id
       ${whereSql}
       ORDER BY st.id, st.regn_no ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      students: (rows || []).map((row) => ({
        uuid: row.public_uuid ?? row.publicuuid,
        regnNo: row.regn_no ?? row.regnno,
        studentName: row.student_name ?? row.studentname,
        email: row.email,
        courseName: row.course_name ?? row.coursename,
        courseDescription: row.course_description ?? row.coursedescription,
        batchName: row.batch_name ?? row.batchname,
        department: row.department,
        attendanceStatus: "—",
        totalAbsences: 0,
        retestApplications: 0,
      })),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
        hasNext: page * limit < totalItems,
        hasPrevious: page > 1,
      },
    };
  },

  getPortalStudentDetail: async (mentorId, studentUuid) => {
    const [rows] = await db.query(
      `SELECT
         st.public_uuid,
         st.regn_no,
         st.student_name,
         COALESCE(ms.student_email, st.email) AS email,
         st.course_name,
         st.course_description,
         b.name AS batch_name,
         UPPER((regexp_match(st.regn_no, '^[0-9]{2}([A-Z]+)'))[1]) AS department
       FROM mentor_students ms
       JOIN students st ON st.id = ms.student_id
       LEFT JOIN batches b ON b.id = st.batch_id
       WHERE ms.mentor_id = ? AND st.public_uuid = ?
       LIMIT 1`,
      [mentorId, studentUuid]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      uuid: row.public_uuid ?? row.publicuuid,
      regnNo: row.regn_no ?? row.regnno,
      studentName: row.student_name ?? row.studentname,
      email: row.email,
      courseName: row.course_name ?? row.coursename,
      courseDescription: row.course_description ?? row.coursedescription,
      batchName: row.batch_name ?? row.batchname,
      department: row.department,
      attendanceSummary: { present: 0, absent: 0, percentage: 0 },
      retestHistory: [],
    };
  },

  getPortalStudentFilterOptions: async (mentorId) => {
    const [batchRows] = await db.query(
      `SELECT DISTINCT b.name AS value
       FROM mentor_students ms
       JOIN students st ON st.id = ms.student_id
       LEFT JOIN batches b ON b.id = st.batch_id
       WHERE ms.mentor_id = ? AND b.name IS NOT NULL
       ORDER BY value`,
      [mentorId]
    );
    const [deptRows] = await db.query(
      `SELECT DISTINCT UPPER((regexp_match(st.regn_no, '^[0-9]{2}([A-Z]+)'))[1]) AS value
       FROM mentor_students ms
       JOIN students st ON st.id = ms.student_id
       WHERE ms.mentor_id = ? AND st.regn_no ~ '^[0-9]{2}[A-Z]+'
       ORDER BY value`,
      [mentorId]
    );
    const [courseRows] = await db.query(
      `SELECT DISTINCT st.course_name AS value
       FROM mentor_students ms
       JOIN students st ON st.id = ms.student_id
       WHERE ms.mentor_id = ? AND st.course_name IS NOT NULL AND st.course_name <> ''
       ORDER BY value`,
      [mentorId]
    );
    return {
      batches: (batchRows || []).map((r) => r.value).filter(Boolean),
      departments: (deptRows || []).map((r) => r.value).filter(Boolean),
      courses: (courseRows || []).map((r) => r.value).filter(Boolean),
    };
  },

  findOrCreateByEmail: async ({ name, email }, conn = null) => {
    const q = conn?.query ?? db.query;
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await Mentor.findByEmailForAuth(normalizedEmail, conn);
    if (existing) {
      if (name && String(name).trim() && existing.name !== String(name).trim()) {
        await q(`UPDATE mentors SET name = ?, updated_at = NOW() WHERE id = ?`, [
          String(name).trim(),
          existing.id,
        ]);
        existing.name = String(name).trim();
      }
      if (!existing.password_hash) {
        await Mentor.applyDefaultPassword(existing.id, conn);
        existing.password_hash = true;
        existing.must_change_password = true;
      }
      return { mentor: existing, created: false };
    }

    const passwordHash = await hashPassword(DEFAULT_MENTOR_PASSWORD);
    const [result] = await q(
      `INSERT INTO mentors (name, email, password_hash, must_change_password)
       VALUES (?, ?, ?, TRUE)
       RETURNING id, public_uuid, name, email, must_change_password, created_at, updated_at`,
      [String(name).trim(), normalizedEmail, passwordHash]
    );
    const row = Array.isArray(result) ? result[0] : result;
    return { mentor: row, created: true };
  },

  getStudentIdsByRegnInBatch: async (regnNo, batchInternalId, opts = {}, conn = null) => {
    const q = conn?.query ?? db.query;
    const { sql: ownerSql, params: ownerParams } = studentScopeWhere(
      opts.role,
      opts.ownerUserId,
      opts.department,
      "st."
    );
    const [rows] = await q(
      `SELECT st.id
       FROM students st
       ${ownerSql || "WHERE 1=1"}
         AND st.batch_id = ?
         AND UPPER(TRIM(st.regn_no)) = UPPER(TRIM(?))`,
      [...ownerParams, batchInternalId, String(regnNo).trim()]
    );
    return (rows || []).map((r) => r.id);
  },

  getAssignedStudentIds: async (studentIds, conn = null) => {
    if (!studentIds.length) return new Set();
    const q = conn?.query ?? db.query;
    const [rows] = await q(
      `SELECT student_id FROM mentor_students WHERE student_id IN (?)`,
      [studentIds]
    );
    return new Set((rows || []).map((r) => r.student_id ?? r.studentid));
  },

  assignStudentsBulk: async (assignments, assignedBy, conn) => {
    if (!assignments.length) return 0;
    const rows = assignments.map((a) => [
      a.mentorId,
      a.studentId,
      a.studentEmail || null,
      assignedBy || null,
    ]);
    await conn.query(
      `INSERT INTO mentor_students (mentor_id, student_id, student_email, assigned_by)
       VALUES ?`,
      [rows]
    );
    return assignments.length;
  },

  updateStudentEmailsBulk: async (updates, conn) => {
    for (const { studentId, email } of updates) {
      if (!email) continue;
      await conn.query(`UPDATE students SET email = ?, updated_at = NOW() WHERE id = ?`, [
        email,
        studentId,
      ]);
    }
  },

  list: async (opts = {}, { page = 1, limit = 25, search = "" } = {}) => {
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 25));
    const offset = (pageNum - 1) * pageSize;
    const term = String(search || "").trim();

    let searchSql = "";
    const searchParams = [];
    if (term) {
      searchSql = " AND (m.name ILIKE ? OR m.email ILIKE ?)";
      const q = `%${term}%`;
      searchParams.push(q, q);
    }

    if (opts.role === "admin") {
      const [countRows] = await db.query(
        `SELECT COUNT(*)::int AS total FROM mentors m WHERE 1=1${searchSql}`,
        searchParams
      );
      const totalItems = Number(countRows[0]?.total ?? 0);
      const [rows] = await db.query(
        `SELECT
           m.public_uuid,
           m.name,
           m.email,
           m.created_at,
           m.updated_at,
           COUNT(ms.id)::int AS student_count
         FROM mentors m
         LEFT JOIN mentor_students ms ON ms.mentor_id = m.id
         WHERE 1=1${searchSql}
         GROUP BY m.id, m.public_uuid, m.name, m.email, m.created_at, m.updated_at
         ORDER BY m.name ASC
         LIMIT ? OFFSET ?`,
        [...searchParams, pageSize, offset]
      );
      const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
      return {
        mentors: (rows || []).map(toMentorRow),
        pagination: {
          page: pageNum,
          limit: pageSize,
          totalItems,
          totalPages,
          hasNext: pageNum < totalPages,
          hasPrevious: pageNum > 1,
        },
      };
    }

    const { sql: ownerSql, params: ownerParams } = studentScopeWhere(
      opts.role,
      opts.ownerUserId,
      opts.department,
      "st."
    );

    const [countRows] = await db.query(
      `SELECT COUNT(DISTINCT m.id)::int AS total
       FROM mentors m
       JOIN mentor_students ms ON ms.mentor_id = m.id
       JOIN students st ON st.id = ms.student_id
       ${ownerSql || "WHERE 1=1"}${searchSql.replace(/m\./g, "m.")}`,
      [...ownerParams, ...searchParams]
    );
    const totalItems = Number(countRows[0]?.total ?? 0);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

    const [rows] = await db.query(
      `SELECT
         m.public_uuid,
         m.name,
         m.email,
         m.created_at,
         m.updated_at,
         COUNT(DISTINCT ms.student_id)::int AS student_count
       FROM mentors m
       JOIN mentor_students ms ON ms.mentor_id = m.id
       JOIN students st ON st.id = ms.student_id
       ${ownerSql || "WHERE 1=1"}${searchSql}
       GROUP BY m.id, m.public_uuid, m.name, m.email, m.created_at, m.updated_at
       ORDER BY m.name ASC
       LIMIT ? OFFSET ?`,
      [...ownerParams, ...searchParams, pageSize, offset]
    );

    return {
      mentors: (rows || []).map(toMentorRow),
      pagination: {
        page: pageNum,
        limit: pageSize,
        totalItems,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrevious: pageNum > 1,
      },
    };
  },

  getByUuid: async (uuid) => {
    const [rows] = await db.query(
      `SELECT id, public_uuid, name, email, created_at, updated_at FROM mentors WHERE public_uuid = ? LIMIT 1`,
      [uuid]
    );
    return rows[0] ?? null;
  },

  listStudentsForMentor: async (mentorInternalId, opts = {}, { page = 1, limit = 50 } = {}) => {
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 50));
    const offset = (pageNum - 1) * pageSize;

    const { sql: ownerSql, params: ownerParams } = studentScopeWhere(
      opts.role,
      opts.ownerUserId,
      opts.department,
      "st."
    );

    const [countRows] = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM mentor_students ms
       JOIN students st ON st.id = ms.student_id
       ${ownerSql || "WHERE 1=1"}
         AND ms.mentor_id = ?`,
      [...ownerParams, mentorInternalId]
    );
    const totalItems = Number(countRows[0]?.total ?? 0);

    const [rows] = await db.query(
      `SELECT
         st.public_uuid,
         st.regn_no,
         st.student_name,
         COALESCE(ms.student_email, st.email) AS email,
         b.name AS batch_name,
         ms.assigned_at,
         UPPER((regexp_match(st.regn_no, '^[0-9]{2}([A-Z]+)'))[1]) AS department
       FROM mentor_students ms
       JOIN students st ON st.id = ms.student_id
       LEFT JOIN batches b ON b.id = st.batch_id
       ${ownerSql || "WHERE 1=1"}
         AND ms.mentor_id = ?
       ORDER BY st.regn_no ASC
       LIMIT ? OFFSET ?`,
      [...ownerParams, mentorInternalId, pageSize, offset]
    );

    return {
      students: (rows || []).map(toAssignedStudentRow),
      pagination: {
        page: pageNum,
        limit: pageSize,
        totalItems,
        totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
        hasNext: pageNum * pageSize < totalItems,
        hasPrevious: pageNum > 1,
      },
    };
  },

  listMappings: async (opts = {}, filters = {}) => {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 25));
    const offset = (page - 1) * limit;
    const search = String(filters.search || "").trim();

    const { sql: ownerSql, params: ownerParams } = studentScopeWhere(
      opts.role,
      opts.ownerUserId,
      opts.department,
      "st."
    );

    const conditions = [];
    const params = [...ownerParams];
    if (filters.batchId) {
      conditions.push("st.batch_id = ?");
      params.push(Number(filters.batchId));
    }
    if (search) {
      conditions.push(
        "(st.regn_no ILIKE ? OR st.student_name ILIKE ? OR m.name ILIKE ? OR m.email ILIKE ?)"
      );
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }

    let whereExtra = conditions.length ? ` AND ${conditions.join(" AND ")}` : "";

    const [countRows] = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM mentor_students ms
       JOIN students st ON st.id = ms.student_id
       JOIN mentors m ON m.id = ms.mentor_id
       ${ownerSql || "WHERE 1=1"}${whereExtra}`,
      params
    );
    const totalItems = Number(countRows[0]?.total ?? 0);

    const [rows] = await db.query(
      `SELECT
         st.public_uuid AS student_uuid,
         st.regn_no,
         st.student_name,
         COALESCE(ms.student_email, st.email) AS student_email,
         b.name AS batch_name,
         UPPER((regexp_match(st.regn_no, '^[0-9]{2}([A-Z]+)'))[1]) AS department,
         m.public_uuid AS mentor_uuid,
         m.name AS mentor_name,
         m.email AS mentor_email,
         ms.assigned_at
       FROM mentor_students ms
       JOIN students st ON st.id = ms.student_id
       JOIN mentors m ON m.id = ms.mentor_id
       LEFT JOIN batches b ON b.id = st.batch_id
       ${ownerSql || "WHERE 1=1"}${whereExtra}
       ORDER BY st.regn_no ASC, st.id ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      mappings: (rows || []).map((row) => ({
        studentUuid: row.student_uuid ?? row.studentuuid,
        regnNo: row.regn_no ?? row.regnno,
        studentName: row.student_name ?? row.studentname,
        studentEmail: row.student_email ?? row.studentemail,
        batchName: row.batch_name ?? row.batchname,
        department: row.department,
        mentorUuid: row.mentor_uuid ?? row.mentoruuid,
        mentorName: row.mentor_name ?? row.mentorname,
        mentorEmail: row.mentor_email ?? row.mentoremail,
        assignedAt: row.assigned_at ?? row.assignedat,
      })),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
        hasNext: page * limit < totalItems,
        hasPrevious: page > 1,
      },
    };
  },

  getMentorForStudentIds: async (studentIds) => {
    if (!studentIds.length) return {};
    const [rows] = await db.query(
      `SELECT
         ms.student_id,
         m.name AS mentor_name,
         m.email AS mentor_email
       FROM mentor_students ms
       JOIN mentors m ON m.id = ms.mentor_id
       WHERE ms.student_id IN (?)`,
      [studentIds]
    );
    const map = {};
    for (const row of rows || []) {
      const sid = row.student_id ?? row.studentid;
      map[sid] = {
        name: row.mentor_name ?? row.mentorname,
        email: row.mentor_email ?? row.mentoremail,
      };
    }
    return map;
  },
};

module.exports = Mentor;
