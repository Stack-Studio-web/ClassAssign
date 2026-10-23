/**
 * Datewise Attendance Statement — built from saved seating_plans (owner-scoped)
 * plus persisted attendance (Present/Absent) for absentee counts.
 */
const db = require("../config/db");
const { resolveOwnerOpts } = require("../utils/rbac");
const {
  normalizeTime,
  normalizeDate,
  normalizeRegnKey,
  sessionLabel,
  sessionValue,
  parseSessionValue,
  buildHallBranchRows,
  flattenLayoutRegns,
} = require("../utils/datewiseStatementHelpers");

function seatingOwnerScope(opts = {}, alias = "sp") {
  const ids =
    (opts.ownerIds && opts.ownerIds.length > 0 && opts.ownerIds) || null;
  if (opts.role === "admin") {
    return { sql: "", params: [] };
  }
  if (ids && ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    return {
      sql: ` AND ${alias}.owner_user_id IN (${placeholders})`,
      params: ids,
    };
  }
  const uid = opts.ownerUserId ?? opts.userId ?? null;
  if (!uid) return { sql: " AND 1=0", params: [] };
  return { sql: ` AND ${alias}.owner_user_id = ?`, params: [uid] };
}

function formatExamTimeRange(startTime, endTime) {
  const s = normalizeTime(startTime);
  const e = normalizeTime(endTime);
  if (s && e) return `${s} - ${e}`;
  return "";
}

async function findExistingExamIds(plan) {
  const examDate = normalizeDate(plan.exam_date ?? plan.examdate);
  const examSession = String(plan.exam_session ?? plan.examsession ?? "").trim();
  const startTime = plan.exam_start_time ?? plan.examstarttime;
  const endTime = plan.exam_end_time ?? plan.examendtime;
  const examTimeStr = formatExamTimeRange(startTime, endTime);
  const ids = new Set();

  if (examDate && examSession && examTimeStr) {
    const [rows] = await db.query(
      `SELECT id FROM exams
       WHERE exam_date = ? AND exam_session = ? AND exam_time = ?`,
      [examDate, examSession, examTimeStr]
    );
    for (const r of rows || []) {
      if (r.id != null) ids.add(Number(r.id));
    }
  }

  // Also match exams linked via faculty_assignments on plan venues + date
  const planId = plan.id ?? plan._id;
  if (planId && examDate) {
    const [rows] = await db.query(
      `SELECT DISTINCT fa.exam_id AS id
       FROM seating_plan_venues spv
       JOIN faculty_assignments fa
         ON fa.venue_id = spv.venue_id
        AND fa.assigned_date = ?
       WHERE spv.seating_plan_id = ?
         AND fa.exam_id IS NOT NULL`,
      [examDate, planId]
    );
    for (const r of rows || []) {
      if (r.id != null) ids.add(Number(r.id));
    }
  }

  return [...ids];
}

