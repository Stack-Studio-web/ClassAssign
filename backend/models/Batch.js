const db = require("../config/db");
const {
  batchScopeAnd,
  studentCountInBatchExpr,
} = require("../utils/ownerFilter");

const DUPLICATE_BATCH_MESSAGE =
  "A batch with this name already exists in your Academic Context for the selected semester.";

function normalizeStatus(value) {
  const raw = String(value || "ACTIVE").toUpperCase();
  return raw === "COMPLETED" ? "COMPLETED" : "ACTIVE";
}

function mapBatch(row) {
  if (!row) return null;
  const ownerId = row.owner_user_id ?? row.owneruserid;
  const creatorUuid = row.creator_uuid ?? row.creatoruuid;
  const creatorName = row.creator_name ?? row.creatorname ?? null;
  const status = normalizeStatus(row.status ?? row.STATUS);

  const out = {
    uuid: row.public_uuid ?? row.publicuuid,
    semesterUuid: row.semester_uuid ?? row.semesteruuid,
    semesterLabel: row.semester_label ?? row.semesterlabel,
    semesterType: row.semester_type ?? row.semestertype,
    academicYearUuid: row.academic_year_uuid ?? row.academicyearuuid,
    academicYearLabel: row.academic_year_label ?? row.academicyearlabel,
    name: row.name,
    code: row.code ?? null,
    description: row.description ?? null,
    status,
    studentCount: Number(row.student_count ?? row.studentcount ?? 0),
    createdAt: row.created_at ?? row.createdat,
  };

  if (ownerId || creatorUuid || creatorName) {
    out.createdBy = {
      id: creatorUuid ?? String(ownerId),
      name: creatorName || "Faculty Incharge",
    };
  }

  return out;
}

function duplicateBatchError() {
  const err = new Error(DUPLICATE_BATCH_MESSAGE);
  err.statusCode = 409;
  err.code = "DUPLICATE_BATCH";
  return err;
}

