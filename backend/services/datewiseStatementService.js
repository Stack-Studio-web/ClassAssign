/**
 * Datewise Seating Allotment Report — from saved seating_plans only (owner-scoped).
 * No attendance reads or calculations.
 */
const db = require("../config/db");
const { resolveOwnerOpts } = require("../utils/rbac");
const {
  normalizeTime,
  normalizeDate,
  normalizeRegnKey,
  branchFromRegn,
  sessionLabel,
  examTimeLabel,
  sessionValue,
  parseSessionValue,
  buildHallBranchRows,
  annotateHallFacultyMerge,
  grandTotalStudents,
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

const DatewiseStatementService = {
  /**
   * Distinct exam dates from saved seating plans in the caller's ownership scope.
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
        examTime: examTimeLabel(startTime, endTime),
      });
    }
    return { date, sessions };
  },

  /**
   * Build allotment rows from owner-scoped seating plans for date + session slot.
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

    const meta = {
      date,
      examSession,
      startTime,
      endTime,
      label: sessionLabel(examSession, startTime, endTime),
      examTime: examTimeLabel(startTime, endTime),
    };

    if (!plans?.length) {
      return {
        empty: true,
        meta,
        rows: [],
        grandTotal: 0,
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

    for (const plan of plans) {
      const planId = plan.id;

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
        const hallNo =
          String(venue.venue_name ?? venue.venuename ?? "").trim() || "—";

        let facultyName = String(
          venue.faculty_name ?? venue.facultyname ?? ""
        ).trim();
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

        let regns = flattenLayoutRegns(
          venue.seating_layout_json ?? venue.seatinglayoutjson
        );
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

        const seenReg = new Set();
        for (const r of regns) {
          const k = normalizeRegnKey(r);
          if (!k || seenReg.has(k)) continue;
          seenReg.add(k);
          const branch = branchFromRegn(r);
          studentRows.push({
            hallNo,
            facultyName,
            branch: branch || "—",
            regNo: r,
          });
        }
      }
    }

    const rawRows = buildHallBranchRows(studentRows);
    const rows = annotateHallFacultyMerge(rawRows);
    const grandTotal = grandTotalStudents(rows);

    return {
      empty: rows.length === 0,
      meta: {
        ...meta,
        planCount: plans.length,
        rowCount: rows.length,
        grandTotal,
      },
      rows,
      grandTotal,
      warnings: [],
    };
  },
};

module.exports = DatewiseStatementService;
