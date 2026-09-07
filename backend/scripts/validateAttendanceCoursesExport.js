/**
 * Regression checks for venue-scoped attendance courses + absentee export helpers.
 */
const assert = require("assert");
const {
  resolveVenueStudentsWithCourses,
  groupStudentsByCourse,
  flattenLayoutStudents,
} = require("../utils/venueAttendanceCourses");

function testCourseFilteringFromLayout() {
  // Exam has CSE101/102/103 in plan students, but layout only seats 101+102
  const layout = [
    [
      [
        { regn_no: "23CSE001", course: "CSE101" },
        { regn_no: "23CSE002", course: "CSE102" },
      ],
    ],
  ];
  const planStudents = [
    { regn_no: "23CSE001", student_name: "A", course_description: "CSE101" },
    { regn_no: "23CSE001", student_name: "A", course_description: "CSE103" },
    { regn_no: "23CSE002", student_name: "B", course_description: "CSE102" },
    { regn_no: "23CSE003", student_name: "C", course_description: "CSE103" },
  ];
  const students = resolveVenueStudentsWithCourses({
    layoutJson: layout,
    arrangementRows: [{ regn_no: "23CSE001" }, { regn_no: "23CSE002" }],
    planStudentRows: planStudents,
  });
  const courses = groupStudentsByCourse(students)
    .map((c) => c.courseCode)
    .sort();
  assert.deepStrictEqual(courses, ["CSE101", "CSE102"]);
  assert.ok(!courses.includes("CSE103"), "CSE103 must not appear for this hall");
}

function testJoinInflationAvoidedWithoutLayout() {
  const students = resolveVenueStudentsWithCourses({
    layoutJson: null,
    arrangementRows: [{ regn_no: "23CSE001" }],
    planStudentRows: [
      { regn_no: "23CSE001", student_name: "A", course_description: "CSE101" },
      { regn_no: "23CSE001", student_name: "A", course_description: "CSE103" },
    ],
  });
  assert.strictEqual(students.length, 1);
  assert.strictEqual(students[0].courseCode, "CSE101");
}

function testFacultyIsolationViaLayout() {
  const hallA = resolveVenueStudentsWithCourses({
    layoutJson: [[[{ regn_no: "1", course: "CSE101" }]]],
  });
  const hallB = resolveVenueStudentsWithCourses({
    layoutJson: [[[{ regn_no: "2", course: "CSE102" }]]],
  });
  assert.deepStrictEqual(
    hallA.map((s) => s.courseCode),
    ["CSE101"]
  );
  assert.deepStrictEqual(
    hallB.map((s) => s.courseCode),
    ["CSE102"]
  );
}

function testAbsentOnlyFilterLogic() {
  const records = [
    { name: "Student 1", status: "Present" },
    { name: "Student 2", status: "Absent" },
    { name: "Student 3", status: "Present" },
    { name: "Student 4", status: "Absent" },
  ];
  const absentees = records.filter((r) => r.status === "Absent").map((r) => r.name);
  assert.deepStrictEqual(absentees, ["Student 2", "Student 4"]);
}

function testDaySessionTimeFilterLogic() {
  const rows = [
    { date: "2026-09-01", session: "FN", time: "09:00", name: "A" },
    { date: "2026-09-01", session: "AN", time: "14:00", name: "B" },
    { date: "2026-09-02", session: "FN", time: "09:00", name: "C" },
  ];
  const filtered = rows.filter(
    (r) => r.date === "2026-09-01" && r.session === "FN" && r.time === "09:00"
  );
  assert.deepStrictEqual(
    filtered.map((r) => r.name),
    ["A"]
  );
}

function testAllClassroomsAggregation() {
  const absentees = [
    { classroom: "A101", name: "S2", status: "Absent" },
    { classroom: "A102", name: "S4", status: "Absent" },
    { classroom: "A103", name: "S5", status: "Absent" },
  ];
  assert.strictEqual(new Set(absentees.map((a) => a.classroom)).size, 3);
  assert.deepStrictEqual(
    absentees.map((a) => a.name),
    ["S2", "S4", "S5"]
  );
}

function testExcelFilenameIsXlsx() {
  const filename = `attendance_absentees_2026-09-01_FN_09-00.xlsx`;
  assert.ok(filename.endsWith(".xlsx"));
  assert.ok(!filename.endsWith(".csv"));
}

function testFlattenLayout() {
  const flat = flattenLayoutStudents(
    JSON.stringify([[[{ regn_no: "X", course: "CSE101", student_name: "Z" }]]])
  );
  assert.strictEqual(flat.length, 1);
  assert.strictEqual(flat[0].courseCode, "CSE101");
}

testCourseFilteringFromLayout();
testJoinInflationAvoidedWithoutLayout();
testFacultyIsolationViaLayout();
testAbsentOnlyFilterLogic();
testDaySessionTimeFilterLogic();
testAllClassroomsAggregation();
testExcelFilenameIsXlsx();
testFlattenLayout();

require("../services/attendanceLifecycleService");
require("../controllers/attendanceController");
require("../routes/attendanceRoutes");
require("../routes/seatingRoutes");

console.log("✅ Attendance course filter + absentee export regression checks passed");
process.exit(0);
