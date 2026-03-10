/**
 * Role-based data access: Admin sees all, COE/Faculty see only own records.
 * owner_user_id = user who created the record.
 */
module.exports = {
  isAdmin: (role) => role === "admin",

  /** Append AND owner_user_id = ? for non-admin. Use when query already has WHERE. prefix e.g. "f." for joined tables */
  andClause: (role, userId, prefix = "") => {
    if (role === "admin" || !userId) return { sql: "", params: [] };
    const col = prefix ? `${prefix}owner_user_id` : "owner_user_id";
    return { sql: ` AND ${col} = ?`, params: [userId] };
  },

  /** Full WHERE owner_user_id = ? for non-admin. Use when no other WHERE yet. prefix e.g. "f." for "f.owner_user_id" */
  whereClause: (role, userId, prefix = "") => {
    if (role === "admin" || !userId) return { sql: "", params: [] };
    const col = prefix ? `${prefix}owner_user_id` : "owner_user_id";
    return { sql: ` WHERE ${col} = ?`, params: [userId] };
  },

  /** For INSERT: returns { col, val } to append to columns and values */
  insertField: (role, userId) => {
    if (!userId) return { col: "", val: null };
    return { col: ", owner_user_id", val: userId };
  },
};
