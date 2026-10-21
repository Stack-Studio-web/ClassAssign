const db = require("../config/db");

async function countQuery(sql, params) {
  const [rows] = await db.query(sql, params);
  const r = rows?.[0] || {};
  return Number(r.count ?? r.cnt ?? r.COUNT ?? r.CNT ?? 0) || 0;
}

const DependencyChecks = {
  /**
   * Faculty removal is soft-delete (is_active=false). Historical seating/attendance
   * stay linked to the faculty row, so assignment presence must NOT block removal.
   */
  async facultyDeleteBlockers(_facultyId) {
    return { blocked: false };
  },

  async studentDeleteBlockers(studentId) {
    const [students] = await db.query(
      `SELECT id, regn_no FROM students WHERE id = ?`,
      [studentId]
    );
    if (!students?.length) return { blocked: false, notFound: true };

    const regnNo = students[0].regn_no ?? students[0].regnno;
    const seatingCount = await countQuery(
      `SELECT COUNT(*) AS count FROM seating_plan_students WHERE regn_no = ?`,
      [regnNo]
    );
    if (seatingCount > 0) {
      return {
        blocked: true,
        code: "STUDENT_ALLOTTED",
        message: "Cannot delete student.",
        details:
          "This student is included in one or more seating plans. Remove them from seating before deleting.",
        count: seatingCount,
      };
    }

    const lockedAttendance = await countQuery(
      `SELECT COUNT(*) AS count FROM attendance WHERE student_id = ? AND is_locked = TRUE`,
      [studentId]
    );
    if (lockedAttendance > 0) {
      return {
        blocked: true,
        code: "STUDENT_ATTENDANCE_LOCKED",
        message: "Cannot delete student.",
        details:
          "This student has locked attendance records. Unlock or archive attendance before deleting.",
        count: lockedAttendance,
      };
    }

    return { blocked: false };
  },

  async userDeleteBlockers(userId) {
    const ownedTables = [
      { table: "students", label: "student records" },
      { table: "faculty", label: "faculty records" },
      { table: "venues", label: "venue records" },
      { table: "seating_plans", label: "seating plans" },
      { table: "exams", label: "exam records" },
      { table: "timetable", label: "timetable entries" },
      { table: "ineligible_students", label: "ineligibility records" },
    ];

    for (const { table, label } of ownedTables) {
      const ownedCount = await countQuery(
        `SELECT COUNT(*) AS count FROM ${table} WHERE owner_user_id = ?`,
        [userId]
      );
      if (ownedCount > 0) {
        return {
          blocked: true,
          code: "USER_OWNS_DATA",
          message: "Cannot delete user.",
          details: `This user owns ${ownedCount} ${label}. Transfer or delete that data first.`,
          count: ownedCount,
        };
      }
    }

    const batchCount = await countQuery(
      `SELECT COUNT(*) AS count FROM batches WHERE owner_user_id = ?`,
      [userId]
    );
    if (batchCount > 0) {
      return {
        blocked: true,
        code: "USER_OWNS_DATA",
        message: "Cannot delete user.",
        details: `This user owns ${batchCount} batch records. Transfer or delete those batches first.`,
        count: batchCount,
      };
    }

    return { blocked: false };
  },

  async timetableDeleteBlockers(scheduleId) {
    const [rows] = await db.query(
      `SELECT course_code, department, date, exam_type FROM timetable WHERE id = ?`,
      [scheduleId]
    );
    if (!rows?.length) return { blocked: false, notFound: true };

    const s = rows[0];
    const courseCode = s.course_code ?? s.coursecode;
    const examDate = s.date ?? s.examdate ?? s.exam_date;

    const planCount = await countQuery(
      `SELECT COUNT(*) AS count FROM seating_plans sp
       WHERE sp.exam_date = ?
         AND sp.selected_courses::text ILIKE ?`,
      [examDate, `%${courseCode}%`]
    );
    if (planCount > 0) {
      return {
        blocked: true,
        code: "TIMETABLE_IN_USE",
        message: "Cannot delete timetable entry.",
        details:
          "This schedule is referenced by a seating plan. Delete the seating plan first.",
        count: planCount,
      };
    }
    return { blocked: false };
  },

  async seatingPlanDeleteBlockers(planId) {
    const [rows] = await db.query(`SELECT id FROM seating_plans WHERE id = ?`, [planId]);
    if (!rows?.length) return { blocked: false, notFound: true };

    const venues = await db.query(
      `SELECT spv.venue_id, sp.exam_date, sp.exam_start_time, sp.exam_end_time
       FROM seating_plan_venues spv
       JOIN seating_plans sp ON sp.id = spv.seating_plan_id
       WHERE spv.seating_plan_id = ?`,
      [planId]
    );
    const venueRows = venues[0] || [];

    for (const v of venueRows) {
      const venueId = v.venue_id ?? v.venueid;
      const locked = await countQuery(
        `SELECT COUNT(*) AS count FROM attendance att
         JOIN exams e ON e.id = att.exam_id
         WHERE att.venue_id = ? AND att.is_locked = TRUE AND e.exam_date = ?`,
        [venueId, v.exam_date ?? v.examdate]
      );
      if (locked > 0) {
        return {
          blocked: true,
          code: "ATTENDANCE_LOCKED",
          message: "Cannot delete seating plan.",
          details:
            "Attendance has been submitted and locked for this plan. Unlock attendance before deleting.",
          count: locked,
        };
      }
    }
    return { blocked: false };
  },

  async facultyIdsWithBlockers(ids) {
    const blocked = [];
    for (const id of ids) {
      const check = await DependencyChecks.facultyDeleteBlockers(id);
      if (check.blocked) blocked.push({ id, ...check });
    }
    return blocked;
  },

  async studentIdsWithBlockers(ids) {
    const blocked = [];
    for (const id of ids) {
      const check = await DependencyChecks.studentDeleteBlockers(id);
      if (check.blocked) blocked.push({ id, ...check });
    }
    return blocked;
  },

  /**
   * Venue archival is blocked while any seating-plan report that used the venue
   * is still ACTIVE (not COMPLETED), or a LAB exam on the venue is still open
   * (not completed / not yet finalized into a completed report).
   */
  async venueArchiveBlockers(venueId) {
    const id = Number(venueId);
    if (!Number.isFinite(id) || id <= 0) {
      return { blocked: false, notFound: true };
    }

    const [venueRows] = await db.query(`SELECT id, name FROM venues WHERE id = ? LIMIT 1`, [id]);
    if (!venueRows?.length) return { blocked: false, notFound: true };

    const [openPlans] = await db.query(
      `SELECT sp.id,
              sp.public_uuid,
              sp.exam_date,
              COALESCE(sp.report_status, 'ACTIVE') AS report_status,
              COALESCE(sp.plan_kind, 'hall') AS plan_kind,
              COALESCE(spv.venue_name, v.name) AS venue_name
       FROM seating_plan_venues spv
       JOIN seating_plans sp ON sp.id = spv.seating_plan_id
       LEFT JOIN venues v ON v.id = spv.venue_id
       WHERE spv.venue_id = ?
         AND UPPER(COALESCE(sp.report_status, 'ACTIVE')) <> 'COMPLETED'
       ORDER BY sp.exam_date DESC, sp.id DESC
       LIMIT 20`,
      [id]
    );

    if (Array.isArray(openPlans) && openPlans.length > 0) {
      const sample = openPlans
        .slice(0, 3)
        .map((p) => {
          const date = p.exam_date ?? p.examdate ?? "";
          const kind = String(p.plan_kind ?? p.plankind ?? "hall").toUpperCase();
          return `${kind} ${date}`.trim();
        })
        .filter(Boolean)
        .join(", ");
      return {
        blocked: true,
        code: "VENUE_REPORTS_PENDING",
        message: "Cannot archive venue while exam reports are incomplete.",
        details: sample
          ? `${openPlans.length} seating plan report(s) are still active (not completed), including: ${sample}. Complete those reports before archiving.`
          : `${openPlans.length} seating plan report(s) are still active (not completed). Complete those reports before archiving.`,
        count: openPlans.length,
        pendingPlans: openPlans.map((p) => ({
          uuid: p.public_uuid ?? p.publicuuid ?? null,
          examDate: p.exam_date ?? p.examdate ?? null,
          reportStatus: p.report_status ?? p.reportstatus ?? "ACTIVE",
          planKind: p.plan_kind ?? p.plankind ?? "hall",
        })),
      };
    }

    // LAB drafts / in-progress exams that have not produced a completed seating report yet
    try {
      const [openLabs] = await db.query(
        `SELECT le.id,
                le.public_uuid,
                le.title,
                le.exam_date,
                le.status
         FROM lab_slot_venues lsv
         JOIN lab_exam_slots les ON les.id = lsv.lab_slot_id
         JOIN lab_exams le ON le.id = les.lab_exam_id
         WHERE lsv.venue_id = ?
           AND LOWER(COALESCE(le.status, 'draft')) <> 'completed'
           AND (
             les.seating_plan_id IS NULL
             OR EXISTS (
               SELECT 1 FROM seating_plans sp
               WHERE sp.id = les.seating_plan_id
                 AND UPPER(COALESCE(sp.report_status, 'ACTIVE')) <> 'COMPLETED'
             )
           )
         GROUP BY le.id, le.public_uuid, le.title, le.exam_date, le.status
         ORDER BY le.exam_date DESC, le.id DESC
         LIMIT 20`,
        [id]
      );
      if (Array.isArray(openLabs) && openLabs.length > 0) {
        const sample = openLabs
          .slice(0, 3)
          .map((l) => `${l.title || "LAB"} (${l.exam_date ?? l.examdate ?? l.status})`)
          .join(", ");
        return {
          blocked: true,
          code: "VENUE_LAB_REPORTS_PENDING",
          message: "Cannot archive venue while LAB exam work is incomplete.",
          details: `${openLabs.length} LAB exam(s) still use this venue and are not fully completed, including: ${sample}.`,
          count: openLabs.length,
        };
      }
    } catch (err) {
      // lab_exams tables may be absent on older DBs — seating-plan check above is enough
      if (!/relation .* does not exist/i.test(String(err.message || ""))) {
        console.warn("venueArchiveBlockers lab check:", err.message);
      }
    }

    return { blocked: false };
  },
};

module.exports = DependencyChecks;
