const db = require("../config/db");
const { whereClause, insertField } = require("../utils/ownerFilter");

function mapYear(row) {
  if (!row) return null;
  return {
    uuid: row.public_uuid ?? row.publicuuid,
    label: row.label,
    startYear: row.start_year ?? row.startyear ?? null,
    endYear: row.end_year ?? row.endyear ?? null,
    isArchived: Boolean(row.is_archived ?? row.isarchived),
    createdAt: row.created_at ?? row.createdat,
  };
}

const AcademicYear = {
  list: async (_opts = {}) => {
    const [rows] = await db.query(
      `SELECT id, public_uuid, label, start_year, end_year, is_archived, created_at
       FROM academic_years
       ORDER BY is_archived ASC, label DESC`
    );
    return (rows || []).map(mapYear);
  },

  create: async ({ label, startYear, endYear }, opts = {}) => {
    const trimmed = String(label || "").trim();
    if (!trimmed) throw new Error("Academic year label is required");
    const { col, val } = insertField(opts.role, opts.ownerUserId);
    const vals = [trimmed, startYear ?? null, endYear ?? null];
    if (val != null) vals.push(val);
    const [result] = await db.query(
      `INSERT INTO academic_years (label, start_year, end_year${col})
       VALUES (${vals.map(() => "?").join(", ")})
       RETURNING id, public_uuid, label, start_year, end_year, is_archived, created_at`,
      vals
    );
    const row = Array.isArray(result) ? result[0] : result?.rows?.[0] ?? result;
    return mapYear(row);
  },

  update: async (id, { label, startYear, endYear, isArchived }) => {
    const [result] = await db.query(
      `UPDATE academic_years
       SET label = COALESCE(?, label),
           start_year = COALESCE(?, start_year),
           end_year = COALESCE(?, end_year),
           is_archived = COALESCE(?, is_archived),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
       RETURNING id, public_uuid, label, start_year, end_year, is_archived, created_at`,
      [
        label != null ? String(label).trim() : null,
        startYear ?? null,
        endYear ?? null,
        isArchived != null ? Boolean(isArchived) : null,
        id,
      ]
    );
    const row = Array.isArray(result) ? result[0] : result?.rows?.[0];
    return mapYear(row);
  },

  getInternalIdByUuid: async (uuid) => {
    const [rows] = await db.query(
      `SELECT id FROM academic_years WHERE public_uuid = ? LIMIT 1`,
      [uuid]
    );
    return rows[0]?.id ?? null;
  },

  getDeleteBlockers: async (id) => {
    const [rows] = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM semesters WHERE academic_year_id = ?) AS semester_count,
         (SELECT COUNT(*)::int FROM batches b
            INNER JOIN semesters s ON s.id = b.semester_id
            WHERE s.academic_year_id = ?) AS batch_count,
         (SELECT COUNT(*)::int FROM students st
            INNER JOIN batches b ON b.id = st.batch_id
            INNER JOIN semesters s ON s.id = b.semester_id
            WHERE s.academic_year_id = ?) AS student_count`,
      [id, id, id]
    );
    const row = rows[0] || {};
    return {
      semesterCount: Number(row.semester_count ?? row.semestercount ?? 0),
      batchCount: Number(row.batch_count ?? row.batchcount ?? 0),
      studentCount: Number(row.student_count ?? row.studentcount ?? 0),
    };
  },

  deleteById: async (id) => {
    const [result] = await db.query(
      `DELETE FROM academic_years WHERE id = ? RETURNING id`,
      [id]
    );
    if (Array.isArray(result) && result.length > 0) return true;
    return (result?.affectedRows ?? 0) > 0;
  },
};

module.exports = AcademicYear;
