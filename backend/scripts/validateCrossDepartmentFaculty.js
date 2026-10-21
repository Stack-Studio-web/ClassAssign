/**
 * Integration checks for cross-department faculty sharing against a DISPOSABLE PostgreSQL.
 * Exercises the real Express routes (session stubbed), models and SQL.
 *
 * Run (see scripts/lib/testDatabase.js):
 *   DB_HOST=127.0.0.1 DB_PORT=55432 DB_USER=postgres DB_PASSWORD=test DB_NAME=hallora_test \
 *     node backend/scripts/validateCrossDepartmentFaculty.js
 */
const assert = require("assert");
const path = require("path");
const xlsx = require("xlsx");
const { assertTestDatabase, bootSchema } = require("./lib/testDatabase");

assertTestDatabase();
process.chdir(path.join(__dirname, ".."));

const db = require("../config/db");

// --- Session stub: real checkRole / resolveOwnerOpts run against seeded users. ---
const USERS = {};
const sessionAuthPath = require.resolve("../middleware/sessionAuth");
require.cache[sessionAuthPath] = {
  id: sessionAuthPath,
  filename: sessionAuthPath,
  loaded: true,
  exports: (req, res, next) => {
    const u = USERS[req.headers["x-test-user"]];
    if (!u) return res.status(401).json({ error: "Authorization required" });
    req.user = { ...u };
    req.session = { userId: u.id, academicContextId: u.academicContextId };
    next();
  },
};

const express = require("express");
const Faculty = require("../models/Faculty");
const { lockFacultyRowsForUpdate } = require("../utils/facultyTimeConflict");
const { passwordFromEmail } = require("../utils/password");
const bcrypt = require("bcryptjs");

let BASE = "";
const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push([true, name]);
    console.log(`✓ ${name}`);
  } catch (err) {
    results.push([false, name]);
    console.log(`✗ ${name}\n    ${err.stack || err.message}`);
  }
}

async function api(user, method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { "content-type": "application/json", "x-test-user": user },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function upload(user, url, rows) {
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), "FACULTY_IMPORT");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  const form = new FormData();
  form.append(
    "file",
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "faculty.xlsx"
  );
  const res = await fetch(BASE + url, { method: "POST", headers: { "x-test-user": user }, body: form });
  return { status: res.status, body: await res.json() };
}

const one = async (sql, params = []) => (await db.query(sql, params))[0]?.[0] ?? null;
const all = async (sql, params = []) => (await db.query(sql, params))[0] ?? [];
const num = (v) => Number(v ?? 0);

async function seed() {
  await db.queryRaw(`TRUNCATE users, faculty, academic_contexts, seating_plans, exams, venues
                     RESTART IDENTITY CASCADE`);
  const mkUser = async (key, role, department) => {
    const [r] = await db.query(
      `INSERT INTO users (username, email, password, role_id, department)
       VALUES (?, ?, 'x', (SELECT id FROM roles WHERE name = ?), ?) RETURNING id`,
      [key, `${key}@kct.ac.in`, role, department]
    );
    USERS[key] = { id: r.insertId, role, department, email: `${key}@kct.ac.in` };
  };
  await mkUser("admin", "admin", null);
  for (const dept of ["cse", "it"]) {
    await mkUser(`${dept}hod`, "hod", dept.toUpperCase());
    await mkUser(`${dept}fi`, "faculty_incharge", dept.toUpperCase());
    const [ctx] = await db.query(
      `INSERT INTO academic_contexts (label, department, hod_user_id) VALUES (?, ?, ?) RETURNING id`,
      [`${dept.toUpperCase()} 2026-27`, dept.toUpperCase(), USERS[`${dept}hod`].id]
    );
    for (const k of [`${dept}hod`, `${dept}fi`]) {
      await db.query(
        `INSERT INTO academic_context_members (academic_context_id, user_id, member_role) VALUES (?, ?, ?)`,
        [ctx.insertId, USERS[k].id, USERS[k].role]
      );
      await db.query(`UPDATE users SET academic_context_id = ? WHERE id = ?`, [ctx.insertId, USERS[k].id]);
      USERS[k].academicContextId = ctx.insertId;
    }
  }
}

