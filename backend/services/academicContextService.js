const db = require("../config/db");

function toContext(row) {
  if (!row) return null;
  return {
    id: row.id,
    uuid: row.public_uuid ?? row.publicuuid,
    label: row.label,
    department: row.department,
    academicYear: row.academic_year ?? row.academicyear ?? null,
    batch: row.batch ?? null,
    semester: row.semester ?? null,
    hodUserId: row.hod_user_id ?? row.hoduserid,
    hodName: row.hod_name ?? row.hodname ?? null,
    isActive: row.is_active ?? row.isactive ?? true,
    createdAt: row.created_at ?? row.createdat,
    updatedAt: row.updated_at ?? row.updatedat,
    members: row.members || undefined,
  };
}

function toMember(row) {
  return {
    userId: row.user_id ?? row.userid,
    uuid: row.public_uuid ?? row.publicuuid,
    username: row.username,
    email: row.email,
    role: row.member_role ?? row.memberrole ?? row.role_name ?? row.rolename,
    department: row.department,
  };
}

const AcademicContextService = {
  getById: async (id) => {
    if (!id) return null;
    const [rows] = await db.query(
      `SELECT ac.*, h.username AS hod_name
       FROM academic_contexts ac
       LEFT JOIN users h ON h.id = ac.hod_user_id
       WHERE ac.id = ?
       LIMIT 1`,
      [id]
    );
    return toContext(rows?.[0]);
  },

  getByUuid: async (uuid) => {
    const [rows] = await db.query(
      `SELECT ac.*, h.username AS hod_name
       FROM academic_contexts ac
       LEFT JOIN users h ON h.id = ac.hod_user_id
       WHERE ac.public_uuid = ?
       LIMIT 1`,
      [uuid]
    );
    return toContext(rows?.[0]);
  },

  getForUser: async (userId) => {
    if (!userId) return null;
    const [rows] = await db.query(
      `SELECT ac.*, h.username AS hod_name
       FROM users u
       JOIN academic_contexts ac ON ac.id = u.academic_context_id AND ac.is_active = TRUE
       LEFT JOIN users h ON h.id = ac.hod_user_id
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    );
    if (rows?.[0]) return toContext(rows[0]);

    // Fallback: membership table
    const [viaMember] = await db.query(
      `SELECT ac.*, h.username AS hod_name
       FROM academic_context_members m
       JOIN academic_contexts ac ON ac.id = m.academic_context_id AND ac.is_active = TRUE
       LEFT JOIN users h ON h.id = ac.hod_user_id
       WHERE m.user_id = ?
       ORDER BY ac.id ASC
       LIMIT 1`,
      [userId]
    );
    return toContext(viaMember?.[0]);
  },

  listMembers: async (contextId) => {
    const [rows] = await db.query(
      `SELECT m.user_id, m.member_role, u.public_uuid, u.username, u.email, u.department, r.name AS role_name
       FROM academic_context_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE m.academic_context_id = ?
       ORDER BY m.member_role DESC, u.username ASC`,
      [contextId]
    );
    return (rows || []).map(toMember);
  },

  /** All user ids that share this academic context (HOD + FIs). */
  getMemberUserIds: async (contextId) => {
    if (!contextId) return [];
    const [rows] = await db.query(
      `SELECT user_id FROM academic_context_members WHERE academic_context_id = ?`,
      [contextId]
    );
    return [...new Set((rows || []).map((r) => Number(r.user_id ?? r.userid)).filter((id) => id > 0))];
  },

  getMemberUserIdsForUser: async (userId) => {
    const ctx = await AcademicContextService.getForUser(userId);
    if (!ctx?.id) return userId ? [Number(userId)] : [];
    const ids = await AcademicContextService.getMemberUserIds(ctx.id);
    return ids.length ? ids : [Number(userId)];
  },

  listAll: async () => {
    const [rows] = await db.query(
      `SELECT ac.*, h.username AS hod_name
       FROM academic_contexts ac
       LEFT JOIN users h ON h.id = ac.hod_user_id
       WHERE ac.is_active = TRUE
       ORDER BY ac.department ASC, ac.label ASC`
    );
    const contexts = [];
    for (const row of rows || []) {
      const ctx = toContext(row);
      ctx.members = await AcademicContextService.listMembers(ctx.id);
      contexts.push(ctx);
    }
    return contexts;
  },

  create: async ({ label, department, academicYear, batch, semester, hodUserId, facultyInchargeIds = [], createdBy }) => {
    const dept = String(department || "").trim().toUpperCase();
    const name = String(label || "").trim() || `${dept} Academic Context`;
    if (!dept) {
      throw Object.assign(new Error("Department is required"), { statusCode: 400 });
    }
    if (!hodUserId) {
      throw Object.assign(new Error("HOD is required"), { statusCode: 400 });
    }

    const [hodRows] = await db.query(
      `SELECT u.id FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND r.name = 'hod' AND COALESCE(u.is_active, TRUE) = TRUE
       LIMIT 1`,
      [hodUserId]
    );
    if (!hodRows?.length) {
      throw Object.assign(new Error("Selected HOD was not found"), { statusCode: 400 });
    }

    const [inserted] = await db.query(
      `INSERT INTO academic_contexts
         (label, department, academic_year, batch, semester, hod_user_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id, public_uuid`,
      [
        name,
        dept,
        academicYear || null,
        batch || null,
        semester || null,
        hodUserId,
        createdBy || null,
      ]
    );
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    const contextId = row?.id;
    if (!contextId) {
      throw Object.assign(new Error("Failed to create academic context"), { statusCode: 500 });
    }

    await AcademicContextService.setMembers(contextId, hodUserId, facultyInchargeIds);
    const created = await AcademicContextService.getById(contextId);
    created.members = await AcademicContextService.listMembers(contextId);
    return created;
  },

  update: async (uuid, { label, department, academicYear, batch, semester, hodUserId, facultyInchargeIds }) => {
    const existing = await AcademicContextService.getByUuid(uuid);
    if (!existing) {
      throw Object.assign(new Error("Academic context not found"), { statusCode: 404 });
    }

    const dept = department != null ? String(department).trim().toUpperCase() : existing.department;
    const name = label != null ? String(label).trim() : existing.label;
    const nextHod = hodUserId != null ? Number(hodUserId) : existing.hodUserId;

    await db.query(
      `UPDATE academic_contexts
       SET label = ?, department = ?, academic_year = ?, batch = ?, semester = ?,
           hod_user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name,
        dept,
        academicYear !== undefined ? academicYear || null : existing.academicYear,
        batch !== undefined ? batch || null : existing.batch,
        semester !== undefined ? semester || null : existing.semester,
        nextHod,
        existing.id,
      ]
    );

    if (facultyInchargeIds || hodUserId != null) {
      await AcademicContextService.setMembers(
        existing.id,
        nextHod,
        facultyInchargeIds || (await AcademicContextService.listMembers(existing.id))
          .filter((m) => m.role === "faculty_incharge" || m.role === "faculty_incharge")
          .map((m) => m.userId)
      );
    }

    const updated = await AcademicContextService.getById(existing.id);
    updated.members = await AcademicContextService.listMembers(existing.id);
    return updated;
  },

  setMembers: async (contextId, hodUserId, facultyInchargeIds = []) => {
    const fiIds = [...new Set((facultyInchargeIds || []).map(Number).filter((id) => id > 0 && id !== Number(hodUserId)))];

    // Clear previous assignments for these users from other contexts
    const allUserIds = [Number(hodUserId), ...fiIds];
    if (allUserIds.length) {
      const placeholders = allUserIds.map(() => "?").join(", ");
      await db.query(
        `DELETE FROM academic_context_members
         WHERE user_id IN (${placeholders}) AND academic_context_id <> ?`,
        [...allUserIds, contextId]
      );
    }

    await db.query(`DELETE FROM academic_context_members WHERE academic_context_id = ?`, [contextId]);

    await db.query(
      `INSERT INTO academic_context_members (academic_context_id, user_id, member_role)
       VALUES (?, ?, 'hod')
       ON CONFLICT (academic_context_id, user_id) DO UPDATE SET member_role = 'hod'`,
      [contextId, hodUserId]
    );
    await db.query(`UPDATE users SET academic_context_id = ?, created_by_hod_id = ? WHERE id = ?`, [
      contextId,
      hodUserId,
      hodUserId,
    ]);

    for (const fiId of fiIds) {
      await db.query(
        `INSERT INTO academic_context_members (academic_context_id, user_id, member_role)
         VALUES (?, ?, 'faculty_incharge')
         ON CONFLICT (academic_context_id, user_id) DO UPDATE SET member_role = 'faculty_incharge'`,
        [contextId, fiId]
      );
      await db.query(
        `UPDATE users SET academic_context_id = ?, created_by_hod_id = ? WHERE id = ?`,
        [contextId, hodUserId, fiId]
      );
    }

    // Users removed from this context
    await db.query(
      `UPDATE users SET academic_context_id = NULL
       WHERE academic_context_id = ?
         AND id NOT IN (SELECT user_id FROM academic_context_members WHERE academic_context_id = ?)`,
      [contextId, contextId]
    );
  },

  softDelete: async (uuid) => {
    const existing = await AcademicContextService.getByUuid(uuid);
    if (!existing) {
      throw Object.assign(new Error("Academic context not found"), { statusCode: 404 });
    }
    await db.query(
      `UPDATE academic_contexts SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [existing.id]
    );
    await db.query(`UPDATE users SET academic_context_id = NULL WHERE academic_context_id = ?`, [
      existing.id,
    ]);
    await db.query(`DELETE FROM academic_context_members WHERE academic_context_id = ?`, [existing.id]);
    return { deleted: true };
  },

  listHodCandidates: async () => {
    const [rows] = await db.query(
      `SELECT u.id, u.public_uuid, u.username, u.email, u.department
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'hod' AND COALESCE(u.is_active, TRUE) = TRUE
       ORDER BY u.username`
    );
    return (rows || []).map((r) => ({
      id: r.id,
      uuid: r.public_uuid ?? r.publicuuid,
      username: r.username,
      email: r.email,
      department: r.department,
    }));
  },

  listFiCandidates: async () => {
    const [rows] = await db.query(
      `SELECT u.id, u.public_uuid, u.username, u.email, u.department, u.academic_context_id, u.created_by_hod_id
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'faculty_incharge' AND COALESCE(u.is_active, TRUE) = TRUE
       ORDER BY u.username`
    );
    return (rows || []).map((r) => ({
      id: r.id,
      uuid: r.public_uuid ?? r.publicuuid,
      username: r.username,
      email: r.email,
      department: r.department,
      academicContextId: r.academic_context_id ?? r.academiccontextid ?? null,
      createdByHodId: r.created_by_hod_id ?? r.createdbyhodid ?? null,
    }));
  },
};

module.exports = AcademicContextService;