const DatewiseStatementService = {
  helpers: {
    normalizeTime,
    normalizeDate,
    sessionLabel,
    sessionValue,
    parseSessionValue,
    buildHallBranchRows,
    formatRollDisplay: require("../utils/datewiseStatementHelpers").formatRollDisplay,
  },

  /**
   * Distinct exam dates from saved seating plans owned by the requester's scope.
   */
  getDates: async (req) => {
    const opts = await resolveOwnerOpts(req);
    const scope = seatingOwnerScope(opts, "sp");
    const [rows] = await db.query(
      `SELECT DISTINCT to_char(sp.exam_date, 'YYYY-MM-DD') AS exam_date
       FROM seating_plans sp
       WHERE sp.exam_date IS NOT NULL${scope.sql}
       ORDER BY 1 DESC`,
      scope.params
    );
    const dates = (rows || [])
      .map((r) => normalizeDate(r.exam_date ?? r.examdate))
      .filter(Boolean);
    return { dates };
  },

  /**
   * Distinct sessions (label + start/end) for a date from saved seating plans.
   */
  getSessions: async (req, dateInput) => {
    const date = normalizeDate(dateInput);
    if (!date) {
      const err = new Error("date is required");
      err.statusCode = 400;
      throw err;
    }
    const opts = await resolveOwnerOpts(req);
    const scope = seatingOwnerScope(opts, "sp");
    const [rows] = await db.query(
      `SELECT DISTINCT
         sp.exam_session,
         sp.exam_start_time,
         sp.exam_end_time
       FROM seating_plans sp
       WHERE sp.exam_date = ?${scope.sql}
       ORDER BY sp.exam_start_time ASC NULLS LAST, sp.exam_session ASC`,
      [date, ...scope.params]
    );

    const seen = new Set();
    const sessions = [];
    for (const r of rows || []) {
      const examSession = String(r.exam_session ?? r.examsession ?? "").trim();
      const startTime = normalizeTime(r.exam_start_time ?? r.examstarttime);
      const endTime = normalizeTime(r.exam_end_time ?? r.examendtime);
      const value = sessionValue(examSession, startTime, endTime);
      if (seen.has(value)) continue;
      seen.add(value);
      sessions.push({
        value,
        examSession,
        startTime,
        endTime,
        label: sessionLabel(examSession, startTime, endTime),
      });
    }
    return { date, sessions };
  },

  /**
   * Build statement rows for owner-scoped plans matching date + session slot.
   */
  getStatement: async (req, filters = {}) => {
    const date = normalizeDate(filters.date);
    let examSession = String(filters.session || filters.examSession || "").trim();
    let startTime = normalizeTime(filters.startTime || filters.start_time);
    let endTime = normalizeTime(filters.endTime || filters.end_time);

    if (filters.sessionValue || (examSession.includes("|") && !startTime)) {
      const parsed = parseSessionValue(filters.sessionValue || examSession);
      examSession = parsed.examSession;
      startTime = startTime || parsed.startTime;
      endTime = endTime || parsed.endTime;
    }

    if (!date) {
      const err = new Error("date is required");
      err.statusCode = 400;
      throw err;
    }
    if (!examSession) {
      const err = new Error("session is required");
      err.statusCode = 400;
      throw err;
    }
    if (!startTime || !endTime) {
      const err = new Error("session start and end times are required");
      err.statusCode = 400;
      throw err;
    }

    const opts = await resolveOwnerOpts(req);
    const scope = seatingOwnerScope(opts, "sp");

    const [plans] = await db.query(
      `SELECT
         sp.id,
         sp.public_uuid,
         sp.exam_date,
         sp.exam_session,
         sp.exam_type,
         sp.exam_start_time,
         sp.exam_end_time,
         sp.owner_user_id
       FROM seating_plans sp
       WHERE sp.exam_date = ?
         AND UPPER(TRIM(sp.exam_session)) = UPPER(TRIM(?))
         AND sp.exam_start_time = ?::time
         AND sp.exam_end_time = ?::time
         ${scope.sql}
       ORDER BY sp.id ASC`,
      [date, examSession, startTime, endTime, ...scope.params]
    );

    if (!plans?.length) {
      return {
        empty: true,
        attendanceIncomplete: false,
        meta: {
          date,
          examSession,
          startTime,
          endTime,
          label: sessionLabel(examSession, startTime, endTime),
        },
        rows: [],
        warnings: [
          {
            type: "NO_PLANS",
            message:
              "No saved seating reports found for this date and session under your account.",
          },
        ],
      };
    }

    const studentRows = [];
    const missingAttendanceVenues = [];
    const warnings = [];

    for (const plan of plans) {
      const planId = plan.id;
      const examIds = await findExistingExamIds(plan);

      const [venues] = await db.query(
        `SELECT
           spv.id AS seating_plan_venue_id,
           spv.venue_id,
           COALESCE(spv.venue_name, v.name) AS venue_name,
           spv.seating_layout_json,
           spv.faculty_id,
           f.name AS faculty_name
         FROM seating_plan_venues spv
         LEFT JOIN venues v ON v.id = spv.venue_id
         LEFT JOIN faculty f ON f.id = spv.faculty_id
         WHERE spv.seating_plan_id = ?
         ORDER BY COALESCE(spv.display_order, 0), spv.id`,
        [planId]
      );

      for (const venue of venues || []) {
        const venueId = venue.venue_id ?? venue.venueid;
        const hallNo = String(venue.venue_name ?? venue.venuename ?? "").trim() || "—";

        // Multi-faculty names from junction table
        let facultyName = String(venue.faculty_name ?? venue.facultyname ?? "").trim();
        const spvId = venue.seating_plan_venue_id ?? venue.seatingplanvenueid;
        if (spvId) {
          const [fm] = await db.query(
            `SELECT f.name
             FROM seating_plan_venue_faculty spvf
             JOIN faculty f ON f.id = spvf.faculty_id
             WHERE spvf.seating_plan_venue_id = ?
             ORDER BY spvf.display_order, spvf.id`,
            [spvId]
          );
          if (fm?.length) {
            facultyName = fm.map((r) => r.name).filter(Boolean).join(", ");
          }
        }
        if (!facultyName) facultyName = "—";

        // Distinct reg numbers from layout (preferred) or seating_arrangements
        let regns = flattenLayoutRegns(venue.seating_layout_json ?? venue.seatinglayoutjson);
        if (!regns.length && spvId) {
          const [arr] = await db.query(
            `SELECT DISTINCT regn_no
             FROM seating_arrangements
             WHERE seating_plan_venue_id = ?
               AND regn_no IS NOT NULL
               AND TRIM(regn_no) <> ''
               AND regn_no <> '-'
               AND regn_no <> '0'`,
            [spvId]
          );
          regns = (arr || [])
            .map((r) => String(r.regn_no ?? r.regnno ?? "").trim())
            .filter(Boolean);
        }

        // Deduplicate
        const seenReg = new Set();
        const distinctRegns = [];
        for (const r of regns) {
          const k = normalizeRegnKey(r);
          if (!k || seenReg.has(k)) continue;
          seenReg.add(k);
          distinctRegns.push(r);
        }

        // Department/branch from students table (match normalized regn keys)
        const branchByRegn = new Map();
        if (distinctRegns.length) {
          const keys = distinctRegns.map((r) => normalizeRegnKey(r));
          const placeholders = keys.map(() => "?").join(",");
          const [stuRows] = await db.query(
            `SELECT regn_no, department
             FROM students
             WHERE LOWER(REPLACE(TRIM(regn_no), ' ', '')) IN (${placeholders})`,
            keys
          );
          for (const s of stuRows || []) {
            const rk = normalizeRegnKey(s.regn_no ?? s.regnno);
            if (!rk) continue;
            branchByRegn.set(rk, String(s.department || "").trim() || "—");
          }
        }

        for (const regNo of distinctRegns) {
          const rk = normalizeRegnKey(regNo);
          studentRows.push({
            hallNo,
            facultyName,
            branch: branchByRegn.get(rk) || "—",
            regNo,
            venueId,
            planId,
          });
        }

        // Attendance readiness for this venue
        let attendanceCount = 0;
        const attendanceByRegnKey = new Map();
        if (venueId && examIds.length) {
          const examPlaceholders = examIds.map(() => "?").join(",");
          const [attCountRows] = await db.query(
            `SELECT COUNT(*)::int AS cnt
             FROM attendance a
             WHERE a.venue_id = ?
               AND a.exam_id IN (${examPlaceholders})`,
            [venueId, ...examIds]
          );
          attendanceCount = Number(attCountRows?.[0]?.cnt ?? 0) || 0;

          if (attendanceCount > 0) {
            const [attRows] = await db.query(
              `SELECT a.status, s.regn_no
               FROM attendance a
               JOIN students s ON s.id = a.student_id
               WHERE a.venue_id = ?
                 AND a.exam_id IN (${examPlaceholders})`,
              [venueId, ...examIds]
            );
            for (const a of attRows || []) {
              const rk = normalizeRegnKey(a.regn_no ?? a.regnno);
              if (!rk) continue;
              const status = String(a.status || "").trim();
              if (status === "Absent" || status === "Present") {
                // Prefer Absent if any row says Absent (should be unique per student+exam+venue)
                if (attendanceByRegnKey.get(rk) !== "Absent") {
                  attendanceByRegnKey.set(rk, status);
                }
              }
            }
          }
        }

        if (!venueId || examIds.length === 0 || attendanceCount === 0) {
          missingAttendanceVenues.push(hallNo);
        } else {
          // Attach per-venue attendance map onto students of this venue for grouping later
          for (const s of studentRows) {
            if (s.venueId === venueId && s.planId === planId) {
              s._attendanceByRegnKey = attendanceByRegnKey;
              s._venueAttendanceReady = true;
            }
          }
        }
      }
    }

    const attendanceIncomplete = missingAttendanceVenues.length > 0;
    if (attendanceIncomplete) {
      warnings.push({
        type: "ATTENDANCE_MISSING",
        message: `Attendance has not been submitted (or no records found) for hall(s): ${[
          ...new Set(missingAttendanceVenues),
        ].join(", ")}. Absentee counts cannot be reported until attendance is marked.`,
        halls: [...new Set(missingAttendanceVenues)],
      });
    }

    // Build rows per hall+branch. When attendance incomplete, still show student totals
    // but leave totalAbsentees null.
    // Group by hall+branch across all students; use attendance only when ready for that venue.
    const byHallBranch = new Map();
    for (const s of studentRows) {
      const hallNo = s.hallNo;
      const branch = s.branch;
      const key = `${hallNo}::${branch}`;
      if (!byHallBranch.has(key)) {
        byHallBranch.set(key, {
          hallNo,
          name: s.facultyName,
          branch,
          rolls: [],
          rollKeys: new Set(),
          attendanceByRegnKey: s._attendanceByRegnKey || new Map(),
          venueAttendanceReady: Boolean(s._venueAttendanceReady),
        });
      }
      const g = byHallBranch.get(key);
      const rk = normalizeRegnKey(s.regNo);
      if (!rk || g.rollKeys.has(rk)) continue;
      g.rollKeys.add(rk);
      g.rolls.push(s.regNo);
      if (s._venueAttendanceReady) {
        g.venueAttendanceReady = true;
        if (s._attendanceByRegnKey) {
          for (const [k, v] of s._attendanceByRegnKey.entries()) {
            if (g.attendanceByRegnKey.get(k) !== "Absent") {
              g.attendanceByRegnKey.set(k, v);
            }
          }
        }
      }
      if (s.facultyName && g.name === "—") g.name = s.facultyName;
    }

    const rows = [];
    for (const g of byHallBranch.values()) {
      const built = buildHallBranchRows(
        g.rolls.map((regNo) => ({
          hallNo: g.hallNo,
          facultyName: g.name,
          branch: g.branch,
          regNo,
        })),
        {
          attendanceByRegnKey: g.attendanceByRegnKey,
          venueAttendanceReady: g.venueAttendanceReady,
        }
      );
      rows.push(...built);
    }
    rows.sort(
      (a, b) =>
        String(a.hallNo).localeCompare(String(b.hallNo)) ||
        String(a.branch).localeCompare(String(b.branch))
    );

    const empty = rows.length === 0;

    return {
      empty,
      attendanceIncomplete,
      meta: {
        date,
        examSession,
        startTime,
        endTime,
        label: sessionLabel(examSession, startTime, endTime),
        planCount: plans.length,
        rowCount: rows.length,
      },
      rows,
      warnings,
    };
  },
};

module.exports = DatewiseStatementService;