let venueSeq = 0;
/** Fixture duty exactly as save-plan / LAB finalize persist it (plan → spv → spvf). */
async function addDuty({ owner, facultyId, date, start, end, venue = null, planKind = "hall" }) {
  venueSeq += 1;
  const venueName = venue || `TV-${venueSeq}`;
  const [v] = await db.query(
    `INSERT INTO venues (name, type, capacity) VALUES (?, 'classroom', 30) RETURNING id`,
    [venueName]
  );
  const [p] = await db.query(
    `INSERT INTO seating_plans (exam_date, exam_session, exam_type, exam_start_time, exam_end_time,
       selected_courses, faculty_mode, owner_user_id, plan_kind)
     VALUES (?, 'FN', 'CAT1', ?, ?, '[]', 'MANUAL', ?, ?) RETURNING id`,
    [date, start, end, USERS[owner].id, planKind]
  );
  const [spv] = await db.query(
    `INSERT INTO seating_plan_venues (seating_plan_id, venue_id, venue_name, faculty_id)
     VALUES (?, ?, ?, ?) RETURNING id`,
    [p.insertId, v.insertId, venueName, facultyId]
  );
  await db.query(
    `INSERT INTO seating_plan_venue_faculty (seating_plan_venue_id, faculty_id) VALUES (?, ?)`,
    [spv.insertId, facultyId]
  );
  return { planId: p.insertId, spvId: spv.insertId, venueId: v.insertId, venueName, date };
}

/** Existing completion semantics: attendance completed AND report completed. */
async function completeDuty(duty, facultyId) {
  const [e] = await db.query(
    `INSERT INTO exams (exam_name, exam_code, exam_date) VALUES ('T', 'T', ?) RETURNING id`,
    [duty.date]
  );
  await db.query(
    `INSERT INTO faculty_assignments (faculty_id, exam_id, venue_id, assigned_date) VALUES (?, ?, ?, ?)`,
    [facultyId, e.insertId, duty.venueId, duty.date]
  );
  await db.query(
    `INSERT INTO attendance_sessions (exam_id, venue_id, attendance_open_time, attendance_close_time, lifecycle_status)
     VALUES (?, ?, NOW(), NOW(), 'COMPLETED')`,
    [e.insertId, duty.venueId]
  );
  await db.query(`UPDATE seating_plans SET report_status = 'COMPLETED' WHERE id = ?`, [duty.planId]);
}

async function rowFor(user, email) {
  const { status, body } = await api(user, "GET", "/faculty");
  assert.strictEqual(status, 200);
  const rows = body.filter((f) => f.email === email);
  assert.ok(rows.length <= 1, `${email} must appear at most once for ${user}`);
  return rows[0] || null;
}

