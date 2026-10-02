const db = require("../config/db");

function formatVerificationId(year, seq) {
  return `HAL-${year}-${String(seq).padStart(6, "0")}`;
}

function displayLabelForUser(user) {
  if (!user) return "Hallora User";
  const role = String(user.role || "").toLowerCase();
  const roleLabel =
    role === "admin"
      ? "Admin"
      : role === "faculty_incharge"
        ? "Faculty Incharge"
        : role === "hod"
          ? "HOD"
          : role || "User";
  const name = String(user.username || user.name || "").trim();
  return name ? `${roleLabel} (${name})` : roleLabel;
}

const ReportVerification = {
  /**
   * Allocate next HAL-YYYY-NNNNNN and insert VALID verification row.
   * document_hash is filled later via finalize().
   */
  create: async ({ reportType, user, metadata = null }) => {
    const year = new Date().getFullYear();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `INSERT INTO report_verification_counters (year, last_value)
         VALUES (?, 0)
         ON CONFLICT (year) DO NOTHING`,
        [year]
      );

      const [counterRows] = await conn.query(
        `UPDATE report_verification_counters
         SET last_value = last_value + 1
         WHERE year = ?
         RETURNING last_value`,
        [year]
      );
      const seq = Number(counterRows?.[0]?.last_value ?? 0);
      if (!seq) {
        throw new Error("Failed to allocate verification sequence");
      }

      const verificationId = formatVerificationId(year, seq);
      const generatedByLabel = displayLabelForUser(user);
      const userId = user?.id != null ? Number(user.id) : null;

      const [inserted] = await conn.query(
        `INSERT INTO report_verifications
           (verification_id, report_type, generated_by_user_id, generated_by_label, metadata, status)
         VALUES (?, ?, ?, ?, ?, 'VALID')
         RETURNING id, public_uuid, verification_id, report_type, generated_by_label, generated_at, document_hash, status`,
        [
          verificationId,
          String(reportType || "Report").slice(0, 100),
          userId,
          generatedByLabel,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      let row = Array.isArray(inserted) ? inserted[0] : inserted;
      let uuid = row?.public_uuid ?? row?.publicuuid;
      // If the DB wrapper collapsed RETURNING to { insertId }, re-read the row.
      if (!uuid) {
        const [found] = await conn.query(
          `SELECT id, public_uuid, verification_id, report_type, generated_by_label,
                  generated_at, document_hash, status
           FROM report_verifications
           WHERE verification_id = ?
           LIMIT 1`,
          [verificationId]
        );
        row = Array.isArray(found) ? found[0] : found;
        uuid = row?.public_uuid ?? row?.publicuuid;
      }

      const mapped = {
        id: row?.id,
        uuid,
        verificationId:
          row?.verification_id ?? row?.verificationid ?? verificationId,
        reportType: row?.report_type ?? row?.reporttype ?? reportType,
        generatedByLabel:
          row?.generated_by_label ?? row?.generatedbylabel ?? generatedByLabel,
        generatedAt: row?.generated_at ?? row?.generatedat ?? new Date().toISOString(),
        documentHash: row?.document_hash ?? row?.documenthash ?? null,
        status: row?.status || "VALID",
      };
      if (!mapped.uuid || !mapped.verificationId) {
        throw new Error("Verification row was created but ID fields were missing from DB result");
      }
      await conn.commit();
      return mapped;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  finalize: async (publicUuid, documentHash) => {
    const hash = String(documentHash || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      const err = new Error("documentHash must be a SHA-256 hex string (64 chars)");
      err.statusCode = 400;
      throw err;
    }

    const [rows] = await db.query(
      `UPDATE report_verifications
       SET document_hash = ?
       WHERE public_uuid = ?
       RETURNING id, public_uuid, verification_id, report_type,
                 generated_by_label, generated_at, document_hash, status`,
      [hash, publicUuid]
    );
    const row = rows?.[0];
    if (!row) {
      const err = new Error("Verification record not found");
      err.statusCode = 404;
      throw err;
    }
    return {
      uuid: row.public_uuid ?? row.publicuuid,
      verificationId: row.verification_id ?? row.verificationid,
      reportType: row.report_type ?? row.reporttype,
      generatedByLabel: row.generated_by_label ?? row.generatedbylabel,
      generatedAt: row.generated_at ?? row.generatedat,
      documentHash: row.document_hash ?? row.documenthash,
      status: row.status || "VALID",
    };
  },

  findByVerificationId: async (verificationId) => {
    const [rows] = await db.query(
      `SELECT public_uuid, verification_id, report_type, generated_by_label,
              generated_at, document_hash, status
       FROM report_verifications
       WHERE verification_id = ?
       LIMIT 1`,
      [String(verificationId || "").trim()]
    );
    return rows?.[0] || null;
  },
};

module.exports = ReportVerification;
