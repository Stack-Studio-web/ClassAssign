// Class/backend/models/SeatingPlan.js
const db = require("../config/db");

const SeatingPlan = {

  /* ===============================
      CREATE SEATING PLAN
  =============================== */
  createPlan: async (planData) => {
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

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1️⃣ Insert into seating_plans
      const [planResult] = await conn.query(
        `INSERT INTO seating_plans 
         (exam_date, exam_session, exam_type, exam_start_time, exam_end_time, selected_courses, faculty_mode) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          examDate,
          examSession,
          examType,
          examStartTime,
          examEndTime,
          JSON.stringify(selectedCourses),
          facultyMode
        ]
      );

      const seatingPlanId = planResult.insertId;

      // 2️⃣ Insert students
      if (students.length > 0) {
        const studentValues = students.map(s => [
          seatingPlanId,
          s.regnNo,
          s.studentName || "",
          s.courseDescription,
          s.examCode || examType
        ]);

        await conn.query(
          `INSERT INTO seating_plan_students 
           (seating_plan_id, regn_no, student_name, course_description, exam_code) 
           VALUES ?`,
          [studentValues]
        );
      }

      // 3️⃣ Insert venues and detailed seating grid
      for (const venue of venuesUsed) {
        const [venueRes] = await conn.query(
          `INSERT INTO seating_plan_venues 
           (seating_plan_id, venue_id, venue_name, faculty_id) 
           VALUES (?, ?, ?, ?)`,
          [
            seatingPlanId,
            venue.venueId,
            venue.venueName,
            venue.facultyId || null
          ]
        );

        const seatingPlanVenueId = venueRes.insertId;

        // Insert seating grid (2D arrangement)
        if (Array.isArray(venue.seatingArrangement)) {
          const arrangementEntries = [];

          for (let r = 0; r < venue.seatingArrangement.length; r++) {
            for (let c = 0; c < venue.seatingArrangement[r].length; c++) {
              const cellContent = venue.seatingArrangement[r][c];

              if (cellContent && cellContent !== "Empty") {
                const studentsInCell = cellContent.split("\n");
                studentsInCell.forEach(regNo => {
                  arrangementEntries.push([
                    seatingPlanVenueId,
                    r,
                    c,
                    regNo.trim()
                  ]);
                });
              }
            }
          }

          if (arrangementEntries.length > 0) {
            await conn.query(
              `INSERT INTO seating_arrangements 
               (seating_plan_venue_id, seat_row, seat_col, regn_no) 
               VALUES ?`,
              [arrangementEntries]
            );
          }
        }
      }

      await conn.commit();
      return seatingPlanId;

    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /* ===============================
      GET ALL SEATING PLANS
  =============================== */
getAllPlans: async () => {
  const [rows] = await db.query(`
    SELECT 
      id AS _id,
      exam_date,
      exam_session,
      exam_type,
      exam_start_time,
      exam_end_time,
      selected_courses,
      faculty_mode,
      created_at
    FROM seating_plans
    ORDER BY exam_date DESC
  `);

  const plans = [];

  for (let row of rows) {
    const plan = {
      _id: row._id,
      examDate: row.exam_date,              // ✅ mapped
      examSession: row.exam_session,
      examType: row.exam_type,
      examStartTime: row.exam_start_time,  // ✅ mapped
      examEndTime: row.exam_end_time,      // ✅ mapped
      facultyMode: row.faculty_mode,
      createdAt: row.created_at,           // ✅ mapped
      selectedCourses: typeof row.selected_courses === "string"
        ? JSON.parse(row.selected_courses)
        : row.selected_courses,
      venuesUsed: []
    };

    // Fetch venues
    const [venues] = await db.query(`
      SELECT 
        spv.id as internalId,
        spv.venue_id as venueId,
        spv.venue_name as venueName,
        f.name as facultyName,
        f.department as facultyDepartment
      FROM seating_plan_venues spv
      LEFT JOIN faculty f ON spv.faculty_id = f.id
      WHERE spv.seating_plan_id = ?
    `, [row._id]);

    for (let v of venues) {
      const [seats] = await db.query(`
        SELECT seat_row, seat_col,
               GROUP_CONCAT(regn_no SEPARATOR '\n') as regnNos
        FROM seating_arrangements
        WHERE seating_plan_venue_id = ?
        GROUP BY seat_row, seat_col
      `, [v.internalId]);

      if (seats.length > 0) {
        const maxR = Math.max(...seats.map(s => s.seat_row)) + 1;
        const maxC = Math.max(...seats.map(s => s.seat_col)) + 1;
        const grid = Array.from({ length: maxR }, () => Array(maxC).fill("Empty"));

        seats.forEach(s => {
          grid[s.seat_row][s.seat_col] = s.regnNos;
        });

        v.seatingArrangement = grid;
      } else {
        v.seatingArrangement = [];
      }
    }

    plan.venuesUsed = venues;
    plans.push(plan);
  }

  return plans;
},


  /* ===============================
      GET SINGLE PLAN BY ID
  =============================== */
  getPlanById: async (planId) => {
    const [plans] = await db.query(
      `SELECT 
        id AS _id,
        exam_date,
        exam_session,
        exam_type,
        exam_start_time,
        exam_end_time,
        selected_courses,
        faculty_mode
       FROM seating_plans
       WHERE id = ?`,
      [planId]
    );

    if (plans.length === 0) return null;

    const plan = plans[0];

    const [venues] = await db.query(`
      SELECT 
        spv.id as internalId,
        spv.venue_id as venueId,
        spv.venue_name as venueName,
        f.name as facultyName,
        f.department as facultyDepartment
      FROM seating_plan_venues spv
      LEFT JOIN faculty f ON spv.faculty_id = f.id
      WHERE spv.seating_plan_id = ?
    `, [planId]);

    plan.venuesUsed = venues;
    plan.selectedCourses =
      typeof plan.selected_courses === "string"
        ? JSON.parse(plan.selected_courses)
        : plan.selected_courses;

    return plan;
  },

  /* ===============================
      DELETE SEATING PLAN
  =============================== */
  deletePlan: async (planId) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1️⃣ Delete seating arrangements
      await conn.query(
        `DELETE sa FROM seating_arrangements sa
         JOIN seating_plan_venues spv 
           ON sa.seating_plan_venue_id = spv.id
         WHERE spv.seating_plan_id = ?`,
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

      // 4️⃣ Delete main seating plan
      await conn.query(
        `DELETE FROM seating_plans WHERE id = ?`,
        [planId]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
};

module.exports = SeatingPlan;
