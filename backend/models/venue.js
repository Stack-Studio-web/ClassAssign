// Class/backend/models/venue.js — Global venues with Block hierarchy + creator ownership
const db = require("../config/db");
const { andClause, insertOwnership } = require("../utils/ownerFilter");
const Block = require("./Block");

function creatorId(row) {
  if (!row) return null;
  const id = row.owner_user_id ?? row.owneruserid ?? null;
  return id != null ? Number(id) : null;
}

function canManageVenue(user, rowOrCreatorId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const createdBy =
    typeof rowOrCreatorId === "object" && rowOrCreatorId !== null
      ? creatorId(rowOrCreatorId)
      : rowOrCreatorId != null
        ? Number(rowOrCreatorId)
        : null;
  // Legacy (no creator): FI cannot mutate — admin only
  if (createdBy == null || !user.id) return false;
  return Number(createdBy) === Number(user.id);
}

function toVenueRow(row, { canManage = false } = {}) {
  if (!row || typeof row !== "object") return row;
  const benchesRow = Number(row.benchesrow ?? row.benchesRow ?? 0) || 1;
  const benchesCol = Number(row.benchescol ?? row.benchesCol ?? 0) || 1;
  const isAvailable = (row.isavailable ?? row.isAvailable ?? true) !== false;
  const useForAllotment =
    (row.use_for_allotment ?? row.useforallotment ?? row.useForAllotment ?? true) !== false;
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    name: row.name,
    code: row.code || row.name,
    type: row.type,
    capacity: Number(row.capacity ?? 0) || benchesRow * benchesCol * 2,
    benchesRow,
    benchesCol,
    isAvailable,
    /** Alias of isAvailable — global "Use It" enable flag (not date availability). */
    isActive: isAvailable,
    /** Eligible for allotment seating generation (does not reserve a time slot). */
    useForAllotment,
    blockId: row.block_id ?? row.blockid ?? null,
    blockUuid: row.block_uuid ?? row.blockuuid ?? null,
    blockName: row.block_name ?? row.blockname ?? null,
    blockCode: row.block_code ?? row.blockcode ?? null,
    createdByUserId: creatorId(row),
    createdBy: row.creator_username ?? row.creatorusername ?? null,
    canManage: Boolean(canManage),
  };
}

function toSessionRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    date: row.date,
    startTime: row.starttime ?? row.startTime,
    endTime: row.endtime ?? row.endTime,
  };
}

