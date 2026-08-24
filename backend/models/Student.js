// Class/backend/models/Student.js - UPDATED WITH DEPARTMENT FILTERING & OWNER FILTER
const db = require("../config/db");
const { andClause, whereClause, insertField } = require("../utils/ownerFilter");

// PostgreSQL returns unquoted column names in lowercase; map to camelCase for API
function toStudentRow(row) {
  if (!row || typeof row !== "object") return row;
  const ownerId = row.owner_user_id ?? row.owneruserid;
  const creatorUuid = row.creator_uuid ?? row.creatoruuid;
  const creatorName =
    row.creator_name ??
    row.creatorname ??
    row.creator_display ??
    row.creatordisplay ??
    null;

  const regnNo = row.regnno ?? row.regnNo;
  const out = {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    regnNo,
    studentName: row.studentname ?? row.studentName,
    courseName: row.coursename ?? row.courseName,
    courseDescription: row.coursedescription ?? row.courseDescription,
    email: row.email,
    batchName: row.batchname ?? row.batchName ?? null,
    department: deriveDepartmentFromRegnNo(regnNo),
  };

  if (ownerId || creatorUuid || creatorName) {
    out.createdBy = {
      id: creatorUuid ?? String(ownerId),
      name: creatorName || "Faculty Incharge",
    };
  }

  const mentorName = row.mentor_name ?? row.mentorname ?? row.mentorName;
  const mentorEmail = row.mentor_email ?? row.mentoremail ?? row.mentorEmail;
  if (mentorName || mentorEmail) {
    out.mentor = {
      name: mentorName || null,
      email: mentorEmail || null,
    };
  }

  return out;
}

const STUDENT_FROM = `
  FROM students st
  LEFT JOIN batches b ON b.id = st.batch_id
  LEFT JOIN users u ON u.id = st.owner_user_id
  LEFT JOIN mentor_students ms ON ms.student_id = st.id
  LEFT JOIN mentors m ON m.id = ms.mentor_id
`;

const SORT_COLUMNS = {
  regnNo: "st.regn_no",
  studentName: "st.student_name",
  courseName: "st.course_name",
  courseDescription: "st.course_description",
  email: "st.email",
};

function deriveDepartmentFromRegnNo(regnNo) {
  if (!regnNo) return null;
  const match = String(regnNo).trim().toUpperCase().match(/^[0-9]{2}([A-Z]+)/);
  return match ? match[1] : null;
}

