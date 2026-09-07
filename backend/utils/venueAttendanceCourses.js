/**
 * Resolve students+course codes for a seating_plan_venue from the canonical seat layout.
 * Prefer seating_layout_json (stores { regn_no, course } at allotment time).
 * Fall back to seating_arrangements + a single course per regn from seating_plan_students
 * (avoids JOIN inflation when the same regn appears under multiple plan courses).
 */

function flattenLayoutStudents(layoutJson) {
  let layout = layoutJson;
  if (layout == null) return [];
  if (typeof layout === "string") {
    try {
      layout = JSON.parse(layout);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(layout)) return [];

  const out = [];
  const seen = new Set();

  for (const row of layout) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (!Array.isArray(cell)) continue;
      for (const seat of cell) {
        if (!seat || typeof seat !== "object") continue;
        const regNo = String(seat.regn_no ?? seat.regnNo ?? "").trim();
        if (!regNo || regNo === "-") continue;
        const courseCode = String(seat.course ?? seat.courseCode ?? seat.course_description ?? "").trim();
        const key = `${regNo}::${courseCode || "_"}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          regNo,
          name: String(seat.student_name ?? seat.studentName ?? seat.name ?? "").trim(),
          courseCode,
          seatRow: seat.seat_row ?? seat.row ?? null,
          seatCol: seat.seat_col ?? seat.col ?? null,
          seatIndex: seat.seat_index ?? seat.seatIndex ?? null,
        });
      }
    }
  }
  return out;
}

/**
 * Pick one course per regn when layout lacks course (last id wins → stable by id ASC then take last in map rebuild).
 * Prefer earliest seating_plan_students.id for determinism.
 */
function buildRegnCourseMap(planStudentRows = []) {
  const map = new Map();
  for (const row of planStudentRows) {
    const regn = String(row.regn_no ?? row.regnno ?? "").trim();
    if (!regn) continue;
    const course = String(row.course_description ?? row.coursedescription ?? "").trim();
    const name = String(row.student_name ?? row.studentname ?? "").trim();
    if (!map.has(regn)) {
      map.set(regn, { courseCode: course, name });
    }
  }
  return map;
}

/**
 * @param {object} opts
 * @param {string|array|null} opts.layoutJson
 * @param {Array} opts.arrangementRows - [{ regn_no, seat_row, seat_col, seat_index }]
 * @param {Array} opts.planStudentRows - seating_plan_students rows
 * @returns {{ regNo, name, courseCode, seatRow, seatCol, seatIndex }[]}
 */
function resolveVenueStudentsWithCourses({
  layoutJson = null,
  arrangementRows = [],
  planStudentRows = [],
} = {}) {
  const fromLayout = flattenLayoutStudents(layoutJson).filter((s) => s.courseCode);
  if (fromLayout.length > 0) {
    return fromLayout;
  }

  // Layout has seats but missing course → merge arrangement + single course per regn
  const courseMap = buildRegnCourseMap(planStudentRows);
  const layoutAny = flattenLayoutStudents(layoutJson);
  if (layoutAny.length > 0) {
    return layoutAny.map((s) => {
      const meta = courseMap.get(s.regNo) || {};
      return {
        ...s,
        courseCode: s.courseCode || meta.courseCode || "",
        name: s.name || meta.name || s.regNo,
      };
    }).filter((s) => s.courseCode);
  }

  const seen = new Set();
  const out = [];
  for (const row of arrangementRows || []) {
    const regNo = String(row.regn_no ?? row.regnno ?? "").trim();
    if (!regNo || regNo === "-") continue;
    if (seen.has(regNo)) continue;
    seen.add(regNo);
    const meta = courseMap.get(regNo) || {};
    if (!meta.courseCode) continue;
    out.push({
      regNo,
      name: meta.name || regNo,
      courseCode: meta.courseCode,
      seatRow: row.seat_row ?? row.seatrow ?? null,
      seatCol: row.seat_col ?? row.seatcol ?? null,
      seatIndex: row.seat_index ?? row.seatindex ?? null,
    });
  }
  return out;
}

function groupStudentsByCourse(students = [], courseNameMap = {}) {
  const courseMap = {};
  for (const s of students) {
    const courseCode = String(s.courseCode || "").trim();
    const regNo = String(s.regNo || "").trim();
    const name = String(s.name || regNo).trim();
    if (!courseCode || !regNo) continue;
    if (!courseMap[courseCode]) {
      courseMap[courseCode] = {
        courseCode,
        courseName: courseNameMap[courseCode] || courseCode,
        students: [],
        studentRegNos: new Set(),
      };
    }
    if (!courseMap[courseCode].studentRegNos.has(regNo)) {
      courseMap[courseCode].students.push({ regNo, name });
      courseMap[courseCode].studentRegNos.add(regNo);
    }
  }
  return Object.values(courseMap).map(({ studentRegNos, ...rest }) => rest);
}

module.exports = {
  flattenLayoutStudents,
  buildRegnCourseMap,
  resolveVenueStudentsWithCourses,
  groupStudentsByCourse,
};