const Batch = {
  /**
   * Duplicate check within HOD/Academic Context scope (shared among member FIs),
   * not per individual faculty_incharge_id.
   */
  findByScopeName: async (semesterId, name, opts = {}, excludeId = null) => {
    if (!semesterId || !String(name || "").trim()) return null;
    const batchName = String(name).trim();
    const params = [semesterId, batchName];
    let sql = `SELECT id FROM batches
               WHERE semester_id = ?
                 AND LOWER(TRIM(name)) = LOWER(TRIM(?))`;

    if (opts.academicContextId) {
      sql += " AND academic_context_id = ?";
      params.push(Number(opts.academicContextId));
    } else if (opts.ownerIds && opts.ownerIds.length) {
      const ids = [...new Set(opts.ownerIds.map(Number).filter((id) => id > 0))];
      if (!ids.length) return null;
      sql += ` AND owner_user_id IN (${ids.map(() => "?").join(", ")})`;
      params.push(...ids);
    } else if (opts.ownerUserId) {
      sql += " AND owner_user_id = ?";
      params.push(Number(opts.ownerUserId));
    } else {
      return null;
    }

    if (excludeId != null) {
      sql += " AND id <> ?";
      params.push(Number(excludeId));
    }
    sql += " LIMIT 1";
    const [rows] = await db.query(sql, params);
    return rows[0] ?? null;
  },

  /** @deprecated Prefer findByScopeName — kept for callers expecting per-owner check */
  findByOwnerName: async (semesterId, ownerUserId, name, excludeId = null) => {
    return Batch.findByScopeName(
      semesterId,
      name,
      { ownerUserId },
      excludeId
    );
  },

  listBySemesterId: async (semesterId, opts = {}) => {
    const { sql: scopeSql, params: scopeParams } = batchScopeAnd(
      opts.role,
      opts.ownerUserId,
      opts.department,
      "b.",
      opts.ownerIds
    );
    const countExpr = studentCountInBatchExpr(
      opts.role,
      opts.ownerUserId,
      opts.department,
      "b.id",
      opts.ownerIds
    );

    const [rows] = await db.query(
      `SELECT b.id, b.public_uuid, b.name, b.code, b.description, b.status, b.created_at,
              b.owner_user_id, b.department,
              s.public_uuid AS semester_uuid, s.label AS semester_label, s.semester_type,
              ay.public_uuid AS academic_year_uuid, ay.label AS academic_year_label,
              u.public_uuid AS creator_uuid,
              COALESCE(NULLIF(TRIM(u.username), ''), u.email, 'Faculty Incharge') AS creator_name,
              ${countExpr.sql} AS student_count
       FROM batches b
       JOIN semesters s ON s.id = b.semester_id
       JOIN academic_years ay ON ay.id = s.academic_year_id
       LEFT JOIN users u ON u.id = b.owner_user_id
       WHERE b.semester_id = ?${scopeSql}
       ORDER BY CASE WHEN b.status = 'COMPLETED' THEN 1 ELSE 0 END, b.name ASC`,
      [...countExpr.params, semesterId, ...scopeParams]
    );
    return (rows || []).map(mapBatch);
  },

  /**
   * List batches by department (for UI dropdown dependency).
   * This does not require a semester context; it uses the batches table directly.
   */
  /**
   * Find a batch by display name within Academic Context / owner scope.
   * Searches formal batches table first (returns batch_id); does not create.
   */
  findByNameInScope: async (name, opts = {}) => {
    const batchName = String(name || "").trim().toUpperCase();
    if (!batchName) return null;

    const { sql: scopeSql, params: scopeParams } = batchScopeAnd(
      opts.role,
      opts.ownerUserId,
      opts.department,
      "b.",
      opts.ownerIds
    );

    const params = [batchName];
    let sql = `SELECT b.id, b.public_uuid, b.name, b.department, b.owner_user_id, b.academic_context_id
               FROM batches b
               WHERE UPPER(TRIM(b.name)) = ?`;

    // Prefer context match when stamped; still allow legacy rows with null context
    if (opts.academicContextId) {
      sql += " AND (b.academic_context_id = ? OR b.academic_context_id IS NULL)";
      params.push(Number(opts.academicContextId));
    }

    sql += `${scopeSql} ORDER BY CASE WHEN b.academic_context_id IS NULL THEN 1 ELSE 0 END, b.id DESC LIMIT 1`;
    params.push(...scopeParams);

    const [rows] = await db.query(sql, params);
    const row = rows?.[0];
    if (!row) return null;
    return {
      id: row.id,
      uuid: row.public_uuid ?? row.publicuuid,
      name: String(row.name || "").toUpperCase(),
      department: row.department ?? null,
    };
  },

  listByDepartment: async (department, opts = {}) => {
    const dept = String(department || "").toUpperCase().trim();
    if (!dept) return [];

    if (opts.role === "hod") {
      if (!opts.department || String(opts.department).toUpperCase().trim() !== dept) return [];
    }

    const Student = require("./Student");
    return Student.listBatchesByDepartment(department, opts);
  },

  create: async ({ semesterId, name, code, description }, opts = {}) => {
    const batchName = String(name || "").trim();
    if (!batchName) throw new Error("Batch name is required");

    const ownerUserId = opts.ownerUserId ?? opts.userId ?? null;
    if (!ownerUserId || opts.role === "hod") {
      throw new Error("Batch owner is required.");
    }

    const existing = await Batch.findByScopeName(semesterId, batchName, opts);
    if (existing) throw duplicateBatchError();

    const cols = ["semester_id", "name", "code", "description", "status", "created_by", "owner_user_id"];
    const vals = [
      semesterId,
      batchName,
      code?.trim() || null,
      description?.trim() || null,
      "ACTIVE",
      ownerUserId,
      ownerUserId,
    ];
    if (opts.department) {
      cols.push("department");
      vals.push(opts.department);
    }
    if (opts.academicContextId) {
      cols.push("academic_context_id");
      vals.push(Number(opts.academicContextId));
    }

    try {
      const [result] = await db.query(
        `INSERT INTO batches (${cols.join(", ")})
         VALUES (${vals.map(() => "?").join(", ")})
         RETURNING id, public_uuid, name, code, description, status, created_at`,
        vals
      );
      const row = Array.isArray(result) ? result[0] : result?.rows?.[0];
      return Batch.getByInternalId(row?.id, opts);
    } catch (err) {
      if (err?.code === "23505") throw duplicateBatchError();
      throw err;
    }
  },

  update: async (id, { name, code, description, status }, opts = {}) => {
    const [currentRows] = await db.query(
      `SELECT semester_id, owner_user_id, academic_context_id, name FROM batches WHERE id = ? LIMIT 1`,
      [id]
    );
    const current = currentRows[0];
    if (!current) return null;

    const nextName = name != null ? String(name).trim() : current.name;
    if (name != null && !nextName) throw new Error("Batch name is required");

    if (nextName) {
      const scopeOpts = {
        ...opts,
        academicContextId:
          opts.academicContextId ?? current.academic_context_id ?? current.academiccontextid ?? null,
        ownerUserId: opts.ownerUserId ?? current.owner_user_id,
      };
      const duplicate = await Batch.findByScopeName(
        current.semester_id,
        nextName,
        scopeOpts,
        id
      );
      if (duplicate) throw duplicateBatchError();
    }

    let nextStatus = null;
    if (status != null) {
      nextStatus = normalizeStatus(status);
    }

    try {
      const [result] = await db.query(
        `UPDATE batches
         SET name = COALESCE(?, name),
             code = COALESCE(?, code),
             description = COALESCE(?, description),
             status = COALESCE(?, status),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
         RETURNING id`,
        [
          name != null ? nextName : null,
          code != null ? String(code).trim() : null,
          description != null ? String(description).trim() : null,
          nextStatus,
          id,
        ]
      );
      const batchId = Array.isArray(result) ? result[0]?.id : result?.rows?.[0]?.id;
      return Batch.getByInternalId(batchId, opts);
    } catch (err) {
      if (err?.code === "23505") throw duplicateBatchError();
      throw err;
    }
  },

  getInternalIdByUuid: async (uuid) => {
    const [rows] = await db.query(
      `SELECT id, semester_id, owner_user_id, department FROM batches WHERE public_uuid = ? LIMIT 1`,
      [uuid]
    );
    return rows[0] ?? null;
  },

  getAccessRowByInternalId: async (id) => {
    const [rows] = await db.query(
      `SELECT id, semester_id, owner_user_id, department FROM batches WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  },

  canAccess: (batchRow, opts = {}) => {
    if (!batchRow) return false;
    if (opts.role === "admin") return true;
    if (opts.ownerIds && Array.isArray(opts.ownerIds) && opts.ownerIds.length > 0) {
      return opts.ownerIds.map(Number).includes(Number(batchRow.owner_user_id));
    }
    if (opts.role === "hod") {
      if (!opts.department) return false;
      if (!batchRow.department) return false;
      return batchRow.department === opts.department;
    }
    if (opts.role === "faculty_incharge") {
      if (!batchRow.owner_user_id || !opts.ownerUserId) return false;
      return Number(batchRow.owner_user_id) === Number(opts.ownerUserId);
    }
    return false;
  },

  getByInternalId: async (id, opts = {}) => {
    const countExpr = studentCountInBatchExpr(
      opts?.role ?? "admin",
      opts?.ownerUserId,
      opts?.department,
      "b.id",
      opts?.ownerIds
    );
    const [rows] = await db.query(
      `SELECT b.id, b.public_uuid, b.name, b.code, b.description, b.status, b.created_at,
              b.owner_user_id, b.department,
              s.public_uuid AS semester_uuid, s.label AS semester_label, s.semester_type,
              ay.public_uuid AS academic_year_uuid, ay.label AS academic_year_label,
              u.public_uuid AS creator_uuid,
              COALESCE(NULLIF(TRIM(u.username), ''), u.email, 'Faculty Incharge') AS creator_name,
              ${countExpr.sql} AS student_count
       FROM batches b
       JOIN semesters s ON s.id = b.semester_id
       JOIN academic_years ay ON ay.id = s.academic_year_id
       LEFT JOIN users u ON u.id = b.owner_user_id
       WHERE b.id = ?`,
      [...countExpr.params, id]
    );
    return mapBatch(rows[0]);
  },

  countStudents: async (batchId, opts = {}) => {
    const { studentScopeAnd } = require("../utils/ownerFilter");
    const { sql: scopeSql, params: scopeParams } = studentScopeAnd(
      opts.role,
      opts.ownerUserId,
      opts.department,
      "",
      opts.ownerIds
    );
    const [rows] = await db.query(
      `SELECT COUNT(*)::int AS total FROM students WHERE batch_id = ?${scopeSql}`,
      [batchId, ...scopeParams]
    );
    return Number(rows[0]?.total ?? 0);
  },

  getDeleteBlockers: async (batchId) => {
    const [rows] = await db.query(
      `SELECT COUNT(*)::int AS total FROM students WHERE batch_id = ?`,
      [batchId]
    );
    return { studentCount: Number(rows[0]?.total ?? 0) };
  },

  deleteById: async (id) => {
    const [result] = await db.query(`DELETE FROM batches WHERE id = ? RETURNING id`, [id]);
    const row = Array.isArray(result) ? result[0] : result?.rows?.[0];
    return Boolean(row?.id);
  },

  deleteStudentsInBatch: async (batchId, opts = {}) => {
    const { andClause } = require("../utils/ownerFilter");
    const { sql: ownerSql, params: ownerParams } = andClause(
      opts.role,
      opts.ownerUserId,
      "",
      opts.ownerIds
    );
    const [result] = await db.query(
      `DELETE FROM students WHERE batch_id = ?${ownerSql}`,
      [batchId, ...ownerParams]
    );
    return result?.affectedRows ?? result?.rowCount ?? 0;
  },
};

module.exports = Batch;
