const db = require("../config/db");

function mapSemester(row) {
  if (!row) return null;
  return {
    uuid: row.public_uuid ?? row.publicuuid,
    academicYearUuid: row.academic_year_uuid ?? row.academicyearuuid,
    academicYearLabel: row.academic_year_label ?? row.academicyearlabel,
    semesterType: row.semester_type ?? row.semestertype,
    semesterNumber: row.semester_number ?? row.semesternumber ?? null,
    label: row.label,
    isArchived: Boolean(row.is_archived ?? row.isarchived),
    createdAt: row.created_at ?? row.createdat,
  };
}

const Semester = {
  listByYearId: async (academicYearId) => {
    const [rows] = await db.query(
      `SELECT s.id, s.public_uuid, s.semester_type, s.semester_number, s.label, s.is_archived, s.created_at,
              ay.public_uuid AS academic_year_uuid, ay.label AS academic_year_label
       FROM semesters s
       JOIN academic_years ay ON ay.id = s.academic_year_id
       WHERE s.academic_year_id = ?
       ORDER BY s.is_archived ASC, s.semester_type ASC, s.semester_number ASC NULLS LAST`,
      [academicYearId]
    );
    return (rows || []).map(mapSemester);
  },

  create: async ({ academicYearId, semesterType, semesterNumber, label }) => {
    const type = String(semesterType || "").toUpperCase();
    if (!["ODD", "EVEN"].includes(type)) {
      throw new Error("Semester type must be ODD or EVEN");
    }
    const finalLabel =
      String(label || "").trim() ||
      `${type} Semester${semesterNumber ? ` ${semesterNumber}` : ""}`;
    const [result] = await db.query(
      `INSERT INTO semesters (academic_year_id, semester_type, semester_number, label)
       VALUES (?, ?, ?, ?)
       RETURNING id, public_uuid, semester_type, semester_number, label, is_archived, created_at`,
      [academicYearId, type, semesterNumber ?? null, finalLabel]
    );
    const row = Array.isArray(result) ? result[0] : result?.rows?.[0] ?? result;
    const created = mapSemester(row);
    if (!created) throw new Error("Failed to create semester");
    const [yearRows] = await db.query(
      `SELECT public_uuid, label FROM academic_years WHERE id = ?`,
      [academicYearId]
    );
    if (yearRows[0]) {
      created.academicYearUuid = yearRows[0].public_uuid;
      created.academicYearLabel = yearRows[0].label;
    }
    return created;
  },

  update: async (id, { label, semesterNumber, isArchived }) => {
    const [result] = await db.query(
      `UPDATE semesters
       SET label = COALESCE(?, label),
           semester_number = COALESCE(?, semester_number),
           is_archived = COALESCE(?, is_archived),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
       RETURNING id, public_uuid, semester_type, semester_number, label, is_archived, created_at`,
      [
        label != null ? String(label).trim() : null,
        semesterNumber ?? null,
        isArchived != null ? Boolean(isArchived) : null,
        id,
      ]
    );
    const row = Array.isArray(result) ? result[0] : result?.rows?.[0];
    return mapSemester(row);
  },

  getInternalIdByUuid: async (uuid) => {
    const [rows] = await db.query(
      `SELECT id, academic_year_id, is_archived FROM semesters WHERE public_uuid = ? LIMIT 1`,
      [uuid]
    );
    return rows[0] ?? null;
  },

  deleteCompletedById: async (id) => {
    const [semRows] = await db.query(
      `SELECT id, is_archived FROM semesters WHERE id = ? LIMIT 1`,
      [id]
    );
    const semester = semRows[0];
    if (!semester) return { notFound: true };
    if (!semester.is_archived && !semester.isarchived) {
      const err = new Error("Only completed semesters can be deleted.");
      err.statusCode = 409;
      err.code = "SEMESTER_NOT_COMPLETED";
      throw err;
    }

    const DependencyChecks = require("../utils/dependencyChecks");
    const [studentRows] = await db.query(
      `SELECT st.id
       FROM students st
       JOIN batches b ON b.id = st.batch_id
       WHERE b.semester_id = ?`,
      [id]
    );
    const studentIds = (studentRows || []).map((r) => r.id);
    if (studentIds.length) {
      const blocked = await DependencyChecks.studentIdsWithBlockers(studentIds);
      if (blocked.length > 0) {
        const err = new Error(
          "Cannot delete semester: some students have seating or attendance dependencies."
        );
        err.statusCode = 409;
        err.code = "SEMESTER_HAS_DEPENDENCIES";
        err.details = { blockedCount: blocked.length };
        throw err;
      }
    }

    const [batchRows] = await db.query(
      `SELECT id FROM batches WHERE semester_id = ?`,
      [id]
    );
    const batchCount = batchRows?.length ?? 0;

    if (studentIds.length) {
      await db.query(
        `DELETE FROM students
         WHERE batch_id IN (SELECT id FROM batches WHERE semester_id = ?)`,
        [id]
      );
    }
    await db.query(`DELETE FROM batches WHERE semester_id = ?`, [id]);
    await db.query(`DELETE FROM semesters WHERE id = ?`, [id]);

    return {
      deleted: true,
      studentCount: studentIds.length,
      batchCount,
    };
  },

  getContextById: async (id) => {
    const [rows] = await db.query(
      `SELECT s.id, s.public_uuid AS semester_uuid, s.label AS semester_label, s.semester_type,
              ay.public_uuid AS year_uuid, ay.label AS year_label
       FROM semesters s
       JOIN academic_years ay ON ay.id = s.academic_year_id
       WHERE s.id = ?`,
      [id]
    );
    return rows[0] ?? null;
  },
};

module.exports = Semester;