function buildStudentListQuery(filters = {}, opts = {}) {
  const { studentScopeWhere } = require("../utils/ownerFilter");
  const { sql: ownerSql, params: ownerParams } = studentScopeWhere(
    opts.role,
    opts.ownerUserId,
    opts.department,
    "st."
  );

  const conditions = [];
  const params = [...ownerParams];

  const search = String(filters.search || "").trim();
  if (search) {
    conditions.push("(st.student_name ILIKE ? OR st.regn_no ILIKE ? OR st.email ILIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  const yearVal = String(filters.year || filters.batch || "").trim();
  if (yearVal) {
    conditions.push("st.regn_no LIKE ?");
    params.push(`${yearVal}%`);
  }

  const department = String(filters.department || "").trim();
  if (department) {
    conditions.push("UPPER(st.regn_no) LIKE ?");
    params.push(`%${department.toUpperCase()}%`);
  }

  const section = String(filters.section || "").trim();
  if (section) {
    conditions.push("st.regn_no ILIKE ?");
    params.push(`%${section}%`);
  }

  const courseName = String(filters.courseName || "").trim();
  if (courseName) {
    conditions.push("st.course_name = ?");
    params.push(courseName);
  }

  const courseDescription = String(filters.courseDescription || "").trim();
  if (courseDescription) {
    conditions.push("st.course_description = ?");
    params.push(courseDescription);
  }

  const batchId = filters.batchId;
  if (batchId != null && batchId !== "") {
    conditions.push("st.batch_id = ?");
    params.push(Number(batchId));
  }

  const createdByUserId = filters.createdByUserId;
  if (createdByUserId != null && createdByUserId !== "") {
    conditions.push("st.owner_user_id = ?");
    params.push(Number(createdByUserId));
  }

  let whereSql = ownerSql || " WHERE 1=1";
  if (conditions.length > 0) {
    whereSql += ` AND ${conditions.join(" AND ")}`;
  }

  return { whereSql, params, fromClause: STUDENT_FROM };
}

function resolveSort(sortBy, sortOrder) {
  const column = SORT_COLUMNS[sortBy] || SORT_COLUMNS.regnNo;
  const direction = String(sortOrder || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  return `${column} ${direction}, st.id ASC`;
}

const Student = {
  /* ============================================================
      INSERT (one row per import row; regn_no may repeat across courses/rows)
  ============================================================ */
  insertOne: async (s, opts = {}) => {
    const { insertField } = require("../utils/ownerFilter");
    const { col, val } = insertField(opts.role, opts.ownerUserId);
    const cols = [
      "regn_no",
      "student_name",
      "course_description",
      "course_name",
      "email",
      "batch_id",
    ];
    const vals = [
      s.regnNo,
      s.studentName,
      s.courseDescription,
      s.courseName,
      s.email?.trim().toLowerCase() || null,
      s.batchId,
    ];

    if (opts.department) {
      cols.push("department");
      vals.push(opts.department);
    }
    if (opts.academicYearId) {
      cols.push("academic_year_id");
      vals.push(opts.academicYearId);
    }
    if (opts.semesterId) {
      cols.push("semester_id");
      vals.push(opts.semesterId);
    }
    if (opts.ownerUserId) {
      cols.push("created_by");
      vals.push(opts.ownerUserId);
    }
    if (val != null) {
      cols.push("owner_user_id");
      vals.push(val);
    }

    const placeholders = cols.map(() => "?").join(", ");
    const sql = `
      INSERT INTO students (${cols.join(", ")})
      VALUES (${placeholders})
      RETURNING id;
    `;
    const [result] = await db.query(sql, vals);
    return result?.insertId ?? result?.rows?.[0]?.id ?? result?.[0]?.id;
  },
  /* ===============================
      GET ALL
  =============================== */
  getAll: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(`
      SELECT
        id,
        public_uuid,
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students${ownerSql || " WHERE 1=1"}
      ORDER BY regn_no, id
    `, ownerParams);
    return (rows || []).map(toStudentRow);
  },

  /* ===============================
      COUNT
  =============================== */
  count: async (opts = {}) => {
    const { studentScopeWhere } = require("../utils/ownerFilter");
    const { sql: ownerSql, params: ownerParams } = studentScopeWhere(
      opts.role,
      opts.ownerUserId,
      opts.department,
      "st."
    );
    const [rows] = await db.query(
      `SELECT COUNT(*) AS total FROM students st${ownerSql || " WHERE 1=1"}`,
      ownerParams
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return Number(row?.total ?? row?.TOTAL ?? 0);
  },

  listPaginated: async (filters = {}, opts = {}) => {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 25));
    const offset = (page - 1) * limit;

    const { whereSql, params, fromClause } = buildStudentListQuery(filters, opts);
    const orderBy = resolveSort(filters.sortBy, filters.sortOrder);

    const [countRows] = await db.query(
      `SELECT COUNT(*)::int AS total FROM students st${whereSql}`,
      params
    );
    const totalItems = Number(countRows[0]?.total ?? countRows[0]?.TOTAL ?? 0);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);

    const [rows] = await db.query(
      `SELECT
        st.public_uuid,
        st.regn_no AS regnNo,
        st.student_name AS studentName,
        st.course_name AS courseName,
        st.course_description AS courseDescription,
        st.email,
        st.owner_user_id,
        b.name AS batchName,
        u.public_uuid AS creator_uuid,
        COALESCE(NULLIF(TRIM(u.username), ''), u.email, 'Faculty Incharge') AS creator_name,
        m.name AS mentor_name,
        m.email AS mentor_email
      ${fromClause}${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      students: (rows || []).map(toStudentRow),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  },

  getFilterOptions: async (opts = {}, filters = {}) => {
    const { whereSql, params } = buildStudentListQuery(filters, opts);

    const [yearRows] = await db.query(
      `SELECT DISTINCT LEFT(st.regn_no, 2) AS value
       FROM students st${whereSql}
         AND st.regn_no ~ '^[0-9]{2}'
       ORDER BY value DESC`,
      params
    );

    const [deptRows] = await db.query(
      `SELECT DISTINCT UPPER((regexp_match(st.regn_no, '^[0-9]{2}([A-Z]+)'))[1]) AS value
       FROM students st${whereSql}
         AND st.regn_no ~ '^[0-9]{2}[A-Z]+'
       ORDER BY value`,
      params
    );

    const [courseNameRows] = await db.query(
      `SELECT DISTINCT st.course_name AS value
       FROM students st${whereSql}
         AND st.course_name IS NOT NULL AND st.course_name <> ''
       ORDER BY value`,
      params
    );

    const [courseDescRows] = await db.query(
      `SELECT DISTINCT st.course_description AS value
       FROM students st${whereSql}
         AND st.course_description IS NOT NULL AND st.course_description <> ''
       ORDER BY value`,
      params
    );

    const [facultyRows] =
      opts.role === "admin" || opts.role === "hod"
        ? await db.query(
            `SELECT DISTINCT
               u.id AS user_id,
               u.public_uuid AS uuid,
               COALESCE(NULLIF(TRIM(u.username), ''), u.email, 'Faculty Incharge') AS name
             FROM students st
             JOIN users u ON u.id = st.owner_user_id
             ${whereSql}
             ORDER BY name`,
            params
          )
        : [[]];

    const pick = (rows) =>
      (rows || [])
        .map((r) => r.value ?? r.VALUE)
        .filter(Boolean);

    return {
      years: pick(yearRows),
      batches: pick(yearRows),
      departments: pick(deptRows),
      courseNames: pick(courseNameRows),
      courseDescriptions: pick(courseDescRows),
      facultyOwners: (facultyRows || []).map((r) => ({
        id: r.uuid ?? r.UUID ?? String(r.user_id ?? r.userid),
        userId: r.user_id ?? r.userid,
        name: r.name ?? r.NAME,
      })),
    };
  },

  getCourseStats: async (opts = {}, pagination = {}, filters = {}) => {
    const page = Math.max(1, Number(pagination.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(pagination.limit) || 12));
    const offset = (page - 1) * limit;
    const { whereSql, params } = buildStudentListQuery(filters, opts);

    const [countRows] = await db.query(
      `SELECT COUNT(*)::int AS total FROM (
        SELECT 1 FROM students st${whereSql}
        GROUP BY st.course_description, st.course_name
      ) grouped_courses`,
      params
    );
    const totalItems = Number(countRows[0]?.total ?? countRows[0]?.TOTAL ?? 0);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);

    const [rows] = await db.query(
      `SELECT
        st.course_description AS courseCode,
        st.course_name AS courseName,
        COUNT(*)::int AS count
      FROM students st${whereSql}
      GROUP BY st.course_description, st.course_name
      ORDER BY count DESC, st.course_description ASC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      courses: (rows || []).map((r) => ({
        courseCode: r.coursecode ?? r.courseCode ?? "",
        courseName: r.coursename ?? r.courseName ?? "",
        count: Number(r.count ?? 0),
      })),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  },

  /* ===============================
      DELETE ONE
  =============================== */
  deleteById: async (id, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [result] = await db.query(
      `DELETE FROM students WHERE id = ?${ownerSql}`,
      [id, ...ownerParams]
    );
    return result.affectedRows > 0;
  },

  /* ===============================
      GET UNIQUE COURSES
  =============================== */
  /**
   * Distinct student batch codes for a department, e.g. BAD → 23BAD, 24BAD, 25BAD.
   * Derived from register numbers in the students table (not hardcoded).
   */
  listBatchesByDepartment: async (department, opts = {}) => {
    const dept = String(department || "").toUpperCase().trim();
    if (!dept) return [];

    const { sql: ownerSql, params: ownerParams } = andClause(
      opts.role,
      opts.ownerUserId,
      "st."
    );

    const escapedDept = dept.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const [rows] = await db.query(
      `
      SELECT DISTINCT UPPER(SUBSTRING(UPPER(TRIM(st.regn_no)) FROM '^[0-9]{2}[A-Z]+')) AS name
      FROM students st
      WHERE UPPER(TRIM(st.regn_no)) ~ ?
        ${ownerSql}
      ORDER BY name DESC
      `,
      [`^[0-9]{2}${escapedDept}`, ...ownerParams]
    );

    return (rows || [])
      .map((r) => {
        const name = String(r.name ?? "").toUpperCase();
        return { name, uuid: name, batchId: null };
      })
      .filter((b) => b.name);
  },

  getCourses: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(`
      SELECT DISTINCT 
        course_description AS courseDescription,
        course_name AS courseName
      FROM students${ownerSql || " WHERE 1=1"}
      ORDER BY course_description
    `, ownerParams);
    return (rows || []).map(r => ({
      courseDescription: r.coursedescription ?? r.courseDescription,
      courseName: r.coursename ?? r.courseName
    }));
  },

  /* ===============================
      GET BY COURSE
  =============================== */
  getByCourse: async (courseDescription, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(`
      SELECT
        id,
        public_uuid,
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students
      WHERE course_description = ?${ownerSql}
      ORDER BY regn_no, id
    `, [courseDescription, ...ownerParams]);

    return (rows || []).map(toStudentRow);
  },

  /* ===============================
      ✅ NEW: GET BY DEPARTMENT
      Matches students whose regno contains the department code
      Example: department = "BCS" matches "23BCS090", "24BCS045"
  =============================== */
  getByDepartment: async (department, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(`
      SELECT
        id,
        public_uuid,
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students
      WHERE regn_no LIKE ?${ownerSql}
      ORDER BY regn_no, id
    `, [`%${department}%`, ...ownerParams]);

    return (rows || []).map(toStudentRow);
  },

  /* ===============================
      ✅ NEW: GET BY COURSE CODE AND DEPARTMENT
      Gets students for a specific course that match department
  =============================== */
  getByCourseAndDepartment: async (courseCode, department, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(`
      SELECT
        id,
        public_uuid,
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students
      WHERE course_description = ?
        AND regn_no LIKE ?${ownerSql}
      ORDER BY regn_no, id
    `, [courseCode, `%${department}%`, ...ownerParams]);

    return (rows || []).map(toStudentRow);
  },

  /* ===============================
      DELETE MANY (UNDO)
  =============================== */
  deleteByIds: async (ids, opts = {}) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    await db.query(
      `DELETE FROM students WHERE id IN (?)${ownerSql}`,
      [ids, ...ownerParams]
    );
  },

  /* ===============================
      DELETE ALL (returns deleted count)
  =============================== */
  deleteAll: async (opts = {}, batchId = null) => {
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId);
    let sql = `DELETE FROM students${ownerSql || " WHERE 1=1"}`;
    const params = [...ownerParams];
    if (batchId != null) {
      sql += ownerSql ? " AND batch_id = ?" : " WHERE batch_id = ?";
      params.push(Number(batchId));
    }
    const [result] = await db.query(`${sql} RETURNING id`, params);
    return (result && result.affectedRows) ? result.affectedRows : 0;
  },

  countInBatch: async (batchId, opts = {}) => {
    const { whereSql, params } = buildStudentListQuery({ batchId }, opts);
    const [rows] = await db.query(
      `SELECT COUNT(*)::int AS total FROM students st${whereSql}`,
      params
    );
    return Number(rows[0]?.total ?? 0);
  },

  getBatchDuplicateKeys: async (batchId, opts = {}) => {
    const { studentScopeAnd } = require("../utils/ownerFilter");
    const { sql: scopeSql, params: scopeParams } = studentScopeAnd(
      opts.role,
      opts.ownerUserId,
      opts.department
    );
    const [rows] = await db.query(
      `SELECT LOWER(regn_no) AS regn, LOWER(course_description) AS course
       FROM students WHERE batch_id = ?${scopeSql}`,
      [batchId, ...scopeParams]
    );
    const set = new Set();
    for (const row of rows || []) {
      set.add(`${row.regn}::${row.course}`);
    }
    return set;
  },

  getIdsInBatch: async (batchId, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(
      `SELECT id FROM students WHERE batch_id = ?${ownerSql}`,
      [batchId, ...ownerParams]
    );
    return (rows || []).map((r) => r.id);
  },

  /* ===============================
      DELETE BY COURSE CODE (returns deleted count)
  =============================== */
  deleteByCourseCode: async (courseCode, opts = {}, batchId = null) => {
    if (!courseCode || !String(courseCode).trim()) return 0;
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    let sql = `DELETE FROM students WHERE course_description = ?${ownerSql}`;
    const params = [String(courseCode).trim(), ...ownerParams];
    if (batchId != null) {
      sql += " AND batch_id = ?";
      params.push(Number(batchId));
    }
    const [result] = await db.query(`${sql} RETURNING id`, params);
    return (result && result.affectedRows) ? result.affectedRows : 0;
  }
};

module.exports = Student;