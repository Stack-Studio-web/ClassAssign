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
    const plans = await db.query(`SELECT id FROM seating_plans WHERE id = ?`, [planId]);
    const [rows] = plans;
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
};

module.exports = DependencyChecks;
