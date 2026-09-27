/**
 * Admin ownership mapping for legacy rows with NULL owner_user_id.
 * Never auto-assign randomly — Admin must choose the Faculty Incharge.
 */
const db = require("../config/db");

const OWNED_TABLES = [
  { table: "students", label: "Students" },
  { table: "faculty", label: "Faculty" },
  { table: "venues", label: "Venues" },
  { table: "batches", label: "Batches" },
  { table: "timetable", label: "Timetable" },
  { table: "exams", label: "Exams" },
  { table: "seating_plans", label: "Seating Plans" },
  { table: "ineligible_students", label: "Ineligible Students" },
];

async function listFacultyIncharges() {
  const [rows] = await db.query(
    `SELECT u.id, u.public_uuid, u.username, u.email, u.department
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'faculty_incharge'
       AND COALESCE(u.is_active, TRUE) = TRUE
     ORDER BY u.username ASC`
  );
  return (rows || []).map((r) => ({
    id: r.id,
    uuid: r.public_uuid ?? r.publicuuid,
    username: r.username,
    email: r.email,
    department: r.department || "",
  }));
}

async function getUnownedCounts() {
  const counts = [];
  for (const { table, label } of OWNED_TABLES) {
    try {
      const [rows] = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM ${table} WHERE owner_user_id IS NULL`
      );
      counts.push({
        table,
        label,
        unowned: Number(rows?.[0]?.cnt ?? rows?.[0]?.CNT ?? 0),
      });
    } catch (err) {
      counts.push({ table, label, unowned: null, error: err.message });
    }
  }
  return counts;
}

async function assignOwner({ table, ownerUserId, limit = null }) {
  const allowed = OWNED_TABLES.find((t) => t.table === table);
  if (!allowed) {
    const err = new Error("Unsupported table for ownership assignment");
    err.statusCode = 400;
    throw err;
  }
  const ownerId = Number(ownerUserId);
  if (!ownerId) {
    const err = new Error("ownerUserId is required");
    err.statusCode = 400;
    throw err;
  }

  const [fiRows] = await db.query(
    `SELECT u.id FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? AND r.name = 'faculty_incharge'`,
    [ownerId]
  );
  if (!fiRows.length) {
    const err = new Error("Target user must be an active Faculty Incharge");
    err.statusCode = 400;
    throw err;
  }

  let sql = `UPDATE ${table}
              SET owner_user_id = ?
              WHERE owner_user_id IS NULL`;
  const params = [ownerId];
  if (limit && Number(limit) > 0) {
    sql += ` AND id IN (
      SELECT id FROM ${table} WHERE owner_user_id IS NULL ORDER BY id ASC LIMIT ?
    )`;
    // Postgres needs subquery alias for UPDATE ... FROM pattern; use CTE instead.
    sql = `WITH pick AS (
             SELECT id FROM ${table} WHERE owner_user_id IS NULL ORDER BY id ASC LIMIT ?
           )
           UPDATE ${table} t
           SET owner_user_id = ?
           FROM pick
           WHERE t.id = pick.id`;
    params.length = 0;
    params.push(Number(limit), ownerId);
  }

  const [result] = await db.query(sql, params);
  const updated = result?.affectedRows ?? result?.rowCount ?? 0;
  return { table, ownerUserId: ownerId, updated };
}

async function backfillExamsFromSeatingPlans() {
  const [result] = await db.query(
    `UPDATE exams e
     SET owner_user_id = sp.owner_user_id
     FROM seating_plan_venues spv
     JOIN seating_plans sp ON sp.id = spv.seating_plan_id
     WHERE e.owner_user_id IS NULL
       AND sp.owner_user_id IS NOT NULL
       AND sp.exam_date = e.exam_date
       AND (e.exam_session IS NULL OR sp.exam_session = e.exam_session)`
  );
  return { updated: result?.affectedRows ?? result?.rowCount ?? 0 };
}

module.exports = {
  OWNED_TABLES,
  listFacultyIncharges,
  getUnownedCounts,
  assignOwner,
  backfillExamsFromSeatingPlans,
};
