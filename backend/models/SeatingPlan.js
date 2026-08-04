// Class/backend/models/SeatingPlan.js
const db = require("../config/db");
const { andClause, whereClause, insertField } = require("../utils/ownerFilter");
const {
  normalizeBenchConfig,
  flattenArrangementForStorage,
  hydrateArrangementFromRows,
} = require("../utils/seatingLayout");

// Keep seat array shape but avoid null objects that crash older frontend bundles.
function toClientSafeLayout(layout) {
  if (!Array.isArray(layout)) return [];
  return layout.map((row) => {
    if (!Array.isArray(row)) return [];
    return row.map((cell) => {
      if (cell === "Empty" || !cell) return "Empty";
      if (!Array.isArray(cell)) return cell;
      return cell.map((seat) => (seat == null ? { regn_no: "", course: null } : seat));
    });
  });
}

const SeatingPlan = {

  /* ===============================
      CREATE SEATING PLAN
  =============================== */
  createPlan: async (planData, opts = {}, externalConn = null) => {
    const {
      examDate,
      examSession,
      examType,
      examStartTime,
      examEndTime,
      selectedCourses,
      students = [],
      venuesUsed = [],
      facultyMode = "AUTO",
    } = planData;

    const { col, val } = insertField(opts.role, opts.ownerUserId);
    const vals = [
      examDate,
      examSession,
      examType,
      examStartTime,
      examEndTime,
      JSON.stringify(selectedCourses),
      facultyMode,
    ];
    if (val != null) vals.push(val);

    const conn = externalConn || (await db.getConnection());
    const ownsTxn = !externalConn;
    try {
      if (ownsTxn) await conn.beginTransaction();

      // 1️⃣ Insert into seating_plans
      const [planResult] = await conn.query(
        `INSERT INTO seating_plans 
         (exam_date, exam_session, exam_type, exam_start_time, exam_end_time, selected_courses, faculty_mode${col}) 
         VALUES (?, ?, ?, ?, ?, ?, ?${val != null ? ", ?" : ""})`,
        vals
      );

      const seatingPlanId = planResult.insertId;

      // 2️⃣ Insert students
      if (students.length > 0) {
        const studentValues = students.map(s => [
          seatingPlanId,
          s.regnNo ?? null,
          s.studentName ?? "",
          s.courseDescription ?? null,
          s.examCode ?? examType ?? null
        ]);

        await conn.query(
          `INSERT INTO seating_plan_students 
           (seating_plan_id, regn_no, student_name, course_description, exam_code) 
           VALUES ?`,
          [studentValues]
        );
      }

      // 3️⃣ Insert venues and detailed seating grid
      for (let orderIdx = 0; orderIdx < venuesUsed.length; orderIdx++) {
        const venue = venuesUsed[orderIdx];
        // ✅ CRITICAL FIX: Save benchConfig to database
        const benchConfigJson = venue.benchConfig ? JSON.stringify(venue.benchConfig) : null;
        
        const [venueRes] = await conn.query(
          `INSERT INTO seating_plan_venues 
           (seating_plan_id, venue_id, venue_name, display_order, bench_config, seating_layout_json, faculty_id) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            seatingPlanId,
            venue.venueId,
            venue.venueName,
            orderIdx,
            benchConfigJson,  // ✅ NEW: Save benchConfig
            JSON.stringify(venue.seatingArrangement || []),
            venue.facultyId || null
          ]
        );

        const seatingPlanVenueId = venueRes.insertId ?? venueRes.insertid;
        if (seatingPlanVenueId == null) {
          throw new Error(`Failed to get venue ID for ${venue.venueName || venue.venueId}`);
        }

        // Insert seating grid (2D arrangement)
        if (Array.isArray(venue.seatingArrangement)) {
          const benchConfig = normalizeBenchConfig(
            venue.benchConfig,
            venue.seatingArrangement?.[0]?.length || 0
          );
          const arrangementEntries = flattenArrangementForStorage(
            venue.seatingArrangement,
            benchConfig
          ).map(([r, c, seatIndex, regNo]) => [
            seatingPlanVenueId,
            r,
            c,
            seatIndex,
            regNo,
          ]);

          if (arrangementEntries.length > 0) {
            await conn.query(
              `INSERT INTO seating_arrangements 
               (seating_plan_venue_id, seat_row, seat_col, seat_index, regn_no) 
               VALUES ?`,
              [arrangementEntries]
            );
          }
        }
      }

      if (ownsTxn) await conn.commit();
      return seatingPlanId;

    } catch (err) {
      if (ownsTxn) await conn.rollback();
      throw err;
    } finally {
      if (ownsTxn) conn.release();
    }
  },

  /* ===============================
      GET ALL SEATING PLANS
  =============================== */
  getAllPlans: async (opts = {}) => {
    let ownerSql = "";
    let ownerParams = [];
    if (opts.hodAllowedOwnerIds && opts.hodAllowedOwnerIds.length > 0) {
      const placeholders = opts.hodAllowedOwnerIds.map(() => "?").join(",");
      ownerSql = ` WHERE owner_user_id IN (${placeholders})`;
      ownerParams = opts.hodAllowedOwnerIds;
    } else {
      const clause = whereClause(opts.role, opts.ownerUserId);
      ownerSql = clause.sql;
      ownerParams = clause.params;
    }

    // Always start with a WHERE (admins have empty ownerSql), then AND status filters.
    const baseWhere = ownerSql || " WHERE 1=1";
    const status = String(opts.status || "all").toLowerCase();
    let statusSql = "";
    if (status === "active") {
      statusSql = " AND COALESCE(report_status, 'ACTIVE') = 'ACTIVE'";
    } else if (status === "completed") {
      statusSql = " AND report_status = 'COMPLETED'";
    }

    const [rows] = await db.query(`
      SELECT 
        id AS _id,
        public_uuid,
        exam_date,
        exam_session,
        exam_type,
        exam_start_time,
        exam_end_time,
        selected_courses,
        faculty_mode,
        COALESCE(report_status, 'ACTIVE') AS report_status,
        completed_at,
        created_at
      FROM seating_plans${baseWhere}${statusSql}
      ORDER BY exam_date DESC, created_at DESC
    `, ownerParams);

    const plans = [];

    for (let row of rows) {
      const planId = row._id ?? row.id;
      const plan = {
        uuid: row.public_uuid ?? row.publicuuid,
        examDate: row.exam_date ?? row.examdate,
        examSession: row.exam_session ?? row.examsession,
        examType: row.exam_type ?? row.examtype,
        examStartTime: row.exam_start_time ?? row.examstarttime,
        examEndTime: row.exam_end_time ?? row.examendtime,
        facultyMode: row.faculty_mode ?? row.facultymode,
        reportStatus: row.report_status ?? row.reportstatus ?? "ACTIVE",
        completedAt: row.completed_at ?? row.completedat ?? null,
        createdAt: row.created_at ?? row.createdat,
        selectedCourses: (() => {
          const sc = row.selected_courses ?? row.selectedcourses;
          return typeof sc === "string" ? JSON.parse(sc) : sc;
        })(),
        venuesUsed: []
      };

      // ✅ Fetch venues WITH benchConfig
      const [venues] = await db.query(`
        SELECT 
          spv.id as internalId,
          v.public_uuid as venueUuid,
          spv.venue_id as venueId,
          spv.venue_name as venueName,
          spv.display_order as displayOrder,
          spv.bench_config as benchConfig,
          spv.seating_layout_json as seatingLayoutJson,
          f.name as facultyName,
          f.department as facultyDepartment
        FROM seating_plan_venues spv
        LEFT JOIN venues v ON spv.venue_id = v.id
        LEFT JOIN faculty f ON spv.faculty_id = f.id
        WHERE spv.seating_plan_id = ?
        ORDER BY COALESCE(spv.display_order, 0), spv.id
      `, [planId]);

      // ✅ Build a course lookup map from seating_plan_students for this plan
      const [planStudents] = await db.query(`
        SELECT regn_no, course_description
        FROM seating_plan_students
        WHERE seating_plan_id = ?
      `, [planId]);

      const studentCourseMap = new Map();
      (planStudents || []).forEach(s => {
        const regn = s.regn_no ?? s.regnno;
        const desc = s.course_description ?? s.coursedescription;
        if (regn) studentCourseMap.set(regn, desc);
      });

      for (let v of venues || []) {
        const internalId = v.internalId ?? v.internalid ?? v.id;
        const benchConfigRaw = v.benchConfig ?? v.benchconfig;
        const seatingLayoutRaw = v.seatingLayoutJson ?? v.seatinglayoutjson;
        if (benchConfigRaw) {
          try {
            v.benchConfig = typeof benchConfigRaw === 'string' 
              ? JSON.parse(benchConfigRaw) 
              : benchConfigRaw;
          } catch (e) {
            console.error('Error parsing benchConfig:', e);
            v.benchConfig = null;
          }
        }
        v.venueName = v.venueName ?? v.venuename ?? v.venue_name;
        if (v.venueUuid ?? v.venueuuid) {
          v.uuid = v.venueUuid ?? v.venueuuid;
        }
        delete v.venueId;
        delete v.venueUuid;
        delete v.internalId;
        if (seatingLayoutRaw) {
          try {
            const parsedLayout = typeof seatingLayoutRaw === "string"
              ? JSON.parse(seatingLayoutRaw)
              : seatingLayoutRaw;
            if (Array.isArray(parsedLayout)) {
              v.seatingArrangement = toClientSafeLayout(parsedLayout);
              continue;
            }
          } catch (e) {
            // fall through to reconstruct from seat rows
          }
        }

        // Fetch every individual seat
        const [seats] = await db.query(`
          SELECT seat_row, seat_col, seat_index, regn_no
          FROM seating_arrangements
          WHERE seating_plan_venue_id = ?
          ORDER BY seat_row, seat_col, seat_index, id
        `, [internalId]);

        const benchConfig = normalizeBenchConfig(v.benchConfig, 0);
        v.seatingArrangement = toClientSafeLayout(
          hydrateArrangementFromRows(seats || [], benchConfig, studentCourseMap)
        );
      }

      plan.venuesUsed = venues || [];
      plans.push(plan);
    }

    return plans;
  },


  /* ===============================
      GET SINGLE PLAN BY ID
  =============================== */
  getPlanById: async (planId, opts = {}) => {
    let ownerSql = "";
    let ownerParams = [];
    if (opts.hodAllowedOwnerIds && opts.hodAllowedOwnerIds.length > 0) {
      const placeholders = opts.hodAllowedOwnerIds.map(() => "?").join(",");
      ownerSql = ` AND owner_user_id IN (${placeholders})`;
      ownerParams = opts.hodAllowedOwnerIds;
    } else {
      const clause = andClause(opts.role, opts.ownerUserId);
      ownerSql = clause.sql;
      ownerParams = clause.params;
    }
    const [plans] = await db.query(
      `SELECT 
        id AS _id,
        public_uuid,
        exam_date,
        exam_session,
        exam_type,
        exam_start_time,
        exam_end_time,
        selected_courses,
        faculty_mode,
        created_at
       FROM seating_plans
       WHERE id = ?${ownerSql}`,
      [planId, ...ownerParams]
    );

    if (!plans || plans.length === 0) return null;

    const row = plans[0];
    const pid = row._id ?? row.id;
    const plan = {
      uuid: row.public_uuid ?? row.publicuuid,
      examDate: row.exam_date ?? row.examdate,
      examSession: row.exam_session ?? row.examsession,
      examType: row.exam_type ?? row.examtype,
      examStartTime: row.exam_start_time ?? row.examstarttime,
      examEndTime: row.exam_end_time ?? row.examendtime,
      facultyMode: row.faculty_mode ?? row.facultymode,
      createdAt: row.created_at ?? row.createdat,
      selectedCourses: (() => {
        const sc = row.selected_courses ?? row.selectedcourses;
        return typeof sc === "string" ? JSON.parse(sc) : sc;
      })()
    };

    const [venues] = await db.query(`
      SELECT 
        spv.id as internalId,
        v.public_uuid as venueUuid,
        spv.venue_id as venueId,
        spv.venue_name as venueName,
        spv.display_order as displayOrder,
        spv.bench_config as benchConfig,
        spv.seating_layout_json as seatingLayoutJson,
        f.name as facultyName,
        f.department as facultyDepartment
      FROM seating_plan_venues spv
      LEFT JOIN venues v ON spv.venue_id = v.id
      LEFT JOIN faculty f ON spv.faculty_id = f.id
      WHERE spv.seating_plan_id = ?
      ORDER BY COALESCE(spv.display_order, 0), spv.id
    `, [planId]);

    const [planStudents] = await db.query(`
      SELECT regn_no, course_description
      FROM seating_plan_students
      WHERE seating_plan_id = ?
    `, [planId]);

    const studentCourseMap = new Map();
    (planStudents || []).forEach(s => {
      const regn = s.regn_no ?? s.regnno;
      const desc = s.course_description ?? s.coursedescription;
      if (regn) studentCourseMap.set(regn, desc);
    });

    for (let v of venues || []) {
      const internalId = v.internalId ?? v.internalid ?? v.id;
      const benchConfigRaw = v.benchConfig ?? v.benchconfig;
      const seatingLayoutRaw = v.seatingLayoutJson ?? v.seatinglayoutjson;
      if (benchConfigRaw) {
        try {
          v.benchConfig = typeof benchConfigRaw === 'string' 
            ? JSON.parse(benchConfigRaw) 
            : benchConfigRaw;
        } catch (e) {
          v.benchConfig = null;
        }
      }
      v.venueName = v.venueName ?? v.venuename ?? v.venue_name;
      if (v.venueUuid ?? v.venueuuid) {
        v.uuid = v.venueUuid ?? v.venueuuid;
      }
      delete v.venueId;
      delete v.venueUuid;
      delete v.internalId;
      if (seatingLayoutRaw) {
        try {
          const parsedLayout = typeof seatingLayoutRaw === "string"
            ? JSON.parse(seatingLayoutRaw)
            : seatingLayoutRaw;
          if (Array.isArray(parsedLayout)) {
            v.seatingArrangement = toClientSafeLayout(parsedLayout);
            continue;
          }
        } catch (e) {
          // fall through to reconstruct from seat rows
        }
      }

      const [seats] = await db.query(`
        SELECT seat_row, seat_col, seat_index, regn_no
        FROM seating_arrangements
        WHERE seating_plan_venue_id = ?
        ORDER BY seat_row, seat_col, seat_index, id
      `, [internalId]);

      const benchConfig = normalizeBenchConfig(v.benchConfig, 0);
      v.seatingArrangement = toClientSafeLayout(
        hydrateArrangementFromRows(seats || [], benchConfig, studentCourseMap)
      );
    }

    plan.venuesUsed = venues || [];
    return plan;
  },

  /* ===============================
      MARK PLANS AS COMPLETED (report archive)
  =============================== */
  markCompletedByIds: async (planIds, opts = {}) => {
    const ids = (planIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0);
    if (ids.length === 0) return 0;

    let ownerSql = "";
    let ownerParams = [];
    if (opts.hodAllowedOwnerIds && opts.hodAllowedOwnerIds.length > 0) {
      const placeholders = opts.hodAllowedOwnerIds.map(() => "?").join(",");
      ownerSql = ` AND owner_user_id IN (${placeholders})`;
      ownerParams = opts.hodAllowedOwnerIds;
    } else {
      const clause = andClause(opts.role, opts.ownerUserId);
      ownerSql = clause.sql;
      ownerParams = clause.params;
    }

    const idPlaceholders = ids.map(() => "?").join(",");
    const [result] = await db.query(
      `UPDATE seating_plans
       SET report_status = 'COMPLETED',
           completed_at = COALESCE(completed_at, NOW())
       WHERE id IN (${idPlaceholders})
         AND COALESCE(report_status, 'ACTIVE') = 'ACTIVE'${ownerSql}`,
      [...ids, ...ownerParams]
    );
    return result?.affectedRows ?? result?.rowCount ?? 0;
  },

  /* ===============================
      DELETE SEATING PLAN
  =============================== */
  deletePlan: async (planId, opts = {}, externalConn = null) => {
    let ownerSql = "";
    let ownerParams = [];
    if (opts.hodAllowedOwnerIds && opts.hodAllowedOwnerIds.length > 0) {
      const placeholders = opts.hodAllowedOwnerIds.map(() => "?").join(",");
      ownerSql = ` AND owner_user_id IN (${placeholders})`;
      ownerParams = opts.hodAllowedOwnerIds;
    } else {
      const clause = andClause(opts.role, opts.ownerUserId);
      ownerSql = clause.sql;
      ownerParams = clause.params;
    }

    const conn = externalConn || (await db.getConnection());
    const ownsTxn = !externalConn;
    try {
      if (ownsTxn) await conn.beginTransaction();

      // 1️⃣ Delete seating arrangements (PostgreSQL-compatible)
      await conn.query(
        `DELETE FROM seating_arrangements
         WHERE seating_plan_venue_id IN (
           SELECT id FROM seating_plan_venues WHERE seating_plan_id = ?
         )`,
        [planId]
      );

      // 2️⃣ Delete venue links
      await conn.query(
        `DELETE FROM seating_plan_venues WHERE seating_plan_id = ?`,
        [planId]
      );

      // 3️⃣ Delete students
      await conn.query(
        `DELETE FROM seating_plan_students WHERE seating_plan_id = ?`,
        [planId]
      );

      // 4️⃣ Delete main seating plan (with owner check)
      await conn.query(
        `DELETE FROM seating_plans WHERE id = ?${ownerSql}`,
        [planId, ...ownerParams]
      );

      if (ownsTxn) await conn.commit();
    } catch (err) {
      if (ownsTxn) await conn.rollback();
      throw err;
    } finally {
      if (ownsTxn) conn.release();
    }
  }
};

module.exports = SeatingPlan;