function formatTimeValue(t) {
  if (t == null || t === "") return "";
  if (typeof t === "string") return t.length >= 5 ? t.slice(0, 5) : t;
  if (t instanceof Date) {
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  return String(t).slice(0, 5);
}

const Venue = {
  canManageVenue,
  creatorId,
  toVenueRow,

  create: async (venue, opts = {}) => {
    const {
      name,
      type,
      benchesRow,
      benchesCol,
      benchConfig,
      isAvailable = true,
      useForAllotment = true,
      sessions = [],
      blockId,
      code,
    } = venue;

    const ownership = insertOwnership(opts);
    const capacity =
      benchesRow * benchConfig.reduce((sum, seats) => sum + (Number(seats) || 0), 0);
    const cols = [
      "name",
      "type",
      "capacity",
      "benches_row",
      "benches_col",
      "is_available",
      "use_for_allotment",
      "block_id",
      "code",
    ];
    const vals = [
      name,
      type,
      capacity,
      benchesRow,
      benchesCol,
      isAvailable !== false,
      useForAllotment !== false,
      blockId || null,
      code || name,
    ];
    if (ownership.col) {
      cols.push(
        ...ownership.col
          .replace(/^,\s*/, "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      );
      vals.push(...ownership.params);
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [venueRes] = await conn.query(
        `INSERT INTO venues (${cols.join(", ")})
         VALUES (${cols.map(() => "?").join(", ")})
         RETURNING id`,
        vals
      );

      const venueId = venueRes?.[0]?.id ?? venueRes?.insertId ?? venueRes?.insertid;
      if (venueId == null) {
        throw new Error("Failed to get venue ID from insert");
      }

      for (let colIndex = 0; colIndex < benchConfig.length; colIndex++) {
        const seats = Number(benchConfig[colIndex]) || 2;
        await conn.query(
          `INSERT INTO venue_bench_config
           (venue_id, column_index, seats_per_bench)
           VALUES (?, ?, ?)`,
          [venueId, colIndex, seats]
        );
      }

      for (const s of sessions) {
        await conn.query(
          `INSERT INTO venue_sessions
           (venue_id, session_date, start_time, end_time)
           VALUES (?, ?, ?, ?)`,
          [venueId, s.date, s.startTime, s.endTime]
        );
      }

      await conn.commit();
      return venueId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /**
   * Global venue list (no createdBy / owner filter on visibility).
   * Filters: blockId, blockUuid (resolved by caller), unassignedOnly, search, type.
   */
  getAll: async (opts = {}) => {
    const clauses = [];
    const params = [];

    if (opts.unassignedOnly) {
      clauses.push(`v.block_id IS NULL`);
    } else if (opts.blockId) {
      clauses.push(`v.block_id = ?`);
      params.push(opts.blockId);
    }

    if (opts.type) {
      clauses.push(`LOWER(TRIM(v.type)) = LOWER(TRIM(?))`);
      params.push(opts.type);
    }

    if (opts.search) {
      const q = `%${String(opts.search).trim()}%`;
      clauses.push(`(
        v.name ILIKE ? OR
        COALESCE(v.code, '') ILIKE ? OR
        COALESCE(b.name, '') ILIKE ? OR
        COALESCE(b.code, '') ILIKE ?
      )`);
      params.push(q, q, q, q);
    }

    // Legacy owner-scoped mode when explicitly requested (bulk import undo etc.)
    if (opts.ownerScoped) {
      const { sql: ownerSql, params: ownerParams } = andClause(
        opts.role,
        opts.ownerUserId,
        "v.",
        opts.ownerIds
      );
      if (ownerSql) {
        const frag = ownerSql.replace(/^\s*AND\s+/i, "");
        if (frag && frag !== "1=1") {
          clauses.push(frag);
          params.push(...ownerParams);
        }
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rawVenues] = await db.query(
      `SELECT
        v.id,
        v.public_uuid,
        v.name,
        v.code,
        v.type,
        v.capacity,
        v.benches_row AS benchesRow,
        v.benches_col AS benchesCol,
        v.is_available AS isAvailable,
        COALESCE(v.use_for_allotment, TRUE) AS useForAllotment,
        v.block_id,
        v.owner_user_id,
        u.username AS creator_username,
        b.public_uuid AS block_uuid,
        b.name AS block_name,
        b.code AS block_code
      FROM venues v
      LEFT JOIN blocks b ON b.id = v.block_id
      LEFT JOIN users u ON u.id = v.owner_user_id
      ${where}
      ORDER BY b.name NULLS LAST, v.name ASC`,
      params
    );

    const user = opts.user || {
      id: opts.ownerUserId,
      role: opts.role,
      department: opts.department,
    };

    const venues = [];
    for (const raw of rawVenues || []) {
      const canManage = canManageVenue(user, raw);
      const v = toVenueRow(raw, { canManage });

      const [rawSessions] = await db.query(
        `SELECT
           session_date AS date,
           start_time AS startTime,
           end_time AS endTime
         FROM venue_sessions
         WHERE venue_id = ?`,
        [raw.id]
      );
      v.sessions = (rawSessions || []).map(toSessionRow);

      const [benchConfig] = await db.query(
        `SELECT column_index, seats_per_bench
         FROM venue_bench_config
         WHERE venue_id = ?
         ORDER BY column_index`,
        [raw.id]
      );
      const seatsPerBench = (benchConfig || []).map(
        (b) => Number(b.seats_per_bench ?? b.seatsPerBench ?? 2) || 2
      );
      const cols = v.benchesCol || 1;
      while (seatsPerBench.length < cols) seatsPerBench.push(2);
      v.benchConfig = seatsPerBench;

      venues.push(v);
    }

    return venues;
  },

  findById: async (id) => {
    const [rows] = await db.query(
      `SELECT v.*, u.username AS creator_username,
              b.public_uuid AS block_uuid, b.name AS block_name, b.code AS block_code
       FROM venues v
       LEFT JOIN users u ON u.id = v.owner_user_id
       LEFT JOIN blocks b ON b.id = v.block_id
       WHERE v.id = ?
       LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  },

  /**
   * Time-interval overlap on the same venue + date.
   * Conflict when: existingStart < requestedEnd AND existingEnd > requestedStart
   * (adjacent intervals that only touch at an endpoint are NOT conflicts).
   */
  findSlotConflicts: async (venueId, date, startTime, endTime, executor = db) => {
    const dateOnly = String(date || "").includes("T")
      ? String(date).split("T")[0]
      : String(date || "").trim();
    const start = formatTimeValue(startTime);
    const end = formatTimeValue(endTime);
    if (!venueId || !dateOnly || !start || !end) return [];

    const conflicts = [];
    const seen = new Set();

    const pushConflict = (c) => {
      const key = `${c.startTime}|${c.endTime}|${c.examType || ""}|${c.source || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      conflicts.push(c);
    };

    const [seatingRows] = await executor.query(
      `SELECT
         sp.public_uuid AS plan_uuid,
         sp.exam_date,
         sp.exam_session,
         sp.exam_type,
         sp.exam_start_time,
         sp.exam_end_time,
         spv.venue_name
       FROM seating_plan_venues spv
       JOIN seating_plans sp ON sp.id = spv.seating_plan_id
       WHERE spv.venue_id = ?
         AND sp.exam_date = ?
         AND sp.exam_start_time IS NOT NULL
         AND sp.exam_end_time IS NOT NULL
         AND sp.exam_start_time < ?
         AND sp.exam_end_time > ?
       ORDER BY sp.exam_start_time ASC, sp.id ASC`,
      [venueId, dateOnly, end, start]
    );

    for (const row of seatingRows || []) {
      pushConflict({
        source: "seating_plan",
        planUuid: row.plan_uuid ?? row.planuuid ?? null,
        venueName: row.venue_name ?? row.venuename ?? "",
        startTime: formatTimeValue(row.exam_start_time ?? row.examstarttime),
        endTime: formatTimeValue(row.exam_end_time ?? row.examendtime),
        examType: row.exam_type ?? row.examtype ?? "",
        session: row.exam_session ?? row.examsession ?? "",
        date: dateOnly,
      });
    }

    const [sessionRows] = await executor.query(
      `SELECT session_date, start_time, end_time
       FROM venue_sessions
       WHERE venue_id = ?
         AND session_date = ?
         AND start_time < ?
         AND end_time > ?
       ORDER BY start_time ASC`,
      [venueId, dateOnly, end, start]
    );

    for (const s of sessionRows || []) {
      const sStart = formatTimeValue(s.start_time ?? s.starttime);
      const sEnd = formatTimeValue(s.end_time ?? s.endtime);
      const already = conflicts.some((c) => c.startTime === sStart && c.endTime === sEnd);
      if (already) continue;
      pushConflict({
        source: "venue_session",
        planUuid: null,
        venueName: "",
        startTime: sStart,
        endTime: sEnd,
        examType: "",
        session: "",
        date: dateOnly,
      });
    }

    return conflicts;
  },

  /** Lock venue row so concurrent saves serialize conflict checks. */
  lockForUpdate: async (venueId, executor) => {
    const [rows] = await executor.query(
      `SELECT id, name, is_available, COALESCE(use_for_allotment, TRUE) AS use_for_allotment
       FROM venues WHERE id = ? FOR UPDATE`,
      [venueId]
    );
    return rows?.[0] || null;
  },

  /**
   * Full allotment eligibility + time-slot check for one venue.
   * Returns { ok, status, conflicts, venueName, message }.
   */
  checkAllotmentSlot: async (venueId, date, startTime, endTime, executor = db, opts = {}) => {
    const venueRow = opts.lock
      ? await Venue.lockForUpdate(venueId, executor)
      : await Venue.findById(venueId);
    if (!venueRow) {
      return {
        ok: false,
        status: "NOT_FOUND",
        conflicts: [],
        venueName: "",
        message: "Venue not found",
      };
    }

    const venueName = venueRow.name || "";
    const useIt = (venueRow.is_available ?? venueRow.isavailable ?? true) !== false;
    const useForAllotment =
      (venueRow.use_for_allotment ?? venueRow.useforallotment ?? true) !== false;

    if (!useIt) {
      return {
        ok: false,
        status: "DISABLED",
        conflicts: [],
        venueName,
        message: `${venueName} is disabled (Use It is OFF) and cannot be used for allotment.`,
      };
    }

    if (!useForAllotment) {
      return {
        ok: false,
        status: "NOT_ELIGIBLE",
        conflicts: [],
        venueName,
        message: `${venueName} is not marked Use for Allotment.`,
      };
    }

    const conflicts = await Venue.findSlotConflicts(
      venueId,
      date,
      startTime,
      endTime,
      executor
    );

    if (conflicts.length > 0) {
      const first = conflicts[0];
      const range = `${first.startTime} to ${first.endTime}`;
      const examBit = first.examType ? ` (${first.examType})` : "";
      return {
        ok: false,
        status: "OCCUPIED",
        conflicts,
        venueName,
        message: `${venueName} is already occupied from ${range} on ${String(date).slice(0, 10)}${examBit}.`,
      };
    }

    return {
      ok: true,
      status: "AVAILABLE",
      conflicts: [],
      venueName,
      message: `${venueName} is available for the selected time.`,
    };
  },

  isAvailable: async (venueId, date, startTime, endTime, executor = db) => {
    const conflicts = await Venue.findSlotConflicts(
      venueId,
      date,
      startTime,
      endTime,
      executor
    );
    return conflicts.length === 0;
  },

  existsByNameAndType: async (name, type) => {
    const [rows] = await db.query(
      `SELECT id FROM venues
       WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))
         AND LOWER(TRIM(type)) = LOWER(TRIM(?))
       LIMIT 1`,
      [name, type]
    );
    return (rows || []).length > 0;
  },

  /** Returns raw venue row (with owner) for ownership checks during import. */
  findByNameAndType: async (name, type) => {
    const [rows] = await db.query(
      `SELECT v.*, u.username AS creator_username,
              b.public_uuid AS block_uuid, b.name AS block_name, b.code AS block_code
       FROM venues v
       LEFT JOIN users u ON u.id = v.owner_user_id
       LEFT JOIN blocks b ON b.id = v.block_id
       WHERE UPPER(TRIM(v.name)) = UPPER(TRIM(?))
         AND LOWER(TRIM(v.type)) = LOWER(TRIM(?))
       LIMIT 1`,
      [name, type]
    );
    return rows?.[0] || null;
  },

  existsByNameAndTypeExceptId: async (name, type, id) => {
    const [rows] = await db.query(
      `SELECT id FROM venues
       WHERE name = ? AND type = ? AND id != ?`,
      [name, type, id]
    );
    return rows.length > 0;
  },

  addSession: async (venueId, date, startTime, endTime, executor = db) => {
    await executor.query(
      `INSERT INTO venue_sessions
       (venue_id, session_date, start_time, end_time)
       VALUES (?, ?, ?, ?)`,
      [venueId, date, startTime, endTime]
    );
  },

  removeSession: async (venueId, date, startTime, endTime) => {
    await db.query(
      `DELETE FROM venue_sessions
       WHERE venue_id = ?
       AND session_date = ?
       AND start_time = ?
       AND end_time = ?`,
      [venueId, date, startTime, endTime]
    );
  },

  /**
   * Creator-only (or admin). Updates global "Use It" flag (is_available).
   * This is NOT date-specific schedule availability.
   */
  setAvailability: async (id, isAvailable, user) => {
    const row = await Venue.findById(id);
    if (!row) return false;
    if (!canManageVenue(user, row)) {
      const err = new Error("Only the creator can change Use It for this venue");
      err.statusCode = 403;
      throw err;
    }
    await db.query(
      `UPDATE venues SET is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [isAvailable, id]
    );
    return true;
  },

  /**
   * Creator-only (or admin). Updates "Use for Allotment" eligibility.
   * Does not reserve any date/time slot.
   */
  setUseForAllotment: async (id, useForAllotment, user) => {
    const row = await Venue.findById(id);
    if (!row) return false;
    if (!canManageVenue(user, row)) {
      const err = new Error("Only the creator can change Use for Allotment for this venue");
      err.statusCode = 403;
      throw err;
    }
    await db.query(
      `UPDATE venues SET use_for_allotment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [useForAllotment !== false, id]
    );
    return true;
  },

  /**
   * Date/time schedule availability from seating plans + venue_sessions.
   * With start+end: occupied only if an existing saved allotment overlaps that interval.
   * Without times: lists all booked intervals on that date (venue is not "whole-day blocked").
   */
  getScheduleAvailability: async (venueId, { date, startTime = null, endTime = null } = {}) => {
    const venueRow = await Venue.findById(venueId);
    if (!venueRow) return null;

    const isActive = (venueRow.is_available ?? venueRow.isavailable ?? true) !== false;
    const useForAllotment =
      (venueRow.use_for_allotment ?? venueRow.useforallotment ?? true) !== false;
    const dateOnly = String(date || "").includes("T")
      ? String(date).split("T")[0]
      : String(date || "").trim();

    const conflicts = [];

    if (startTime && endTime) {
      const slotConflicts = await Venue.findSlotConflicts(
        venueId,
        dateOnly,
        startTime,
        endTime
      );
      for (const c of slotConflicts) {
        conflicts.push({
          source: c.source,
          courseCode: "",
          courseName:
            c.source === "seating_plan"
              ? c.examType
                ? `Saved allotment (${c.examType})`
                : "Saved allotment"
              : "Booked session",
          startTime: c.startTime,
          endTime: c.endTime,
          examType: c.examType || "",
          session: c.session || "",
        });
      }

      // Enrich seating_plan conflicts with timetable course labels when possible
      for (const c of conflicts) {
        if (c.source !== "seating_plan" || !c.startTime || !c.endTime || !c.session) continue;
        const [ttRows] = await db.query(
          `SELECT course_code, course_name, exam_type
           FROM timetable
           WHERE date = ?
             AND start_time = ?
             AND end_time = ?
             AND session = ?
           ORDER BY course_code
           LIMIT 5`,
          [dateOnly, c.startTime, c.endTime, c.session]
        );
        if (ttRows?.length) {
          const t = ttRows[0];
          c.courseCode = t.course_code ?? t.coursecode ?? "";
          c.courseName = t.course_name ?? t.coursename ?? c.courseName;
          c.examType = t.exam_type ?? t.examtype ?? c.examType;
        }
      }
    } else {
      // Date-only: list all intervals that day (informational — not whole-day block)
      const [seatingRows] = await db.query(
        `SELECT
           sp.public_uuid AS plan_uuid,
           sp.exam_date,
           sp.exam_session,
           sp.exam_type,
           sp.exam_start_time,
           sp.exam_end_time,
           sp.selected_courses,
           spv.venue_name
         FROM seating_plan_venues spv
         JOIN seating_plans sp ON sp.id = spv.seating_plan_id
         WHERE spv.venue_id = ?
           AND sp.exam_date = ?
         ORDER BY sp.exam_start_time ASC NULLS LAST, sp.id ASC`,
        [venueId, dateOnly]
      );

      for (const row of seatingRows || []) {
        const start = formatTimeValue(row.exam_start_time ?? row.examstarttime);
        const end = formatTimeValue(row.exam_end_time ?? row.examendtime);
        const session = row.exam_session ?? row.examsession ?? "";
        const examType = row.exam_type ?? row.examtype ?? "";
        let courses = [];
        try {
          const raw = row.selected_courses ?? row.selectedcourses;
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (Array.isArray(parsed)) courses = parsed;
        } catch {
          courses = [];
        }

        let ttCourses = [];
        if (start && end && session) {
          const [ttRows] = await db.query(
            `SELECT course_code, course_name, exam_type, start_time, end_time, session
             FROM timetable
             WHERE date = ?
               AND start_time = ?
               AND end_time = ?
               AND session = ?
             ORDER BY course_code`,
            [dateOnly, start, end, session]
          );
          ttCourses = ttRows || [];
        }

        if (ttCourses.length > 0) {
          for (const t of ttCourses) {
            conflicts.push({
              source: "seating_plan",
              courseCode: t.course_code ?? t.coursecode ?? "",
              courseName: t.course_name ?? t.coursename ?? "",
              startTime: formatTimeValue(t.start_time ?? t.starttime) || start,
              endTime: formatTimeValue(t.end_time ?? t.endtime) || end,
              examType: t.exam_type ?? t.examtype ?? examType,
              session,
            });
          }
        } else if (courses.length > 0) {
          for (const c of courses) {
            conflicts.push({
              source: "seating_plan",
              courseCode: c.courseCode || c.course_code || c.code || "",
              courseName: c.courseName || c.course_name || c.name || "",
              startTime: start,
              endTime: end,
              examType,
              session,
            });
          }
        } else {
          conflicts.push({
            source: "seating_plan",
            courseCode: "",
            courseName: examType ? `Saved allotment (${examType})` : "Saved allotment",
            startTime: start,
            endTime: end,
            examType,
            session,
          });
        }
      }

      const [sessionRows] = await db.query(
        `SELECT session_date, start_time, end_time
         FROM venue_sessions
         WHERE venue_id = ?
           AND session_date = ?
         ORDER BY start_time ASC`,
        [venueId, dateOnly]
      );

      for (const s of sessionRows || []) {
        const start = formatTimeValue(s.start_time ?? s.starttime);
        const end = formatTimeValue(s.end_time ?? s.endtime);
        const already = conflicts.some(
          (c) => c.startTime === start && c.endTime === end
        );
        if (already) continue;
        conflicts.push({
          source: "venue_session",
          courseCode: "",
          courseName: "Booked session",
          startTime: start,
          endTime: end,
          examType: "",
          session: "",
        });
      }
    }

    let status = "AVAILABLE";
    if (!isActive) status = "DISABLED";
    else if (startTime && endTime && conflicts.length > 0) status = "OCCUPIED";
    else if (!startTime && !endTime && conflicts.length > 0) {
      // Date-only view: show booked intervals, but do not treat the whole day as blocked
      status = "OCCUPIED";
    }

    return {
      venue: {
        uuid: venueRow.public_uuid ?? venueRow.publicuuid,
        name: venueRow.name,
        code: venueRow.code || venueRow.name,
        type: venueRow.type,
        blockName: venueRow.block_name ?? venueRow.blockname ?? null,
        blockCode: venueRow.block_code ?? venueRow.blockcode ?? null,
        isActive,
        isAvailable: isActive,
        useForAllotment,
      },
      date: dateOnly,
      startTime: startTime || null,
      endTime: endTime || null,
      status,
      available: status === "AVAILABLE",
      conflicts,
      message:
        status === "DISABLED"
          ? `${venueRow.name} is disabled (Use It is OFF).`
          : status === "OCCUPIED" && startTime && endTime
            ? `${venueRow.name} is occupied during the requested time.`
            : status === "OCCUPIED"
              ? `${venueRow.name} has booked time intervals on this date (other times remain available).`
              : `${venueRow.name} is available${
                  startTime && endTime
                    ? ` from ${formatTimeValue(startTime)} to ${formatTimeValue(endTime)}`
                    : " for new allotments on this date"
                }.`,
    };
  },

  updateDetails: async (id, data, user) => {
    const row = await Venue.findById(id);
    if (!row) return false;
    if (!canManageVenue(user, row)) {
      const err = new Error("Only the creator can update this venue");
      err.statusCode = 403;
      throw err;
    }

    const {
      name,
      type,
      benchesRow,
      benchesCol,
      benchConfig,
      blockId,
      code,
      isAvailable,
    } = data;

    const capacity =
      benchesRow * benchConfig.reduce((sum, seats) => sum + (Number(seats) || 0), 0);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE venues
         SET name = ?, type = ?, benches_row = ?, benches_col = ?, capacity = ?,
             block_id = ?, code = ?, is_available = COALESCE(?, is_available),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          name.trim(),
          type.trim(),
          benchesRow,
          benchesCol,
          capacity,
          blockId ?? null,
          code || name.trim(),
          typeof isAvailable === "boolean" ? isAvailable : null,
          id,
        ]
      );

      await conn.query("DELETE FROM venue_bench_config WHERE venue_id = ?", [id]);
      for (let i = 0; i < benchConfig.length; i++) {
        await conn.query(
          "INSERT INTO venue_bench_config (venue_id, column_index, seats_per_bench) VALUES (?, ?, ?)",
          [id, i, benchConfig[i]]
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

  deleteById: async (id, user) => {
    const row = await Venue.findById(id);
    if (!row) return false;
    if (!canManageVenue(user, row)) {
      const err = new Error("Only the creator can delete this venue");
      err.statusCode = 403;
      throw err;
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [usage] = await conn.query(
        "SELECT COUNT(*) as count FROM seating_plan_venues WHERE venue_id = ?",
        [id]
      );
      const usageCount = Number(usage?.[0]?.count ?? usage?.[0]?.COUNT ?? 0);
      if (usageCount > 0) {
        const err = new Error(
          `This venue is linked to ${usageCount} seating plan(s).`
        );
        err.statusCode = 400;
        err.code = "VENUE_IN_USE";
        throw err;
      }
      await conn.query("DELETE FROM venue_bench_config WHERE venue_id = ?", [id]);
      await conn.query("DELETE FROM venue_sessions WHERE venue_id = ?", [id]);
      await conn.query("DELETE FROM venues WHERE id = ?", [id]);
      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  // Used by bulk-import undo — remains owner-scoped intentionally
  deleteByIds: async (ids, opts = {}) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const { sql: ownerSql, params: ownerParams } = andClause(
      opts.role,
      opts.ownerUserId,
      "",
      opts.ownerIds
    );

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      for (const id of ids) {
        await conn.query("DELETE FROM venue_bench_config WHERE venue_id = ?", [id]);
        await conn.query("DELETE FROM venue_sessions WHERE venue_id = ?", [id]);
      }

      await conn.query(
        `DELETE FROM venues WHERE id IN (${ids.map(() => "?").join(",")})${ownerSql}`,
        [...ids, ...ownerParams]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },
};

module.exports = Venue;
