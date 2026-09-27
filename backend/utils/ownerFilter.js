/**
 * Role-based data access.
 * owner_user_id = Faculty Incharge who created the row (session user id).
 *
 * Reads:
 *   admin            → unfiltered
 *   faculty_incharge → owner_user_id = self only (strict isolation)
 *   hod              → owner_user_id IN workspace (HOD + FIs under HOD)
 *
 * Writes always stamp the authenticated creator; never trust client owner ids.
 */
function ownerColumn(prefix = "") {
  return prefix ? `${prefix}owner_user_id` : "owner_user_id";
}

function ownerInClause(ownerIds, prefix = "", lead = "AND") {
  const ids = [...new Set((ownerIds || []).map((id) => Number(id)).filter((id) => id > 0))];
  if (ids.length === 0) {
    return { sql: ` ${lead} 1=0`, params: [] };
  }
  const col = ownerColumn(prefix);
  const placeholders = ids.map(() => "?").join(", ");
  return { sql: ` ${lead} ${col} IN (${placeholders})`, params: ids };
}

module.exports = {
  isAdmin: (role) => role === "admin",
  isHod: (role) => role === "hod",
  isFacultyIncharge: (role) => role === "faculty_incharge",

  ownerInAnd: (ownerIds, prefix = "") => ownerInClause(ownerIds, prefix, "AND"),
  ownerInWhere: (ownerIds, prefix = "") => ownerInClause(ownerIds, prefix, "WHERE"),

  /**
   * Student/batch scope.
   * When ownerIds is provided (HOD workspace / FI siblings), filter by owner IN list
   * instead of per-user or raw department.
   */
  studentScopeWhere: (role, userId, department, prefix = "", ownerIds = null) => {
    if (role === "admin") return { sql: "", params: [] };
    if (ownerIds) return ownerInClause(ownerIds, prefix, "WHERE");
    if (role === "hod") {
      if (!department) return { sql: " WHERE 1=0", params: [] };
      const col = prefix ? `${prefix}department` : "department";
      return { sql: ` WHERE ${col} = ?`, params: [department] };
    }
    if (!userId) return { sql: " WHERE 1=0", params: [] };
    const col = ownerColumn(prefix);
    return { sql: ` WHERE ${col} = ?`, params: [userId] };
  },

  studentScopeAnd: (role, userId, department, prefix = "", ownerIds = null) => {
    if (role === "admin") return { sql: "", params: [] };
    if (ownerIds) return ownerInClause(ownerIds, prefix, "AND");
    if (role === "hod") {
      if (!department) return { sql: " AND 1=0", params: [] };
      const col = prefix ? `${prefix}department` : "department";
      return { sql: ` AND ${col} = ?`, params: [department] };
    }
    if (!userId) return { sql: " AND 1=0", params: [] };
    const col = ownerColumn(prefix);
    return { sql: ` AND ${col} = ?`, params: [userId] };
  },

  /** Batch list scope */
  batchScopeAnd: (role, userId, department, prefix = "b.", ownerIds = null) => {
    if (role === "admin") return { sql: "", params: [] };
    if (ownerIds) return ownerInClause(ownerIds, prefix, "AND");
    if (role === "hod") {
      if (!department) return { sql: " AND 1=0", params: [] };
      return { sql: ` AND ${prefix}department = ?`, params: [department] };
    }
    if (!userId) return { sql: " AND 1=0", params: [] };
    return { sql: ` AND ${prefix}owner_user_id = ?`, params: [userId] };
  },

  /** SQL fragment + params for owner-scoped student count inside a batch */
  studentCountInBatchExpr: (role, userId, department, batchCol = "b.id", ownerIds = null) => {
    if (role === "admin") {
      return {
        sql: `(SELECT COUNT(*)::int FROM students st WHERE st.batch_id = ${batchCol})`,
        params: [],
      };
    }
    if (ownerIds) {
      const ids = [...new Set((ownerIds || []).map((id) => Number(id)).filter((id) => id > 0))];
      if (ids.length === 0) return { sql: "0", params: [] };
      const placeholders = ids.map(() => "?").join(", ");
      return {
        sql: `(SELECT COUNT(*)::int FROM students st WHERE st.batch_id = ${batchCol} AND st.owner_user_id IN (${placeholders}))`,
        params: ids,
      };
    }
    if (role === "hod") {
      if (!department) {
        return { sql: "0", params: [] };
      }
      return {
        sql: `(SELECT COUNT(*)::int FROM students st WHERE st.batch_id = ${batchCol} AND st.department = ?)`,
        params: [department],
      };
    }
    if (!userId) {
      return { sql: "0", params: [] };
    }
    return {
      sql: `(SELECT COUNT(*)::int FROM students st WHERE st.batch_id = ${batchCol} AND st.owner_user_id = ?)`,
      params: [userId],
    };
  },

  andClause: (role, userId, prefix = "", ownerIds = null) => {
    if (role === "admin") return { sql: "", params: [] };
    if (ownerIds) return ownerInClause(ownerIds, prefix, "AND");
    // Fail closed for HOD without resolved workspace ownerIds
    if (role === "hod" || !userId) return { sql: " AND 1=0", params: [] };
    const col = ownerColumn(prefix);
    return { sql: ` AND ${col} = ?`, params: [userId] };
  },

  whereClause: (role, userId, prefix = "", ownerIds = null) => {
    if (role === "admin") return { sql: "", params: [] };
    if (ownerIds) return ownerInClause(ownerIds, prefix, "WHERE");
    // Fail closed for HOD without resolved workspace ownerIds
    if (role === "hod" || !userId) return { sql: " WHERE 1=0", params: [] };
    const col = ownerColumn(prefix);
    return { sql: ` WHERE ${col} = ?`, params: [userId] };
  },

  whereClauseForHod: (department, prefix = "") => {
    if (!department) return { sql: "", params: [] };
    const col = prefix ? `${prefix}department` : "department";
    return { sql: ` WHERE ${col} = ?`, params: [department] };
  },

  andClauseForHod: (department, prefix = "") => {
    if (!department) return { sql: "", params: [] };
    const col = prefix ? `${prefix}department` : "department";
    return { sql: ` AND ${col} = ?`, params: [department] };
  },

  insertField: (role, userId) => {
    // Ownership always comes from authenticated session userId — never from the client.
    if (!userId || role === "hod") return { col: "", val: null };
    return { col: ", owner_user_id", val: userId };
  },

  /**
   * Prefer shared workspace ownerIds; fall back to HOD department or single-owner.
   */
  ownerWhereFromOpts: (opts = {}, prefix = "") => {
    if (opts.ownerIds) {
      return module.exports.whereClause(opts.role, opts.ownerUserId, prefix, opts.ownerIds);
    }
    if (opts.role === "hod" && opts.department) {
      return module.exports.whereClauseForHod(opts.department, prefix);
    }
    return module.exports.whereClause(opts.role, opts.ownerUserId, prefix);
  },

  ownerAndFromOpts: (opts = {}, prefix = "") => {
    if (opts.ownerIds) {
      return module.exports.andClause(opts.role, opts.ownerUserId, prefix, opts.ownerIds);
    }
    if (opts.role === "hod" && opts.department) {
      return module.exports.andClauseForHod(opts.department, prefix);
    }
    return module.exports.andClause(opts.role, opts.ownerUserId, prefix);
  },
};
