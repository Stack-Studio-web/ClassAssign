const db = require("../config/db");

const SeatingPlan = {
  /* ===============================
     CREATE SEATING PLAN
  =============================== */
async createPlan({
  examDate,
  examSession,
  examType,
  examStartTime,
  examEndTime,
  selectedCourses,
  students,
  venuesUsed,
  facultyMode = "AUTO",
}) {
  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    // 1️⃣ Insert main plan
    const [result] = await conn.query(
      `INSERT INTO seating_plans
       (exam_date, exam_session, exam_type, exam_start_time, exam_end_time, selected_courses, students, faculty_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        examDate,
        examSession,
        examType,
        examStartTime,
        examEndTime,
        JSON.stringify(selectedCourses),
        JSON.stringify(students),
        facultyMode,
      ]
    );

    const seatingPlanId = result.insertId;

    // 2️⃣ Insert venues
    for (const v of venuesUsed) {
      await conn.query(
        `INSERT INTO seating_plan_venues
         (seating_plan_id, venue_id, venue_name, faculty_id)
         VALUES (?, ?, ?, ?)`,
        [seatingPlanId, v.venueId, v.venueName, v.facultyId || null]
      );
    }

    // ================================
    // 🔥 FIX #2: INSERT STUDENTS
    // ================================
    for (const s of students) {
      await conn.query(
        `INSERT INTO seating_plan_students
         (seating_plan_id, regn_no, student_name, course_description, exam_code)
         VALUES (?, ?, ?, ?, ?)`,
        [
          seatingPlanId,
          s.regnNo,
          s.studentName || "",
          s.courseDescription,
          s.examCode || null,
        ]
      );
    }

    // 3️⃣ Commit
    await conn.commit();
    return seatingPlanId;

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
,


  /* ===============================
     GET ALL SEATING PLANS
  =============================== */
  getAllPlans: async () => {
    const [plans] = await db.query(`
      SELECT
        id AS _id,
        exam_date AS examDate,
        exam_session AS examSession,
        exam_type AS examType,
        exam_start_time AS examStartTime,
        exam_end_time AS examEndTime,
        selected_courses AS selectedCourses,
        faculty_mode AS facultyMode,
        created_at AS createdAt
      FROM seating_plans
      ORDER BY exam_date DESC, exam_session
    `);

    const result = [];

    for (const plan of plans) {
      /* ---------- venues + faculty ---------- */
      const [venues] = await db.query(
        `SELECT 
           spv.venue_id AS venueId,
           spv.venue_name AS venueName,
           spv.faculty_id AS facultyId,
           f.name AS facultyName,
           f.department AS facultyDepartment
         FROM seating_plan_venues spv
         LEFT JOIN faculty f ON spv.faculty_id = f.id
         WHERE spv.seating_plan_id = ?`,
        [plan._id]
      );

      /* ---------- students ---------- */
      const [students] = await db.query(
        `SELECT
           regn_no AS regnNo,
           student_name AS studentName,
           course_description AS courseDescription,
           exam_code AS examCode
         FROM seating_plan_students
         WHERE seating_plan_id = ?`,
        [plan._id]
      );

      /* ---------- venues + seating ---------- */
      const venuesWithSeats = [];

      for (const venue of venues) {
        const [[spv]] = await db.query(
          `SELECT id FROM seating_plan_venues
           WHERE seating_plan_id = ? AND venue_id = ?`,
          [plan._id, venue.venueId]
        );

        if (!spv) continue;

        const [seats] = await db.query(
          `SELECT seat_row, seat_col, regn_no
           FROM seating_arrangements
           WHERE seating_plan_venue_id = ?
           ORDER BY seat_row, seat_col`,
          [spv.id]
        );

        const validSeats = seats.filter(
          (s) => s.seat_row !== null && s.seat_col !== null
        );

        if (validSeats.length === 0) {
          venuesWithSeats.push({
            ...venue,
            seatingArrangement: [],
          });
          continue;
        }

        const maxRow = Math.max(...validSeats.map((s) => s.seat_row)) + 1;
        const maxCol = Math.max(...validSeats.map((s) => s.seat_col)) + 1;

        const seatingArrangement = Array.from({ length: maxRow }, () =>
          Array.from({ length: maxCol }, () => "Empty")
        );

        validSeats.forEach((seat) => {
          seatingArrangement[seat.seat_row][seat.seat_col] =
            seat.regn_no || "Empty";
        });

        venuesWithSeats.push({
          ...venue,
          seatingArrangement,
        });
      }

      /* ---------- parse selectedCourses ---------- */
      let parsedCourses = [];
      try {
        if (plan.selectedCourses) {
          parsedCourses =
            typeof plan.selectedCourses === "string"
              ? JSON.parse(plan.selectedCourses)
              : plan.selectedCourses;
        }
      } catch {
        parsedCourses = [];
      }

      result.push({
        ...plan,
        selectedCourses: parsedCourses,
        venuesUsed: venuesWithSeats,
        students,
      });
    }

    return result;
  },

  /* ===============================
     GET SINGLE PLAN
  =============================== */
  getPlanById: async (id) => {
    const [[plan]] = await db.query(
      `SELECT * FROM seating_plans WHERE id = ?`,
      [id]
    );
    if (!plan) return null;

    const [venues] = await db.query(
      `SELECT 
         spv.venue_id AS venueId,
         spv.faculty_id AS facultyId,
         f.name AS facultyName
       FROM seating_plan_venues spv
       LEFT JOIN faculty f ON spv.faculty_id = f.id
       WHERE spv.seating_plan_id = ?`,
      [id]
    );

    return {
      ...plan,
      venuesUsed: venues,
    };
  },

  /* ===============================
     DELETE PLAN
  =============================== */
  deletePlan: async (id) => {
    await db.query(`DELETE FROM seating_plans WHERE id = ?`, [id]);
  },

  /* ===============================
     GET BOOKED VENUES
  =============================== */
  getBookedVenues: async (date, session) => {
    const [rows] = await db.query(
      `SELECT DISTINCT v.id, v.name
       FROM venues v
       JOIN venue_sessions vs ON v.id = vs.venue_id
       JOIN seating_plans sp ON sp.exam_date = vs.session_date
       WHERE sp.exam_date = ? AND sp.exam_session = ?`,
      [date, session]
    );
    return rows;
  },
};

/* --- Place this at the bottom of your route file --- */


module.exports = SeatingPlan;
