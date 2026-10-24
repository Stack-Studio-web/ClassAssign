// Class/backend/models/Faculty.js
const db = require("../config/db");
const { ownerWhereFromOpts, ownerAndFromOpts } = require("../utils/ownerFilter");
const {
  normalizeFacultyEmail,
  pickCanonicalFaculty,
  pickFacultyForLogin,
} = require("../utils/facultyIdentity");
const { ACTIVE_ALLOCATION_SQL } = require("../utils/facultyAllocationStatus");
const {
  findActiveTimeConflict,
  buildTimeConflictMessage,
  presentConflictForViewer,
} = require("../utils/facultyTimeConflict");
const Membership = require("../utils/facultyMembership");

function validContextId(opts = {}) {
  const id = Number(opts.academicContextId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Faculty visible to the caller: owned by the caller's scope (home) OR shared with the
 * caller's Academic Context through an active membership. Alias f; joins alias sm.
 * Params order: select (home), join (context), where (home).
 */
function visibleFacultySql(opts = {}) {
  const home = Membership.homePredicate(opts, "f.");
  const contextId = validContextId(opts);
  if (!contextId) {
    return {
      selectSql: `${home.sql} AS is_home,
        NULL::int AS shared_membership_id, NULL::int AS shared_max,
        NULL::boolean AS shared_available, NULL::int AS shared_transfer_count,
        NULL::text AS shared_department`,
      selectParams: home.params,
      joinSql: "",
      joinParams: [],
      whereSql: home.sql,
      whereParams: home.params,
    };
  }
  return {
    selectSql: `${home.sql} AS is_home,
      sm.id AS shared_membership_id, sm.max_classrooms AS shared_max,
      sm.is_available AS shared_available, sm.transfer_count AS shared_transfer_count,
      sm.department AS shared_department`,
    selectParams: home.params,
    joinSql: `LEFT JOIN faculty_department_memberships sm
      ON sm.faculty_id = f.id AND sm.academic_context_id = ? AND sm.is_active = TRUE`,
    joinParams: [contextId],
    whereSql: `(${home.sql} OR sm.id IS NOT NULL)`,
    whereParams: home.params,
  };
}

const HOME_DEPARTMENT_SQL = `COALESCE(
  NULLIF(TRIM(f.department), ''),
  (SELECT ac.department FROM users ou
     JOIN academic_contexts ac ON ac.id = ou.academic_context_id
    WHERE ou.id = f.owner_user_id LIMIT 1)
)`;

/** Merge visible faculty rows with per-department counters (pure apart from toFacultyRow). */
function mergeScopedRows(rows, bucketRows) {
  const buckets = Membership.indexBuckets(bucketRows);
  return (rows || []).map((r) => {
    const isHome = r.is_home === true || r.ishome === true;
    const sharedId = isHome ? null : r.shared_membership_id ?? r.sharedmembershipid ?? null;
    const counts = buckets.get(Number(r.id))?.get(Membership.bucketKey(sharedId));
    const settings =
      sharedId != null
        ? {
            maxClassrooms: r.shared_max ?? r.sharedmax,
            transferCount: r.shared_transfer_count ?? r.sharedtransfercount,
            isAvailable: (r.shared_available ?? r.sharedavailable) !== false,
          }
        : {
            maxClassrooms: r.max_classrooms ?? r.maxclassrooms,
            transferCount: r.transfer_count ?? r.transfercount,
            isAvailable: (r.is_available ?? r.isavailable) !== false,
          };
    const homeDepartment = r.home_department ?? r.homedepartment ?? null;
    const shared = r.shared_departments ?? r.shareddepartments ?? [];
    const rawCount = r.shared_context_count ?? r.sharedcontextcount;
    const sharedAcrossContexts =
      rawCount != null
        ? Number(rawCount) > 0
        : Array.isArray(shared) && shared.length > 0;
    const departments = Membership.membershipLabels(homeDepartment, shared);
    const mainDepartment =
      String(homeDepartment || "").trim().toUpperCase() || departments[0] || null;
    return toFacultyRow({
      ...r,
      ...Membership.scopedCounters(settings, counts),
      departments,
      main_department: mainDepartment,
      membership_label: Membership.membershipDisplayLabel(
        homeDepartment,
        shared,
        sharedAcrossContexts
      ),
      is_shared: sharedAcrossContexts,
      membership_type: sharedId != null ? "shared" : "home",
      scoped_department:
        sharedId != null ? r.shared_department ?? r.shareddepartment : homeDepartment,
    });
  });
}

// PostgreSQL returns unquoted column names in lowercase; map to camelCase for API
function toFacultyRow(row) {
  if (!row || typeof row !== "object") return row;
  const isAvailable =
    row.is_available === false || row.isavailable === false ? false : true;
  const maxClassrooms = Number(row.max_classrooms ?? row.maxclassrooms ?? row.maxClassrooms ?? 1) || 1;
  const allocation = Number(row.allocation ?? 0) || 0;
  const completed = Number(row.completed ?? 0) || 0;
  // Remaining = currently free slots (normal capacity − active allocated). Not a completed counter.
  const remaining =
    row.remaining != null
      ? Number(row.remaining) || 0
      : maxClassrooms - allocation;
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    name: row.name ?? "",
    department: row.department ?? "",
    email: row.email ?? "",
    maxClassrooms,
    /** Active allocations (attendance OR report still pending). */
    allocation,
    /** Fully completed allocations (attendance AND report done) — history only. */
    completed,
    /** Free slots available to allocate again. Always: maxClassrooms ≈ allocation + remaining. */
    remaining,
    /** Alias of remaining (free allotment slots). */
    freeSlots: remaining,
    /** Independent of allocation limit — successful transfer requests initiated/received. */
    transferCount: Number(row.transfer_count ?? row.transfercount ?? row.transferCount ?? 0) || 0,
    /** Assignments with attendance completed (may still be active if report pending). */
    attendanceCompleted: Number(row.attendance_completed ?? row.attendanceCompleted ?? 0) || 0,
    /** Assignments with report completed (may still be active if attendance pending). */
    reportCompleted: Number(row.report_completed ?? row.reportCompleted ?? 0) || 0,
    totalAssignments: Number(row.total_assignments ?? row.totalAssignments ?? allocation + completed) || 0,
    isAvailable,
    isActive: row.is_active === false || row.isactive === false ? false : true,
    ...(row.departments
      ? {
          /** Home department first, then shared department memberships. */
          departments: row.departments,
          /** Original creation/import department — never changed by later shares. */
          mainDepartment: row.main_department ?? null,
          /** "CSE" or "Shared - CSE" from membership count + main department. */
          membershipLabel: row.membership_label ?? null,
          /** True when the identity belongs to more than one department. */
          isShared: row.is_shared === true,
          /** "home" = owned by the caller's department; "shared" = membership row. */
          membershipType: row.membership_type,
          /** Department whose counters are shown in this row. */
          scopedDepartment: row.scoped_department ?? null,
          canEditIdentity: row.membership_type !== "shared",
        }
      : {}),
  };
}

const ACTIVE_ONLY_SQL = `COALESCE(is_active, TRUE) = TRUE`;
const ACTIVE_ONLY_F_SQL = `COALESCE(f.is_active, TRUE) = TRUE`;

const Faculty = {
  /**
   * All faculty rows matching email (case-insensitive), with allotment/seating counts.
   * Used to pick a stable canonical id when soft-delete + re-add created duplicates.
   */
  findAllByEmail: async (email, executor = db) => {
    const normalized = normalizeFacultyEmail(email);
    if (!normalized) return [];
    const [rows] = await executor.query(
      `SELECT
         f.id,
         f.public_uuid,
         f.name,
         f.email,
         f.department,
         COALESCE(f.is_active, TRUE) AS is_active,
         f.deleted_at,
         (
           SELECT COUNT(*)::int FROM faculty_assignments fa WHERE fa.faculty_id = f.id
         ) AS assign_count,
         (
           SELECT COUNT(*)::int FROM seating_plan_venue_faculty spvf WHERE spvf.faculty_id = f.id
         ) AS seating_count
       FROM faculty f
       WHERE LOWER(TRIM(f.email)) = ?
       ORDER BY f.id ASC`,
      [normalized]
    );
    return rows || [];
  },

  /** Canonical row for an email (active+history preferred). Includes inactive. */
  findByEmail: async (email, executor = db) => {
    const rows = await Faculty.findAllByEmail(email, executor);
    return pickCanonicalFaculty(rows);
  },

  /** Prefer active row with allotment history — for faculty portal / MS login binding. */
  findForLoginByEmail: async (email) => {
    const rows = await Faculty.findAllByEmail(email);
    return pickFacultyForLogin(rows);
  },

  /**
   * Ensure an active faculty exists for this email without creating a second identity.
   * Reactivates the canonical (history-rich) row when inactive.
   */
  ensureActiveByEmail: async (email, { name, department } = {}) => {
    const existing = await Faculty.findByEmail(email);
    if (!existing) return null;
    if (!existing.is_active) {
      await Faculty.reactivateById(existing.id, { name, department });
    } else if (name || department != null) {
      await db.query(
        `UPDATE faculty
         SET name = COALESCE(?, name),
             department = COALESCE(?, department)
         WHERE id = ?`,
        [name || null, department ?? null, existing.id]
      );
    }
    return Faculty.findByEmail(email);
  },

  create: async ({ name, department, email, maxClassrooms }, opts = {}, executor = db) => {
    const { insertOwnership } = require("../utils/ownerFilter");
    const ownership = insertOwnership(opts);
    const normalizedEmail = normalizeFacultyEmail(email);
    const max =
      maxClassrooms != null && maxClassrooms !== ""
        ? Number(maxClassrooms)
        : 1;
    if (!Number.isFinite(max) || max < 1 || max > 20) {
      const err = new Error("max_classrooms must be between 1 and 20");
      err.code = "VALIDATION";
      throw err;
    }
    const cols = ["name", "department", "email", "max_classrooms"];
    const vals = [name, department, normalizedEmail, max];
    if (ownership.col) {
      cols.push(...ownership.col.replace(/^,\s*/, "").split(",").map((c) => c.trim()).filter(Boolean));
      vals.push(...ownership.params);
    }
    const sql = `INSERT INTO faculty (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
    return executor.query(sql, vals);
  },

  /**
   * Add `delta` to context-scoped MAX (home faculty row or shared membership).
   * Uses SELECT FOR UPDATE — call inside a transaction.
   * Never modifies is_available, allocation, completed, or transfer_count.
   */
  incrementMaxClassroomsBy: async (id, delta, opts = {}, executor = db) => {
    const d = Number(delta);
    if (!Number.isFinite(d) || d < 1 || !Number.isInteger(d)) {
      return {
        ok: false,
        code: "VALIDATION",
        message: "MAX increment must be a positive integer",
      };
    }

    const scope = await Membership.resolveFacultyScope(id, opts, executor);

    if (scope.kind === "shared") {
      const membershipId = Number(scope.membership?.id ?? scope.membership?.ID);
      const [locked] = await executor.query(
        `SELECT id, max_classrooms
         FROM faculty_department_memberships
         WHERE id = ? AND is_active = TRUE
         FOR UPDATE`,
        [membershipId]
      );
      const row = locked?.[0];
      if (!row) {
        return { ok: false, code: "NOT_FOUND", message: "Membership not found or inactive" };
      }
      const previousMax = Number(row.max_classrooms ?? row.maxclassrooms ?? 1) || 1;
      const nextMax = previousMax + d;
      if (nextMax > 20) {
        return {
          ok: false,
          code: "MAX_LIMIT",
          message: `MAX would be ${nextMax}; allowed range is 1–20.`,
          previousMax,
          nextMax,
        };
      }
      await executor.query(
        `UPDATE faculty_department_memberships
         SET max_classrooms = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND is_active = TRUE`,
        [nextMax, membershipId]
      );
      return {
        ok: true,
        previousMax,
        nextMax,
        scope: "shared",
        membershipId,
        facultyId: Number(id),
      };
    }

    if (scope.kind !== "home") {
      return {
        ok: false,
        code: "NOT_IN_SCOPE",
        message: "Faculty is not in your Academic Context",
      };
    }

    const { sql: ownerSql, params: ownerParams } = ownerAndFromOpts(opts);
    const [locked] = await executor.query(
      `SELECT id, max_classrooms
       FROM faculty
       WHERE id = ? AND ${ACTIVE_ONLY_SQL}${ownerSql}
       FOR UPDATE`,
      [id, ...ownerParams]
    );
    const row = locked?.[0];
    if (!row) {
      return { ok: false, code: "NOT_FOUND", message: "Faculty not found or not allowed" };
    }
    const previousMax = Number(row.max_classrooms ?? row.maxclassrooms ?? 1) || 1;
    const nextMax = previousMax + d;
    if (nextMax > 20) {
      return {
        ok: false,
        code: "MAX_LIMIT",
        message: `MAX would be ${nextMax}; allowed range is 1–20.`,
        previousMax,
        nextMax,
      };
    }
    await executor.query(
      `UPDATE faculty SET max_classrooms = ? WHERE id = ?${ownerSql}`,
      [nextMax, id, ...ownerParams]
    );
    return {
      ok: true,
      previousMax,
      nextMax,
      scope: "home",
      membershipId: null,
      facultyId: Number(id),
    };
  },

  getAll: async (opts = {}) => Faculty.getAllWithAllocation(opts),

  /** Distinct active faculty identities visible to the caller (home + shared). */
  count: async (opts = {}) => {
    const vis = visibleFacultySql(opts);
    const [rows] = await db.query(
      `SELECT COUNT(DISTINCT f.id) AS totalFaculty
       FROM faculty f
       ${vis.joinSql}
       WHERE ${vis.whereSql}
         AND ${ACTIVE_ONLY_F_SQL}`,
      [...vis.joinParams, ...vis.whereParams]
    );
    const r = rows?.[0];
    return {
      totalFaculty: Number(r?.totalFaculty ?? r?.totalfaculty ?? 0) || 0
    };
  },

  /** Updates the caller's department Max only (home → faculty row, shared → membership). */
  updateMaxClassrooms: async (id, max, opts = {}) => {
    const scope = await Membership.resolveFacultyScope(id, opts);
    if (scope.kind === "shared") {
      const [result] = await db.query(
        `UPDATE faculty_department_memberships
         SET max_classrooms = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND is_active = TRUE`,
        [max, scope.membership.id]
      );
      return (result.affectedRows ?? 0) > 0;
    }
    if (scope.kind !== "home") return false;
    const { sql: ownerSql, params: ownerParams } = ownerAndFromOpts(opts);
    const [result] = await db.query(
      `UPDATE faculty SET max_classrooms = ? WHERE id = ? AND ${ACTIVE_ONLY_SQL}${ownerSql}`,
      [max, id, ...ownerParams]
    );
    return (result.affectedRows ?? 0) > 0;
  },

  /**
   * Update faculty profile fields and keep linked users row in sync by email.
   * Returns { ok, code?, message?, faculty? }.
   */
  updateDetails: async (
    id,
    { name, department, email, maxClassrooms, isAvailable } = {},
    opts = {}
  ) => {
    const scope = await Membership.resolveFacultyScope(id, opts);
    if (scope.kind === "shared") {
      return Faculty.updateSharedMembershipDetails(scope, {
        name,
        department,
        email,
        maxClassrooms,
        isAvailable,
      });
    }

    const { sql: ownerSql, params: ownerParams } = ownerAndFromOpts(opts);
    const [match] = await db.query(
      `SELECT id, name, department, email, max_classrooms, is_available
       FROM faculty
       WHERE id = ? AND ${ACTIVE_ONLY_SQL}${ownerSql}`,
      [id, ...ownerParams]
    );
    if (!Array.isArray(match) || match.length === 0) {
      return { ok: false, code: "NOT_FOUND", message: "Faculty not found or not allowed" };
    }

    const current = match[0];
    const nextName =
      name != null ? String(name).trim() : String(current.name || "").trim();
    const nextDepartment =
      department !== undefined
        ? department == null || String(department).trim() === ""
          ? null
          : String(department).trim()
        : current.department ?? null;
    const nextEmail = normalizeFacultyEmail(
      email != null ? email : current.email
    );
    const nextMax =
      maxClassrooms != null
        ? Number(maxClassrooms)
        : Number(current.max_classrooms ?? 1) || 1;
    const nextAvailable =
      typeof isAvailable === "boolean"
        ? isAvailable
        : current.is_available !== false;

    if (!nextName) {
      return { ok: false, code: "VALIDATION", message: "Name is required" };
    }
    if (!nextEmail) {
      return { ok: false, code: "VALIDATION", message: "Email is required" };
    }
    if (!Number.isFinite(nextMax) || nextMax < 1 || nextMax > 20) {
      return {
        ok: false,
        code: "VALIDATION",
        message: "max_classrooms must be between 1 and 20",
      };
    }

    const oldEmail = normalizeFacultyEmail(current.email);
    if (nextEmail !== oldEmail) {
      const [dupFaculty] = await db.query(
        `SELECT id FROM faculty
         WHERE LOWER(TRIM(email)) = ?
           AND id <> ?
           AND COALESCE(is_active, TRUE) = TRUE
         LIMIT 1`,
        [nextEmail, id]
      );
      if (Array.isArray(dupFaculty) && dupFaculty.length > 0) {
        return {
          ok: false,
          code: "DUPLICATE_EMAIL",
          message: "Another faculty already uses this email.",
        };
      }
      const [dupUser] = await db.query(
        `SELECT id FROM users
         WHERE LOWER(TRIM(email)) = ?
           AND LOWER(TRIM(email)) <> ?
         LIMIT 1`,
        [nextEmail, oldEmail]
      );
      if (Array.isArray(dupUser) && dupUser.length > 0) {
        return {
          ok: false,
          code: "DUPLICATE_EMAIL",
          message: "A user account with this email already exists.",
        };
      }
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE faculty
         SET name = ?,
             department = ?,
             email = ?,
             max_classrooms = ?,
             is_available = ?
         WHERE id = ?
           AND ${ACTIVE_ONLY_SQL}`,
        [nextName, nextDepartment, nextEmail, nextMax, nextAvailable, id]
      );

      if (oldEmail) {
        await conn.query(
          `UPDATE users
           SET email = ?,
               department = COALESCE(?, department)
           WHERE LOWER(TRIM(email)) = ?`,
          [nextEmail, nextDepartment, oldEmail]
        );
      }

      await conn.commit();
      return {
        ok: true,
        faculty: {
          name: nextName,
          department: nextDepartment,
          email: nextEmail,
          maxClassrooms: nextMax,
          isAvailable: nextAvailable,
        },
      };
    } catch (err) {
      await conn.rollback();
      if (err.code === "ER_DUP_ENTRY" || err.code === "23505") {
        return {
          ok: false,
          code: "DUPLICATE_EMAIL",
          message: "Faculty or user with this email already exists.",
        };
      }
      throw err;
    } finally {
      conn.release();
    }
  },

  /**
   * Shared department edit: only its own Max / Available. Identity fields (name, email,
   * department) belong to the home department and are rejected when changed.
   */
  updateSharedMembershipDetails: async (
    scope,
    { name, department, email, maxClassrooms, isAvailable } = {}
  ) => {
    const current = scope.faculty;
    if (current?.is_active === false || current?.isactive === false) {
      return { ok: false, code: "NOT_FOUND", message: "Faculty not found or not allowed" };
    }
    const changedName =
      name != null && Membership.normalizeName(name) !== Membership.normalizeName(current.name);
    const changedEmail =
      email != null && normalizeFacultyEmail(email) !== normalizeFacultyEmail(current.email);
    const currentDept = String(current.department || "").trim().toUpperCase();
    const changedDept =
      department !== undefined && String(department || "").trim().toUpperCase() !== currentDept;
    if (changedName || changedEmail || changedDept) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message:
          "This faculty member is shared from another department. Only their home department can change name, email, or department. You can update your department's Max and Available settings.",
      };
    }

    const m = scope.membership;
    const nextMax =
      maxClassrooms != null ? Number(maxClassrooms) : Number(m.max_classrooms ?? 1) || 1;
    if (!Number.isFinite(nextMax) || nextMax < 1 || nextMax > 20) {
      return { ok: false, code: "VALIDATION", message: "max_classrooms must be between 1 and 20" };
    }
    const nextAvailable = typeof isAvailable === "boolean" ? isAvailable : m.is_available !== false;
    await db.query(
      `UPDATE faculty_department_memberships
       SET max_classrooms = ?, is_available = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND is_active = TRUE`,
      [nextMax, nextAvailable, m.id]
    );
    return {
      ok: true,
      faculty: {
        name: current.name,
        department: current.department ?? null,
        email: current.email,
        maxClassrooms: nextMax,
        isAvailable: nextAvailable,
      },
    };
  },

  updateAvailability: async (id, isAvailable, opts = {}) => {
    const scope = await Membership.resolveFacultyScope(id, opts);
    if (scope.kind === "shared") {
      const [result] = await db.query(
        `UPDATE faculty_department_memberships
         SET is_available = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND is_active = TRUE`,
        [isAvailable, scope.membership.id]
      );
      return (result.affectedRows ?? 0) > 0;
    }
    if (scope.kind !== "home") return false;
    const { sql: ownerSql, params: ownerParams } = ownerAndFromOpts(opts);
    const [match] = await db.query(
      `SELECT id FROM faculty WHERE id = ? AND ${ACTIVE_ONLY_SQL}${ownerSql}`,
      [id, ...ownerParams]
    );
    if (!Array.isArray(match) || match.length === 0) return false;
    await db.query(
      `UPDATE faculty SET is_available = ? WHERE id = ?${ownerSql}`,
      [isAvailable, id, ...ownerParams]
    );
    return true;
  },

  /**
   * Soft-delete: remove from active Faculty Management / allotment.
   * Keeps the row so seating_plan_venues.faculty_id and history stay valid.
   */
  softDeleteById: async (id, opts = {}) => {
    // Ensure soft-delete columns exist (safe on every call; IF NOT EXISTS).
    try {
      await db.query(
        `ALTER TABLE faculty ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`
      );
      await db.query(
        `ALTER TABLE faculty ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL`
      );
    } catch (_) {
      /* ignore if concurrent / permission — UPDATE below will surface real errors */
    }

    const { sql: ownerSql, params: ownerParams } = ownerAndFromOpts(opts);

    const [match] = await db.query(
      `SELECT id, email FROM faculty
       WHERE id = ?
         AND COALESCE(is_active, TRUE) = TRUE
         ${ownerSql}`,
      [id, ...ownerParams]
    );
    if (!Array.isArray(match) || match.length === 0) return false;

    // Identity + login are shared: never deactivate while another department still uses it.
    const others = await Membership.countActiveMembershipsExcluding(id);
    if (others > 0) {
      const err = new Error(
        "This faculty member is also shared with another department. Their identity and login stay active; ask the other department(s) to remove them first, or contact an administrator."
      );
      err.statusCode = 409;
      err.code = "FACULTY_SHARED";
      throw err;
    }

    const email = match[0].email;
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        `UPDATE faculty
         SET is_active = FALSE,
             is_available = FALSE,
             deleted_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND COALESCE(is_active, TRUE) = TRUE`,
        [id]
      );
      if ((result.affectedRows ?? 0) === 0) {
        await conn.rollback();
        return false;
      }
      if (email) {
        await conn.query(
          `UPDATE users SET is_active = FALSE WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))`,
          [email]
        );
      }
      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /** Reactivate a soft-deleted faculty (e.g. re-add same email). Preserves faculty.id. */
  reactivateById: async (id, { name, department } = {}, executor = db) => {
    await executor.query(
      `UPDATE faculty
       SET is_active = TRUE,
           is_available = TRUE,
           deleted_at = NULL,
           name = COALESCE(?, name),
           department = COALESCE(?, department),
           email = LOWER(TRIM(email))
       WHERE id = ?`,
      [name || null, department ?? null, id]
    );
    const [rows] = await executor.query(`SELECT email FROM faculty WHERE id = ?`, [id]);
    const email = rows?.[0]?.email;
    if (email) {
      await executor.query(
        `UPDATE users SET is_active = TRUE WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))`,
        [email]
      );
    }
    return true;
  },

  /**
   * Apply import matching-row count to context-scoped MAX (absolute set to N).
   * Prefer setMaxClassroomsAbsolute from import; kept for callers that pass row counts.
   * Does not modify is_available / transfers / allocation history.
   */
  applyImportMaxClassrooms: async (id, importRowCount, opts = {}, executor = db) => {
    return Faculty.setMaxClassroomsAbsolute(id, importRowCount, opts, executor);
  },

  /**
   * Set context-scoped MAX to an absolute value (import target for N matching rows).
   * Does not modify is_available / transfers / allocation history.
   */
  setMaxClassroomsAbsolute: async (id, maxClassrooms, opts = {}, executor = db) => {
    const nextMax = Number(maxClassrooms);
    if (!Number.isFinite(nextMax) || nextMax < 1 || nextMax > 20) {
      return {
        ok: false,
        code: "VALIDATION",
        message: "max_classrooms must be between 1 and 20",
      };
    }
    const scope = await Membership.resolveFacultyScope(id, opts, executor);
    if (scope.kind === "shared") {
      const membershipId = Number(scope.membership?.id ?? scope.membership?.ID);
      const [locked] = await executor.query(
        `SELECT id, max_classrooms FROM faculty_department_memberships
         WHERE id = ? AND is_active = TRUE FOR UPDATE`,
        [membershipId]
      );
      if (!locked?.[0]) {
        return { ok: false, code: "NOT_FOUND", message: "Membership not found or inactive" };
      }
      const previousMax = Number(locked[0].max_classrooms ?? 1) || 1;
      await executor.query(
        `UPDATE faculty_department_memberships
         SET max_classrooms = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND is_active = TRUE`,
        [nextMax, membershipId]
      );
      return {
        ok: true,
        previousMax,
        nextMax,
        scope: "shared",
        membershipId,
        facultyId: Number(id),
      };
    }
    if (scope.kind !== "home") {
      return { ok: false, code: "NOT_IN_SCOPE", message: "Faculty is not in your Academic Context" };
    }
    const { sql: ownerSql, params: ownerParams } = ownerAndFromOpts(opts);
    const [locked] = await executor.query(
      `SELECT id, max_classrooms FROM faculty
       WHERE id = ? AND ${ACTIVE_ONLY_SQL}${ownerSql} FOR UPDATE`,
      [id, ...ownerParams]
    );
    if (!locked?.[0]) {
      return { ok: false, code: "NOT_FOUND", message: "Faculty not found or not allowed" };
    }
    const previousMax = Number(locked[0].max_classrooms ?? 1) || 1;
    await executor.query(
      `UPDATE faculty SET max_classrooms = ? WHERE id = ?${ownerSql}`,
      [nextMax, id, ...ownerParams]
    );
    return {
      ok: true,
      previousMax,
      nextMax,
      scope: "home",
      membershipId: null,
      facultyId: Number(id),
    };
  },

  deleteById: async (id, opts = {}) => Faculty.softDeleteById(id, opts),

  /**
   * Remove a faculty member from the caller's department.
   * shared → deactivate only this department's membership (history + counters kept).
   * home   → existing soft-delete (blocked while other departments share the identity).
   * @returns {Promise<{ok: boolean, kind?: string, code?: string, message?: string}>}
   */
  removeFromDepartment: async (id, opts = {}) => {
    const scope = await Membership.resolveFacultyScope(id, opts);
    if (scope.kind === "shared") {
      const [result] = await db.query(
        `UPDATE faculty_department_memberships
         SET is_active = FALSE, removed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND is_active = TRUE`,
        [scope.membership.id]
      );
      const ok = (result.affectedRows ?? 0) > 0;
      return ok
        ? { ok, kind: "shared", department: scope.membership.department }
        : { ok, code: "NOT_FOUND" };
    }
    if (scope.kind !== "home") return { ok: false, code: "NOT_FOUND" };
    const ok = await Faculty.softDeleteById(id, opts);
    return ok ? { ok, kind: "home" } : { ok, code: "NOT_FOUND" };
  },

  /** @returns {Promise<{removed: number, skippedShared: number[]}>} */
  deleteByIds: async (ids, opts = {}) => {
    const skippedShared = [];
    let removed = 0;
    for (const id of ids || []) {
      try {
        if (await Faculty.softDeleteById(id, opts)) removed += 1;
      } catch (err) {
        if (err.code !== "FACULTY_SHARED") throw err;
        skippedShared.push(id);
      }
    }
    return { removed, skippedShared };
  },

  /**
   * Soft-delete all active faculty in the caller's ownership scope.
   * Preserves seating/attendance history (faculty rows stay; is_active=false).
   * Also deactivates matching user login accounts.
   * @returns {{ removed: number }}
   */
  deleteAll: async (opts = {}) => {
    try {
      await db.query(
        `ALTER TABLE faculty ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`
      );
      await db.query(
        `ALTER TABLE faculty ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL`
      );
    } catch (_) {
      /* ignore */
    }

    const { sql: ownerSql, params: ownerParams } = ownerWhereFromOpts(opts);
    const whereBase = ownerSql || "WHERE 1=1";
    // Identities still used by another department keep their login and stay active.
    const notSharedSql = `NOT EXISTS (
      SELECT 1 FROM faculty_department_memberships fdm
      WHERE fdm.faculty_id = faculty.id AND fdm.is_active = TRUE
    )`;
    const contextId = validContextId(opts);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [emails] = await conn.query(
        `SELECT email FROM faculty
         ${whereBase}
           AND ${ACTIVE_ONLY_SQL}
           AND ${notSharedSql}
           AND email IS NOT NULL
           AND TRIM(email) <> ''`,
        ownerParams
      );

      const [sharedRows] = await conn.query(
        `SELECT COUNT(*)::int AS cnt FROM faculty
         ${whereBase}
           AND ${ACTIVE_ONLY_SQL}
           AND NOT ${notSharedSql}`,
        ownerParams
      );
      const skippedShared = Number(sharedRows?.[0]?.cnt ?? 0) || 0;

      const [result] = await conn.query(
        `UPDATE faculty
         SET is_active = FALSE,
             is_available = FALSE,
             deleted_at = CURRENT_TIMESTAMP
         ${whereBase}
           AND ${ACTIVE_ONLY_SQL}
           AND ${notSharedSql}`,
        ownerParams
      );
      let removed = Number(result?.affectedRows ?? result?.rowCount ?? 0) || 0;

      if (contextId) {
        const [memberResult] = await conn.query(
          `UPDATE faculty_department_memberships
           SET is_active = FALSE, removed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE academic_context_id = ? AND is_active = TRUE`,
          [contextId]
        );
        removed += Number(memberResult?.affectedRows ?? 0) || 0;
      }

      const emailList = (Array.isArray(emails) ? emails : [])
        .map((r) => String(r.email || "").trim().toLowerCase())
        .filter(Boolean);
      if (emailList.length > 0) {
        const placeholders = emailList.map(() => "?").join(", ");
        await conn.query(
          `UPDATE users
           SET is_active = FALSE
           WHERE LOWER(TRIM(email)) IN (${placeholders})`,
          emailList
        );
      }

      await conn.commit();
      return { removed, skippedShared };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /* =====================================
     ACTIVE ALLOCATION COUNT (one department)
     Counts seating_plan_venues still active
     (attendance OR report not both completed) that are attributed to
     membershipId (null = home department). Completed/historical plans do NOT count.
  ===================================== */
  countActiveAllocations: async (facultyId, executor = db, membershipId = null) => {
    const bucketSql =
      membershipId == null ? "attr.membership_id IS NULL" : "attr.membership_id = ?";
    const params = membershipId == null ? [facultyId] : [facultyId, Number(membershipId)];
    const [rows] = await executor.query(
      `
      SELECT COUNT(spvf.id) AS cnt
      FROM seating_plan_venue_faculty spvf
      JOIN seating_plan_venues spv ON spv.id = spvf.seating_plan_venue_id
      JOIN seating_plans sp ON sp.id = spv.seating_plan_id
      ${Membership.ATTRIBUTION_LATERAL_SQL}
      WHERE spvf.faculty_id = ?
        AND ${bucketSql}
        AND (${ACTIVE_ALLOCATION_SQL})
      `,
      params
    );
    return Number(rows?.[0]?.cnt ?? rows?.[0]?.CNT ?? 0) || 0;
  },

  /**
   * Capacity for the department an assignment by attributionUserId would count toward.
   * attributionUserId = seating_plans.owner_user_id the new plan will carry.
   */
  getCapacitySummary: async (facultyId, executor = db, { attributionUserId = null } = {}) => {
    const [rows] = await executor.query(
      `
      SELECT
        f.id,
        COALESCE(f.max_classrooms, 1) AS max_classrooms,
        COALESCE(f.is_available, TRUE) AS is_available,
        COALESCE(f.is_active, TRUE) AS is_active
      FROM faculty f
      WHERE f.id = ?
      `,
      [facultyId]
    );
    if (!rows?.length) return null;
    const r = rows[0];
    const membership = attributionUserId
      ? await Membership.findMembershipForAttributionUser(facultyId, attributionUserId, executor)
      : null;
    const maxClassrooms = membership
      ? Number(membership.max_classrooms ?? 1) || 1
      : Number(r.max_classrooms ?? r.maxclassrooms ?? 1) || 1;
    const allocation = await Faculty.countActiveAllocations(
      facultyId,
      executor,
      membership ? membership.id : null
    );
    const isAvailable = membership
      ? membership.is_available !== false
      : !(r.is_available === false || r.isavailable === false);
    return {
      maxClassrooms,
      allocation,
      // Remaining for this department across exam days: Max − active assignments.
      remaining: Math.max(0, maxClassrooms - allocation),
      isAvailable,
      isActive: !(r.is_active === false || r.isactive === false),
      membershipActive: membership ? membership.is_active !== false : true,
      department: membership ? membership.department : null,
      scope: membership ? "shared" : "home",
    };
  },

  /* =====================================
     CHECK IF FACULTY CAN BE ALLOCATED
     Capacity = department-scoped active seating assignments (not slot-scoped).
     Time-slot conflicts are checked separately at save time.
  ===================================== */
  canAllocate: async (facultyId, { additionalSlots = 1, attributionUserId = null } = {}) => {
    const summary = await Faculty.getCapacitySummary(facultyId, db, { attributionUserId });
    if (!summary) return false;
    if (!summary.isActive || !summary.isAvailable) return false;
    const need = Math.max(1, Number(additionalSlots) || 1);
    return summary.remaining >= need;
  },

  findActiveTimeConflict: async (opts, executor = db) =>
    findActiveTimeConflict(executor, opts),

  /**
   * Validate capacity and time availability before assigning faculty.
   * Capacity and time conflict are checked separately.
   * @param {object} opts
   * @param {boolean} [opts.ignoreCapacity=false] - When true (faculty transfer),
   *   skip normal allocation-limit check; still enforce same-day conflict / active status.
   * @param {number|null} [opts.attributionUserId] - Owner of the plan being created;
   *   selects which department's Max / Alloc applies.
   * @param {object|null} [opts.viewer] - conflictViewerFromOpts(); hides other departments' venues.
   * Same-day conflicts are always checked across ALL departments.
   */
  validateFacultyForAllocation: async (
    facultyId,
    {
      examDate,
      examStartTime,
      examEndTime,
      additionalSlots = 1,
      excludeSeatingPlanId = null,
      excludeSpvId = null,
      ignoreCapacity = false,
      forUpdate = false,
      attributionUserId = null,
      viewer = null,
    } = {},
    executor = db
  ) => {
    const summary = await Faculty.getCapacitySummary(facultyId, executor, { attributionUserId });
    if (!summary) {
      return {
        allowed: false,
        code: "NOT_FOUND",
        message: "Faculty not found",
      };
    }
    if (!summary.isActive) {
      return {
        allowed: false,
        code: "INACTIVE",
        message:
          "Faculty has been removed from active management and cannot be assigned to new exams",
      };
    }
    if (!summary.membershipActive) {
      return {
        allowed: false,
        code: "INACTIVE",
        message: `Faculty has been removed from ${summary.department || "this department"}'s active management and cannot be assigned by it`,
      };
    }
    if (!summary.isAvailable) {
      return {
        allowed: false,
        code: "UNAVAILABLE",
        message: summary.department
          ? `Faculty is marked unavailable for ${summary.department}`
          : "Faculty is marked unavailable",
      };
    }

    if (!ignoreCapacity) {
      const slots = Math.max(1, Number(additionalSlots) || 1);
      if (summary.remaining < slots) {
        const forDept = summary.department ? ` for ${summary.department}` : "";
        return {
          allowed: false,
          code: "CAPACITY",
          message:
            `Faculty allocation limit reached${forDept}. ${summary.maxClassrooms} max, ${summary.allocation} already assigned, ${summary.remaining} remaining.`,
          currentAllocation: summary.allocation,
          maxClassrooms: summary.maxClassrooms,
          remaining: summary.remaining,
        };
      }
    }

    // Same calendar day = conflict (times are informational only).
    if (examDate) {
      const conflict = await findActiveTimeConflict(executor, {
        facultyId,
        examDate,
        examStartTime,
        examEndTime,
        excludeSeatingPlanId,
        excludeSpvId,
        forUpdate,
      });
      if (conflict) {
        const shown = presentConflictForViewer(conflict, viewer);
        return {
          allowed: false,
          code: "TIME_CONFLICT",
          message: shown.message || buildTimeConflictMessage(shown),
          conflict: shown,
        };
      }
    }

    return {
      allowed: true,
      maxClassrooms: summary.maxClassrooms,
      currentAllocation: summary.allocation,
      remaining: summary.remaining,
    };
  },

  /**
   * Increment independent transfer counter (does not affect allocation capacity).
   * Counted for the department that owns the transferred assignment's seating plan.
   */
  incrementTransferCount: async (facultyId, executor = db, { seatingPlanVenueId = null } = {}) => {
    if (!facultyId) return;
    if (seatingPlanVenueId) {
      const [owners] = await executor.query(
        `SELECT sp.owner_user_id
         FROM seating_plan_venues spv
         JOIN seating_plans sp ON sp.id = spv.seating_plan_id
         WHERE spv.id = ?`,
        [seatingPlanVenueId]
      );
      const ownerId = owners?.[0]?.owner_user_id ?? owners?.[0]?.owneruserid ?? null;
      const membership = ownerId
        ? await Membership.findMembershipForAttributionUser(facultyId, ownerId, executor)
        : null;
      if (membership) {
        await executor.query(
          `UPDATE faculty_department_memberships
           SET transfer_count = transfer_count + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [membership.id]
        );
        return;
      }
    }
    await executor.query(
      `UPDATE faculty
       SET transfer_count = COALESCE(transfer_count, 0) + 1
       WHERE id = ?`,
      [facultyId]
    );
  },

  /* =====================================
     GET ALL FACULTY WITH ALLOCATION INFO
     Derived from seating_plan_venues + attendance + report status.
       Allocated  = active (attendance OR report still pending)
       Completed  = fully completed history (attendance AND report done)
       Remaining  = max_classrooms − Allocated (free slots to allocate again)
       Invariant  = max_classrooms = Allocated + Remaining (when Allocated ≤ max)
  ===================================== */
  getAllWithAllocation: async (opts = {}) =>
    Faculty.queryScopedRows(opts, { applyVisibility: true }),

  /**
   * Active allotment exam dates per faculty uuid (owner-scoped seating plans).
   * Dates match duties that still count toward Alloc (not fully completed).
   * @returns {Promise<Record<string, string[]>>} uuid → sorted YYYY-MM-DD dates
   */
  getActiveAllotmentDatesByUuid: async (opts = {}) => {
    const ownerIds =
      (opts.ownerIds && opts.ownerIds.length > 0 && opts.ownerIds) || null;
    const params = [];
    let ownerSql = "";
    if (opts.role !== "admin") {
      if (ownerIds && ownerIds.length) {
        ownerSql = ` AND sp.owner_user_id IN (${ownerIds.map(() => "?").join(",")})`;
        params.push(...ownerIds);
      } else {
        const uid = opts.ownerUserId ?? opts.userId ?? null;
        if (!uid) return {};
        ownerSql = " AND sp.owner_user_id = ?";
        params.push(uid);
      }
    }

    const [rows] = await db.query(
      `SELECT
         f.public_uuid,
         to_char(sp.exam_date, 'YYYY-MM-DD') AS exam_date
       FROM seating_plan_venue_faculty spvf
       JOIN seating_plan_venues spv ON spv.id = spvf.seating_plan_venue_id
       JOIN seating_plans sp ON sp.id = spv.seating_plan_id
       JOIN faculty f ON f.id = spvf.faculty_id
       WHERE sp.exam_date IS NOT NULL
         AND (${ACTIVE_ALLOCATION_SQL})
         ${ownerSql}
       ORDER BY f.public_uuid, sp.exam_date ASC`,
      params
    );

    const byUuid = {};
    for (const r of rows || []) {
      const uuid = String(r.public_uuid ?? r.publicuuid ?? "").trim();
      const date = String(r.exam_date ?? r.examdate ?? "").slice(0, 10);
      if (!uuid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!byUuid[uuid]) byUuid[uuid] = [];
      if (!byUuid[uuid].includes(date)) byUuid[uuid].push(date);
    }
    return byUuid;
  },

  /**
   * Allocation summaries for specific faculty internal IDs (derived, idempotent).
   * With opts, shared faculty report the caller's department counters.
   */
  getAllocationSummariesByIds: async (facultyIds = [], opts = null) => {
    const ids = [...new Set((facultyIds || []).map((id) => Number(id)).filter((id) => id > 0))];
    if (ids.length === 0) return [];
    return Faculty.queryScopedRows(opts || { role: "admin" }, { ids, applyVisibility: false });
  },

  /**
   * One row per faculty identity with department-scoped Max / Alloc / Done / Rem /
   * Transfers / Available plus department memberships.
   */
  queryScopedRows: async (opts = {}, { ids = null, applyVisibility = true } = {}) => {
    const vis = visibleFacultySql(opts);
    const params = [...vis.selectParams, ...vis.joinParams];
    const where = ["1=1"];
    if (applyVisibility) {
      where.push(ACTIVE_ONLY_F_SQL, vis.whereSql);
      params.push(...vis.whereParams);
    }
    if (ids) {
      where.push(`f.id IN (${ids.map(() => "?").join(", ")})`);
      params.push(...ids);
    }
    const [rows] = await db.query(
      `
      SELECT
        f.id,
        f.public_uuid,
        f.name,
        f.department,
        f.email,
        COALESCE(f.max_classrooms, 1) AS max_classrooms,
        COALESCE(f.is_available, true) AS is_available,
        COALESCE(f.transfer_count, 0) AS transfer_count,
        ${HOME_DEPARTMENT_SQL} AS home_department,
        ARRAY(
          SELECT m.department FROM faculty_department_memberships m
          WHERE m.faculty_id = f.id AND m.is_active = TRUE
          ORDER BY m.department
        ) AS shared_departments,
        (
          SELECT COUNT(*)::int FROM faculty_department_memberships m
          WHERE m.faculty_id = f.id AND m.is_active = TRUE
        ) AS shared_context_count,
        ${vis.selectSql}
      FROM faculty f
      ${vis.joinSql}
      WHERE ${where.join("\n        AND ")}
      ORDER BY f.name ASC
      `,
      params
    );
    const list = rows || [];
    const buckets = await Membership.countAssignmentBuckets(list.map((r) => r.id));
    return mergeScopedRows(list, buckets);
  },
};

Faculty._mergeScopedRows = mergeScopedRows;

module.exports = Faculty;