async function main() {
  await bootSchema(db);
  await seed();

  const app = express();
  app.use(express.json());
  app.use("/faculty", require("../routes/facultyRoutes"));
  app.use("/import", require("../routes/import"));
  app.use("/seating", require("../routes/seatingRoutes"));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  BASE = `http://127.0.0.1:${server.address().port}`;

  const ARUN = "arun@kct.ac.in";
  let arunId;
  let originalHash;

  // ---------- Identity and membership ----------
  await step("1. CSE creates a new faculty identity", async () => {
    const r = await api("csefi", "POST", "/faculty", { name: "Arun Kumar", department: "CSE", email: ARUN });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const f = await one(`SELECT id FROM faculty WHERE email = ?`, [ARUN]);
    arunId = Number(f.id);
    originalHash = (await one(`SELECT password FROM users WHERE email = ?`, [ARUN])).password;
    const row = await rowFor("csefi", ARUN);
    assert.strictEqual(row.membershipLabel, "CSE");
    assert.strictEqual(row.mainDepartment, "CSE");
    assert.strictEqual(row.isShared, false);
  });

  await step("2. IT adds the same email (case/space variant) and reuses the identity", async () => {
    const r = await api("itfi", "POST", "/faculty", { name: "Arun Kumar", department: "IT", email: "  ARUN@KCT.AC.IN " });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.data.associated, true);
    assert.strictEqual(r.body.data.generatedPassword, undefined, "no new credentials issued");
    assert.match(r.body.message, /added to IT/i);
    assert.strictEqual(r.body.data.department, "IT");
  });

  await step("3. one faculty ID and one login account for the shared email", async () => {
    assert.strictEqual(num((await one(`SELECT COUNT(*) c FROM faculty WHERE LOWER(email) = ?`, [ARUN])).c), 1);
    assert.strictEqual(num((await one(`SELECT COUNT(*) c FROM users WHERE LOWER(email) = ?`, [ARUN])).c), 1);
    const m = await all(`SELECT faculty_id, department FROM faculty_department_memberships`);
    assert.deepStrictEqual(m.map((x) => [Number(x.faculty_id), x.department]), [[arunId, "IT"]]);
  });

  await step("4. both associations persist after reload (GET /faculty per department)", async () => {
    const cse = await rowFor("csefi", ARUN);
    const it = await rowFor("itfi", ARUN);
    assert.ok(cse && it);
    assert.strictEqual(cse.uuid, it.uuid);
    assert.deepStrictEqual(cse.departments, ["CSE", "IT"]);
    assert.deepStrictEqual(it.departments, ["CSE", "IT"]);
    assert.strictEqual(cse.mainDepartment, "CSE");
    assert.strictEqual(it.mainDepartment, "CSE");
    assert.strictEqual(cse.membershipLabel, "Shared - CSE");
    assert.strictEqual(it.membershipLabel, "Shared - CSE");
    assert.strictEqual(cse.isShared, true);
    assert.strictEqual(cse.membershipType, "home");
    assert.strictEqual(it.membershipType, "shared");
    const stats = await api("itfi", "GET", "/faculty/stats");
    assert.strictEqual(stats.body.totalFaculty, 1);
  });

  await step("5. repeating an existing association does not create duplicates", async () => {
    const again = await api("itfi", "POST", "/faculty", { name: "Arun Kumar", department: "IT", email: ARUN });
    assert.strictEqual(again.status, 409);
    assert.strictEqual(again.body.code, "ALREADY_ASSOCIATED");
    const home = await api("csefi", "POST", "/faculty", { name: "Arun Kumar", department: "CSE", email: ARUN });
    assert.strictEqual(home.status, 409);
    assert.strictEqual(num((await one(`SELECT COUNT(*) c FROM faculty_department_memberships`)).c), 1);
  });

  await step("6. different details for an existing email do not overwrite the original", async () => {
    await api("csefi", "POST", "/faculty", { name: "Priya S", department: "CSE", email: "priya@kct.ac.in" });
    const r = await api("itfi", "POST", "/faculty", { name: "Dr. Priya Sharma", department: "IT", email: "priya@kct.ac.in" });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.data.detailsMismatch, true);
    assert.match(r.body.message, /existing name "Priya S" was kept/);
    const f = await one(`SELECT name, department FROM faculty WHERE email = 'priya@kct.ac.in'`);
    assert.deepStrictEqual([f.name, f.department], ["Priya S", "CSE"]);
    const row = await rowFor("itfi", "priya@kct.ac.in");
    const put = await api("itfi", "PUT", `/faculty/${row.uuid}`, {
      name: "Dr. Priya Sharma", department: "CSE", email: "priya@kct.ac.in", maxClassrooms: 2, isAvailable: true,
    });
    assert.strictEqual(put.status, 403, "shared department cannot edit identity fields");
    assert.strictEqual((await one(`SELECT name FROM faculty WHERE email = 'priya@kct.ac.in'`)).name, "Priya S");
  });

  await step("7. home-dept form value still associates; unauthorized roles stay rejected", async () => {
    // Cross-context: same faculty department CSE in a second Academic Context.
    await api("csefi", "POST", "/faculty", { name: "Kavin", department: "CSE", email: "kavin@kct.ac.in" });
    const share = await api("itfi", "POST", "/faculty", { name: "Kavin", department: "CSE", email: "kavin@kct.ac.in" });
    assert.strictEqual(share.status, 201, JSON.stringify(share.body));
    assert.strictEqual(share.body.data.associated, true);
    assert.strictEqual(share.body.data.department, "CSE");
    assert.strictEqual(
      (await one(`SELECT department FROM faculty_department_memberships WHERE faculty_id = (SELECT id FROM faculty WHERE email = 'kavin@kct.ac.in')`)).department,
      "CSE"
    );
    assert.strictEqual((await rowFor("itfi", "kavin@kct.ac.in")).membershipLabel, "Shared - CSE");
    assert.strictEqual((await rowFor("csefi", "kavin@kct.ac.in")).membershipLabel, "Shared - CSE");

    // Reverse: IT-home faculty associated into CSE context with department IT.
    await api("itfi", "POST", "/faculty", { name: "Sita", department: "IT", email: "sita@kct.ac.in" });
    const reverse = await api("csefi", "POST", "/faculty", { name: "Sita", department: "IT", email: "sita@kct.ac.in" });
    assert.strictEqual(reverse.status, 201, JSON.stringify(reverse.body));
    assert.strictEqual(reverse.body.data.department, "IT");
    assert.strictEqual((await rowFor("csefi", "sita@kct.ac.in")).membershipLabel, "Shared - IT");
    assert.strictEqual((await rowFor("itfi", "sita@kct.ac.in")).membershipLabel, "Shared - IT");
    assert.strictEqual(
      (await one(`SELECT department FROM faculty WHERE email = 'kavin@kct.ac.in'`)).department,
      "CSE",
      "main department unchanged after IT association"
    );

    const hod = await api("ithod", "POST", "/faculty", { name: "Kavin", department: "IT", email: "kavin@kct.ac.in" });
    assert.strictEqual(hod.status, 403, "HOD role cannot create associations");
    const adminNoCtx = await api("admin", "POST", "/faculty", { name: "Kavin", department: "IT", email: "kavin@kct.ac.in" });
    assert.ok([403, 409].includes(adminNoCtx.status), "admin without department context cannot associate");

    // Faculty never shared with IT remains invisible to IT; CSE-only label is not Shared.
    await api("csefi", "POST", "/faculty", { name: "OnlyCse", department: "CSE", email: "onlycse@kct.ac.in" });
    assert.strictEqual(await rowFor("itfi", "onlycse@kct.ac.in"), null);
    assert.strictEqual((await rowFor("csefi", "onlycse@kct.ac.in")).membershipLabel, "CSE");
    assert.strictEqual((await rowFor("csefi", "onlycse@kct.ac.in")).isShared, false);
    const onlyRow = await rowFor("csefi", "onlycse@kct.ac.in");
    const put = await api("itfi", "PUT", `/faculty/${onlyRow.uuid}/max-classrooms`, { max_classrooms: 9 });
    assert.strictEqual(put.status, 404);
  });

  await step("8. concurrent requests with the same email create one identity", async () => {
    const email = "race@kct.ac.in";
    const reqs = [];
    for (let i = 0; i < 4; i++) {
      reqs.push(api("csefi", "POST", "/faculty", { name: "Race", department: "CSE", email }));
      reqs.push(api("itfi", "POST", "/faculty", { name: "Race", department: "IT", email }));
    }
    const out = await Promise.all(reqs);
    assert.ok(out.every((r) => [200, 201, 409].includes(r.status)), JSON.stringify(out.map((r) => r.status)));
    assert.strictEqual(num((await one(`SELECT COUNT(*) c FROM faculty WHERE email = ?`, [email])).c), 1);
    assert.strictEqual(num((await one(`SELECT COUNT(*) c FROM users WHERE email = ?`, [email])).c), 1);
    const f = await one(`SELECT id FROM faculty WHERE email = ?`, [email]);
    assert.ok(
      num((await one(`SELECT COUNT(*) c FROM faculty_department_memberships WHERE faculty_id = ?`, [f.id])).c) <= 1
    );
  });

  // ---------- Independent counters ----------
  let cseRow;
  let itRow;
  await step("9/10. CSE and IT Max are independent; updating CSE does not change IT", async () => {
    cseRow = await rowFor("csefi", ARUN);
    itRow = await rowFor("itfi", ARUN);
    assert.strictEqual((await api("csefi", "PUT", `/faculty/${cseRow.uuid}/max-classrooms`, { max_classrooms: 5 })).status, 200);
    assert.strictEqual((await api("itfi", "PUT", `/faculty/${itRow.uuid}/max-classrooms`, { max_classrooms: 4 })).status, 200);
    assert.strictEqual((await rowFor("csefi", ARUN)).maxClassrooms, 5);
    assert.strictEqual((await rowFor("itfi", ARUN)).maxClassrooms, 4);
    assert.strictEqual((await api("csefi", "PUT", `/faculty/${cseRow.uuid}/max-classrooms`, { max_classrooms: 6 })).status, 200);
    assert.strictEqual((await rowFor("itfi", ARUN)).maxClassrooms, 4, "IT Max unchanged");
    await api("csefi", "PUT", `/faculty/${cseRow.uuid}/max-classrooms`, { max_classrooms: 5 });
    // Available is department-scoped too.
    await api("itfi", "PUT", `/faculty/${itRow.uuid}/availability`, { isAvailable: false });
    assert.strictEqual((await rowFor("csefi", ARUN)).isAvailable, true);
    assert.strictEqual((await rowFor("itfi", ARUN)).isAvailable, false);
    await api("itfi", "PUT", `/faculty/${itRow.uuid}/availability`, { isAvailable: true });
  });

  await step("11. allocation, completion, cancellation, transfer update the correct department", async () => {
    await addDuty({ owner: "csefi", facultyId: arunId, date: "2026-10-24", start: "09:00", end: "11:00", venue: "AD207" });
    const done = await addDuty({ owner: "csefi", facultyId: arunId, date: "2026-10-20", start: "09:00", end: "11:00" });
    await completeDuty(done, arunId);
    const itDuty = await addDuty({ owner: "itfi", facultyId: arunId, date: "2026-10-27", start: "09:00", end: "11:00" });

    let c = await rowFor("csefi", ARUN);
    let i = await rowFor("itfi", ARUN);
    assert.deepStrictEqual([c.maxClassrooms, c.allocation, c.completed, c.remaining], [5, 1, 1, 4]);
    assert.deepStrictEqual([i.maxClassrooms, i.allocation, i.completed, i.remaining], [4, 1, 0, 3]);

    await Faculty.incrementTransferCount(arunId, undefined, { seatingPlanVenueId: itDuty.spvId });
    c = await rowFor("csefi", ARUN);
    i = await rowFor("itfi", ARUN);
    assert.deepStrictEqual([c.transferCount, i.transferCount], [0, 1], "transfer counted for IT only");

    // Cancellation / rollback: removing IT's plan releases only IT's slot.
    await db.query(`DELETE FROM seating_plans WHERE id = ?`, [itDuty.planId]);
    i = await rowFor("itfi", ARUN);
    c = await rowFor("csefi", ARUN);
    assert.deepStrictEqual([i.allocation, i.remaining], [0, 4]);
    assert.deepStrictEqual([c.allocation, c.completed], [1, 1]);

    // Rolled-back transaction leaves no counter change.
    const conn = await db.getConnection();
    await conn.query(
      `INSERT INTO seating_plans (exam_date, exam_session, exam_type, exam_start_time, exam_end_time, selected_courses, faculty_mode, owner_user_id)
       VALUES ('2026-11-02', 'FN', 'CAT1', '09:00', '11:00', '[]', 'MANUAL', ?)`,
      [USERS.itfi.id]
    );
    await conn.rollback();
    assert.strictEqual((await rowFor("itfi", ARUN)).allocation, 0);
  });

  await step("12. concurrent assignments cannot exceed the department's Max", async () => {
    await api("itfi", "PUT", `/faculty/${itRow.uuid}/max-classrooms`, { max_classrooms: 1 });
    const attempt = async (date) => {
      const conn = await db.getConnection();
      try {
        await lockFacultyRowsForUpdate(conn, [arunId]);
        const v = await Faculty.validateFacultyForAllocation(
          arunId,
          { examDate: date, examStartTime: "09:00", examEndTime: "11:00", attributionUserId: USERS.itfi.id },
          conn
        );
        if (!v.allowed) {
          await conn.rollback();
          return v.code;
        }
        const [p] = await conn.query(
          `INSERT INTO seating_plans (exam_date, exam_session, exam_type, exam_start_time, exam_end_time, selected_courses, faculty_mode, owner_user_id)
           VALUES (?, 'FN', 'CAT1', '09:00', '11:00', '[]', 'MANUAL', ?) RETURNING id`,
          [date, USERS.itfi.id]
        );
        const [spv] = await conn.query(
          `INSERT INTO seating_plan_venues (seating_plan_id, venue_name, faculty_id) VALUES (?, 'C', ?) RETURNING id`,
          [p.insertId, arunId]
        );
        await conn.query(
          `INSERT INTO seating_plan_venue_faculty (seating_plan_venue_id, faculty_id) VALUES (?, ?)`,
          [spv.insertId, arunId]
        );
        await conn.commit();
        return "OK";
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    };
    const out = await Promise.all([attempt("2026-11-10"), attempt("2026-11-11"), attempt("2026-11-12")]);
    assert.strictEqual(out.filter((x) => x === "OK").length, 1, JSON.stringify(out));
    assert.ok(out.filter((x) => x !== "OK").every((x) => x === "CAPACITY"));
    const i = await rowFor("itfi", ARUN);
    assert.deepStrictEqual([i.maxClassrooms, i.allocation, i.remaining], [1, 1, 0]);
    assert.strictEqual((await rowFor("csefi", ARUN)).allocation, 1, "CSE untouched");
    await db.query(
      `DELETE FROM seating_plans WHERE owner_user_id = ? AND exam_date BETWEEN '2026-11-10' AND '2026-11-12'`,
      [USERS.itfi.id]
    );
    await api("itfi", "PUT", `/faculty/${itRow.uuid}/max-classrooms`, { max_classrooms: 4 });
  });

  // ---------- Allotment and conflicts ----------
  const availability = (user, examDate, examStartTime, examEndTime) =>
    api(user, "POST", "/seating/check-faculty-availability", { examDate, examStartTime, examEndTime, venueCount: 1 });

  await step("13/16. both departments can select the shared faculty; listed once each", async () => {
    for (const user of ["csefi", "itfi"]) {
      const r = await availability(user, "2026-10-30", "09:00", "11:00");
      assert.strictEqual(r.status, 200);
      const hits = r.body.facultyStatus.filter((f) => f.uuid === cseRow.uuid);
      assert.strictEqual(hits.length, 1, `${user} sees Arun exactly once`);
      assert.strictEqual(hits[0].canAllocate && !hits[0].hasTimeConflict, true);
      const uuids = r.body.facultyStatus.map((f) => f.uuid);
      assert.strictEqual(new Set(uuids).size, uuids.length, "no duplicate identities");
    }
    const it = await availability("itfi", "2026-10-30", "09:00", "11:00");
    assert.ok(!it.body.facultyStatus.some((f) => f.name === "OnlyCse"), "non-shared CSE faculty hidden from IT");
  });

  await step("14/19. CSE duty blocks an overlapping IT assignment (stored details, IT cannot see venue)", async () => {
    const v = await Faculty.validateFacultyForAllocation(arunId, {
      examDate: "2026-10-24", examStartTime: "10:00", examEndTime: "12:00",
      attributionUserId: USERS.itfi.id,
      viewer: { isAdmin: false, ownerIds: [USERS.ithod.id, USERS.itfi.id] },
    });
    assert.strictEqual(v.allowed, false);
    assert.strictEqual(v.code, "TIME_CONFLICT");
    assert.match(
      v.message,
      /Faculty Arun Kumar is already assigned to an exam through CSE 2026-27 on 24\/10\/2026, 9:00 AM–11:00 AM/
    );
    assert.ok(!v.message.includes("AD207"));
    assert.strictEqual(v.conflict.venueName, null);
    const forCse = await Faculty.validateFacultyForAllocation(arunId, {
      examDate: "2026-10-24", examStartTime: "10:00", examEndTime: "12:00",
      attributionUserId: USERS.csefi.id,
      viewer: { isAdmin: false, ownerIds: [USERS.csehod.id, USERS.csefi.id] },
    });
    assert.match(forCse.message, /through CSE 2026-27 on 24\/10\/2026, 9:00 AM–11:00 AM at AD207/);
    const it = await availability("itfi", "2026-10-24", "10:00", "12:00");
    const hit = it.body.facultyStatus.find((f) => f.uuid === cseRow.uuid);
    assert.strictEqual(hit.hasTimeConflict, true);
    assert.ok(!String(hit.conflictMessage).includes("AD207"));
    const can = await api("itfi", "GET", `/faculty/${itRow.uuid}/can-allocate?examDate=2026-10-24&examStartTime=10:00&examEndTime=12:00`);
    assert.strictEqual(can.body.data.allowed, false);
    assert.strictEqual(can.body.data.code, "TIME_CONFLICT");
  });

  await step("15. non-conflicting IT assignment allowed within IT capacity (same-day rule kept)", async () => {
    const other = await Faculty.validateFacultyForAllocation(arunId, {
      examDate: "2026-10-25", examStartTime: "10:00", examEndTime: "12:00", attributionUserId: USERS.itfi.id,
    });
    assert.strictEqual(other.allowed, true);
    assert.strictEqual(other.maxClassrooms, 4);
    const sameDay = await Faculty.validateFacultyForAllocation(arunId, {
      examDate: "2026-10-24", examStartTime: "13:00", examEndTime: "15:00", attributionUserId: USERS.itfi.id,
    });
    assert.strictEqual(sameDay.code, "TIME_CONFLICT", "existing one-duty-per-day policy still applies");
  });

  await step("17. manual (validate) and automatic (availability list) agree for every faculty", async () => {
    for (const [user, date] of [["itfi", "2026-10-24"], ["itfi", "2026-10-30"], ["csefi", "2026-10-24"]]) {
      const list = await availability(user, date, "09:00", "11:00");
      for (const f of list.body.facultyStatus) {
        const fid = (await one(`SELECT id FROM faculty WHERE public_uuid = ?`, [f.uuid])).id;
        const v = await Faculty.validateFacultyForAllocation(fid, {
          examDate: date, examStartTime: "09:00", examEndTime: "11:00", attributionUserId: USERS[user].id,
        });
        assert.strictEqual(
          v.allowed,
          f.canAllocate && !f.hasTimeConflict,
          `${user} ${date} ${f.name}: validate=${v.allowed} list=${f.canAllocate && !f.hasTimeConflict}`
        );
      }
    }
  });

  await step("18. LAB plans use the same identity and block other departments same-day", async () => {
    const lab = await addDuty({ owner: "itfi", facultyId: arunId, date: "2026-10-28", start: "14:00", end: "16:00", planKind: "lab", venue: "LAB-3" });
    const v = await Faculty.validateFacultyForAllocation(arunId, {
      examDate: "2026-10-28", examStartTime: "09:00", examEndTime: "11:00",
      attributionUserId: USERS.csefi.id,
      viewer: { isAdmin: false, ownerIds: [USERS.csehod.id, USERS.csefi.id] },
    });
    assert.strictEqual(v.code, "TIME_CONFLICT");
    assert.match(v.message, /through IT 2026-27 on 28\/10\/2026, 2:00 PM–4:00 PM/);
    assert.strictEqual((await rowFor("itfi", ARUN)).allocation, 1, "LAB duty counted for IT");
    assert.strictEqual((await rowFor("csefi", ARUN)).allocation, 1, "not for CSE");
    await db.query(`DELETE FROM seating_plans WHERE id = ?`, [lab.planId]);
  });

  // ---------- Regression and data safety ----------
  await step("20. Excel import follows the same identity and association rules", async () => {
    await api("csefi", "POST", "/faculty", { name: "Ravi", department: "CSE", email: "ravi@kct.ac.in" });
    const r = await upload("itfi", "/import/import-faculty", [
      { NAME: "Nila", DEPT: "IT", MAIL: "nila@kct.ac.in" },
      { NAME: "Ravi", DEPT: "IT", MAIL: "RAVI@kct.ac.in" },
      { NAME: "Ravi again", DEPT: "IT", MAIL: "ravi@kct.ac.in" },
      { NAME: "Arun Kumar", DEPT: "IT", MAIL: ARUN },
      { NAME: "OnlyCse", DEPT: "CSE", MAIL: "onlycse@kct.ac.in" },
    ]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.inserted, 1);
    // Ravi (DEPT IT) + OnlyCse (DEPT CSE) both get an IT-context membership; faculty dept codes differ.
    assert.strictEqual(r.body.associated, 2, JSON.stringify(r.body));
    const statuses = r.body.rowIssues.map((x) => x.status).sort();
    assert.deepStrictEqual(statuses, ["DUPLICATE_IN_FILE"]);
    assert.ok(r.body.skippedEmails.includes(ARUN), "existing association reported as skipped");
    assert.strictEqual(num((await one(`SELECT COUNT(*) c FROM faculty WHERE email = 'ravi@kct.ac.in'`)).c), 1);
    assert.deepStrictEqual((await rowFor("itfi", "ravi@kct.ac.in")).departments, ["CSE", "IT"]);
    assert.strictEqual((await rowFor("itfi", "ravi@kct.ac.in")).membershipLabel, "Shared - CSE");
    // Same faculty department CSE in two contexts → still Shared - CSE (not "CSE, IT").
    assert.deepStrictEqual((await rowFor("itfi", "onlycse@kct.ac.in")).departments, ["CSE"]);
    assert.strictEqual((await rowFor("itfi", "onlycse@kct.ac.in")).membershipLabel, "Shared - CSE");
    assert.strictEqual((await rowFor("itfi", "onlycse@kct.ac.in")).isShared, true);
    const undo = await api("itfi", "POST", "/import/undo-faculty-import");
    assert.strictEqual(undo.status, 200, JSON.stringify(undo.body));
    assert.strictEqual(await rowFor("itfi", "ravi@kct.ac.in"), null, "undo removed the IT association");
    assert.ok(await rowFor("csefi", "ravi@kct.ac.in"), "CSE keeps Ravi");
  });

  await step("21. existing login and credentials unchanged", async () => {
    const u = await one(
      `SELECT u.password, COALESCE(u.is_active, TRUE) AS is_active, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?`,
      [ARUN]
    );
    assert.strictEqual(u.password, originalHash);
    assert.strictEqual(u.is_active, true);
    assert.strictEqual(u.role, "faculty");
    assert.strictEqual(await bcrypt.compare(passwordFromEmail(ARUN), u.password), true);
    const login = await Faculty.findForLoginByEmail(ARUN);
    assert.strictEqual(Number(login.id), arunId);
  });

  await step("22. removal is department-scoped and history is preserved", async () => {
    const before = await one(
      `SELECT (SELECT COUNT(*) FROM seating_plans) p, (SELECT COUNT(*) FROM seating_plan_venue_faculty) f,
              (SELECT COUNT(*) FROM attendance_sessions) a`
    );
    const blocked = await api("csefi", "DELETE", `/faculty/${cseRow.uuid}`);
    assert.strictEqual(blocked.status, 409);
    assert.strictEqual(blocked.body.code, "FACULTY_SHARED");
    const itDel = await api("itfi", "DELETE", `/faculty/${itRow.uuid}`);
    assert.strictEqual(itDel.status, 200, JSON.stringify(itDel.body));
    assert.strictEqual(await rowFor("itfi", ARUN), null);
    const cse = await rowFor("csefi", ARUN);
    assert.deepStrictEqual(cse.departments, ["CSE"]);
    assert.strictEqual(cse.membershipLabel, "CSE");
    assert.strictEqual(cse.isShared, false);
    assert.strictEqual(cse.mainDepartment, "CSE");
    assert.strictEqual((await one(`SELECT COALESCE(is_active, TRUE) a FROM users WHERE email = ?`, [ARUN])).a, true);
    // Re-adding reactivates the same membership row (counters/history kept).
    const readd = await api("itfi", "POST", "/faculty", { name: "Arun Kumar", department: "IT", email: ARUN });
    assert.strictEqual(readd.status, 200);
    assert.strictEqual(readd.body.data.reactivatedMembership, true);
    assert.strictEqual((await rowFor("itfi", ARUN)).maxClassrooms, 4, "IT Max preserved");
    const after = await one(
      `SELECT (SELECT COUNT(*) FROM seating_plans) p, (SELECT COUNT(*) FROM seating_plan_venue_faculty) f,
              (SELECT COUNT(*) FROM attendance_sessions) a`
    );
    assert.deepStrictEqual(after, before);
  });

  await step("23. transfer and delete-all workflows keep their rules", async () => {
    const t = await Faculty.validateFacultyForAllocation(arunId, {
      examDate: "2026-10-24", examStartTime: "09:00", examEndTime: "11:00", ignoreCapacity: true,
    });
    assert.strictEqual(t.code, "TIME_CONFLICT", "transfer still checks global same-day conflicts");
    const delAll = await api("itfi", "DELETE", "/import/delete-all-faculty");
    assert.strictEqual(delAll.status, 200);
    assert.strictEqual((await rowFor("csefi", ARUN)).isActive, true, "IT delete-all never touches CSE");
    assert.strictEqual(await rowFor("itfi", ARUN), null);
    await api("itfi", "POST", "/faculty", { name: "Meena", department: "IT", email: "meena@kct.ac.in" });
    const csAll = await api("csefi", "DELETE", "/import/delete-all-faculty");
    assert.strictEqual(csAll.status, 200);
    assert.strictEqual(
      (await one(`SELECT COALESCE(is_active, TRUE) a FROM faculty WHERE email = 'meena@kct.ac.in'`)).a,
      true,
      "IT-owned faculty untouched by CSE delete-all"
    );
  });

  server.close();
  const failed = results.filter(([ok]) => !ok);
  console.log(`\n${results.length - failed.length}/${results.length} cross-department checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
