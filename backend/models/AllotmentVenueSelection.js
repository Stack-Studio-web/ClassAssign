/**
 * Allotment venue selection pool — venues chosen for a date/session before generate.
 */
const db = require("../config/db");

function toSelectionRow(row) {
  if (!row) return null;
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    venueUuid: row.venue_uuid ?? row.venueuuid,
    venueName: row.venue_name ?? row.venuename,
    venueCode: row.venue_code ?? row.venuecode ?? row.venue_name,
    capacity: Number(row.capacity ?? 0) || 0,
    venueType: row.venue_type ?? row.venuetype,
    blockUuid: row.block_uuid ?? row.blockuuid,
    blockName: row.block_name ?? row.blockname,
    examDate: row.exam_date ?? row.examdate,
    examSession: row.exam_session ?? row.examsession,
    startTime: row.start_time ?? row.starttime,
    endTime: row.end_time ?? row.endtime,
    status: row.status || "SELECTED",
    createdAt: row.created_at ?? row.createdat,
  };
}

const AllotmentVenueSelection = {
  async list({ examDate, examSession, ownerUserId, ownerIds = null }) {
    const clauses = [`s.exam_date = ?`, `UPPER(TRIM(s.exam_session)) = UPPER(TRIM(?))`];
    const params = [examDate, examSession];

    if (ownerIds && Array.isArray(ownerIds) && ownerIds.length > 0) {
      clauses.push(`s.owner_user_id IN (${ownerIds.map(() => "?").join(",")})`);
      params.push(...ownerIds.map(Number));
    } else if (ownerUserId) {
      clauses.push(`s.owner_user_id = ?`);
      params.push(ownerUserId);
    }

    const [rows] = await db.query(
      `SELECT s.*,
              v.public_uuid AS venue_uuid,
              v.name AS venue_name,
              v.code AS venue_code,
              v.type AS venue_type,
              v.capacity,
              b.public_uuid AS block_uuid,
              b.name AS block_name
       FROM allotment_venue_selections s
       JOIN venues v ON v.id = s.venue_id
       LEFT JOIN blocks b ON b.id = v.block_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY b.name NULLS LAST, v.name`,
      params
    );
    return (rows || []).map(toSelectionRow);
  },

  async addMany({ venueIds, examDate, examSession, startTime, endTime, ownerUserId, academicContextId }) {
    const inserted = [];
    for (const venueId of venueIds) {
      const [existing] = await db.query(
        `SELECT id, public_uuid FROM allotment_venue_selections
         WHERE venue_id = ? AND exam_date = ? AND UPPER(TRIM(exam_session)) = UPPER(TRIM(?)) AND owner_user_id = ?
         LIMIT 1`,
        [venueId, examDate, examSession, ownerUserId]
      );
      if (existing?.length) {
        await db.query(
          `UPDATE allotment_venue_selections
           SET start_time = ?, end_time = ?, status = 'SELECTED'
           WHERE id = ?`,
          [startTime, endTime, existing[0].id]
        );
        inserted.push({ id: existing[0].id, uuid: existing[0].public_uuid });
        continue;
      }
      const [res] = await db.query(
        `INSERT INTO allotment_venue_selections
           (venue_id, exam_date, exam_session, start_time, end_time, status, owner_user_id, academic_context_id)
         VALUES (?, ?, ?, ?, ?, 'SELECTED', ?, ?)`,
        [
          venueId,
          examDate,
          examSession,
          startTime,
          endTime,
          ownerUserId,
          academicContextId || null,
        ]
      );
      inserted.push({
        id: res?.insertId ?? res?.[0]?.id,
        uuid: null,
      });
    }
    return inserted;
  },

  async remove(selectionId, ownerUserId, { isAdmin = false, ownerIds = null } = {}) {
    if (isAdmin) {
      const [res] = await db.query(
        `DELETE FROM allotment_venue_selections WHERE id = ?`,
        [selectionId]
      );
      return (res?.affectedRows ?? 0) > 0;
    }
    if (ownerIds?.length) {
      const [res] = await db.query(
        `DELETE FROM allotment_venue_selections
         WHERE id = ? AND owner_user_id IN (${ownerIds.map(() => "?").join(",")})`,
        [selectionId, ...ownerIds.map(Number)]
      );
      return (res?.affectedRows ?? 0) > 0;
    }
    const [res] = await db.query(
      `DELETE FROM allotment_venue_selections WHERE id = ? AND owner_user_id = ?`,
      [selectionId, ownerUserId]
    );
    return (res?.affectedRows ?? 0) > 0;
  },

  async clearForSession({ examDate, examSession, ownerUserId }) {
    await db.query(
      `DELETE FROM allotment_venue_selections
       WHERE exam_date = ? AND UPPER(TRIM(exam_session)) = UPPER(TRIM(?)) AND owner_user_id = ?`,
      [examDate, examSession, ownerUserId]
    );
  },
};

module.exports = AllotmentVenueSelection;
