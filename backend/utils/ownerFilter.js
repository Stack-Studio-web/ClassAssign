/**
 * Role-based data access: Admin sees all; Faculty see only own records; HoD sees by department.
 * owner_user_id = createdByFacultyId (users.id of Faculty Incharge who imported/created).
 */
module.exports = {
  isAdmin: (role) => role === "admin",
  isHod: (role) => role === "hod",
  isFacultyIncharge: (role) => role === "faculty_incharge",

  /** Student/batch scope: admin=all, faculty=strict owner, hod=department */
  studentScopeWhere: (role, userId, department, prefix = "") => {
    if (role === "admin") return { sql: "", params: [] };
    if (role === "hod") {
      if (!department) return { sql: " WHERE 1=0", params: [] };
      const col = prefix ? `${prefix}department` : "department";
      return { sql: ` WHERE ${col} = ?`, params: [department] };
    }
    if (!userId) return { sql: " WHERE 1=0", params: [] };
    const col = prefix ? `${prefix}owner_user_id` : "owner_user_id";
    return { sql: ` WHERE ${col} = ?`, params: [userId] };
  },

  studentScopeAnd: (role, userId, department, prefix = "") => {
    if (role === "admin") return { sql: "", params: [] };
    if (role === "hod") {
      if (!department) return { sql: " AND 1=0", params: [] };
      const col = prefix ? `${prefix}department` : "department";
      return { sql: ` AND ${col} = ?`, params: [department] };
    }
    if (!userId) return { sql: " AND 1=0", params: [] };
    const col = prefix ? `${prefix}owner_user_id` : "owner_user_id";
    return { sql: ` AND ${col} = ?`, params: [userId] };
  },

  /** Batch list scope — faculty sees ONLY batches they created */
  batchScopeAnd: (role, userId, department, prefix = "b.") => {
    if (role === "admin") return { sql: "", params: [] };
    if (role === "hod") {
      if (!department) return { sql: " AND 1=0", params: [] };
      return { sql: ` AND ${prefix}department = ?`, params: [department] };
    }
    if (!userId) return { sql: " AND 1=0", params: [] };
    return { sql: ` AND ${prefix}owner_user_id = ?`, params: [userId] };
  },

  /** SQL fragment + params for owner-scoped student count inside a batch */
  studentCountInBatchExpr: (role, userId, department, batchCol = "b.id") => {
    if (role === "admin") {
      return {
        sql: `(SELECT COUNT(*)::int FROM students st WHERE st.batch_id = ${batchCol})`,
        params: [],
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

  andClause: (role, userId, prefix = "") => {
    if (role === "admin" || role === "hod" || !userId) return { sql: "", params: [] };
    const col = prefix ? `${prefix}owner_user_id` : "owner_user_id";
    return { sql: ` AND ${col} = ?`, params: [userId] };
  },

  whereClause: (role, userId, prefix = "") => {
    if (role === "admin" || role === "hod" || !userId) return { sql: "", params: [] };
    const col = prefix ? `${prefix}owner_user_id` : "owner_user_id";
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
    if (!userId || role === "hod") return { col: "", val: null };
    return { col: ", owner_user_id", val: userId };
  },
};
