/**
 * Role-based data access: Admin sees all; Faculty see only own records; HoD sees by department.
 * owner_user_id = user who created the record.
 */
module.exports = {
  isAdmin: (role) => role === "admin",

  /** Append AND owner_user_id = ? for non-admin. Use when query already has WHERE. prefix e.g. "f." for joined tables */
  andClause: (role, userId, prefix = "") => {
    if (role === "admin" || role === "hod" || !userId) return { sql: "", params: [] };
    const col = prefix ? `${prefix}owner_user_id` : "owner_user_id";
    return { sql: ` AND ${col} = ?`, params: [userId] };
  },

  /** Full WHERE owner_user_id = ? for non-admin. Use when no other WHERE yet. prefix e.g. "f." for "f.owner_user_id" */
  whereClause: (role, userId, prefix = "") => {
    if (role === "admin" || role === "hod" || !userId) return { sql: "", params: [] };
    const col = prefix ? `${prefix}owner_user_id` : "owner_user_id";
    return { sql: ` WHERE ${col} = ?`, params: [userId] };
  },

  /** HoD: WHERE department = ? (prefix e.g. "f." for "f.department") */
  whereClauseForHod: (department, prefix = "") => {
    if (!department) return { sql: "", params: [] };
    const col = prefix ? `${prefix}department` : "department";
    return { sql: ` WHERE ${col} = ?`, params: [department] };
  },

  /** HoD: AND department = ? */
  andClauseForHod: (department, prefix = "") => {
    if (!department) return { sql: "", params: [] };
    const col = prefix ? `${prefix}department` : "department";
    return { sql: ` AND ${col} = ?`, params: [department] };
  },

  /** For INSERT: returns { col, val } to append to columns and values */
  insertField: (role, userId) => {
    if (!userId || role === "hod") return { col: "", val: null };
    return { col: ", owner_user_id", val: userId };
  },
};
