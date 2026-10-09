/**
 * Regression: attendance marking must resolve students.id by
 * seating (regn_no + course_description), not regn_no alone.
 *
 * Production evidence:
 *   Plan 21 (2026-09-07): 24BIT* → 24ITI005
 *   Plan 25 (2026-09-10): 24BIT* → 24ITI004
 * Same regn_no must resolve to different enrollment ids per seating assignment.
 */
const assert = require("assert");
const {
  matchSeatedStudentsToEnrollments,
} = require("../utils/resolveSeatedStudentEnrollments");

/** Shared multi-enrollment students table (production-shaped ids). */
const STUDENTS = [
  { id: 11221, public_uuid: "u-003-iti004", regn_no: "24BIT003", course_description: "24ITI004", student_name: "Student 003" },
  { id: 11359, public_uuid: "u-003-iti005", regn_no: "24BIT003", course_description: "24ITI005", student_name: "Student 003" },
  { id: 11234, public_uuid: "u-018-iti004", regn_no: "24BIT018", course_description: "24ITI004", student_name: "Student 018" },
  { id: 11372, public_uuid: "u-018-iti005", regn_no: "24BIT018", course_description: "24ITI005", student_name: "Student 018" },
  { id: 11238, public_uuid: "u-022-iti004", regn_no: "24BIT022", course_description: "24ITI004", student_name: "Student 022" },
  { id: 11376, public_uuid: "u-022-iti005", regn_no: "24BIT022", course_description: "24ITI005", student_name: "Student 022" },
  { id: 11241, public_uuid: "u-025-iti004", regn_no: "24BIT025", course_description: "24ITI004", student_name: "Student 025" },
  { id: 11379, public_uuid: "u-025-iti005", regn_no: "24BIT025", course_description: "24ITI005", student_name: "Student 025" },
  { id: 11249, public_uuid: "u-033-iti004", regn_no: "24BIT033", course_description: "24ITI004", student_name: "Student 033" },
  { id: 11387, public_uuid: "u-033-iti005", regn_no: "24BIT033", course_description: "24ITI005", student_name: "Student 033" },
  { id: 20001, public_uuid: "u-25-005", regn_no: "25BIT001", course_description: "24ITI005", student_name: "Student 25-001" },
  { id: 20002, public_uuid: "u-25-004", regn_no: "25BIT001", course_description: "24ITI004", student_name: "Student 25-001" },
];

function byRegn(matched) {
  return Object.fromEntries(matched.map((m) => [m.regnNo, m]));
}

/** Seating Plan 21: 24BIT → 24ITI005 (07/09 attendance was CORRECT). */
function testSeatingPlan21ResolvesIti005() {
  const seated = [
    { regNo: "24BIT003", courseCode: "24ITI005" },
    { regNo: "24BIT018", courseCode: "24ITI005" },
    { regNo: "24BIT022", courseCode: "24ITI005" },
  ];
  const matched = matchSeatedStudentsToEnrollments(seated, STUDENTS);
  const m = byRegn(matched);
  assert.strictEqual(m["24BIT003"].studentId, 11359);
  assert.strictEqual(m["24BIT018"].studentId, 11372);
  assert.strictEqual(m["24BIT022"].studentId, 11376);
  for (const row of matched) {
    assert.strictEqual(row.courseCode, "24ITI005");
  }
}

/** Seating Plan 25: same regn → 24ITI004 (must NOT pick 24ITI005). */
function testSeatingPlan25ResolvesIti004() {
  const seated = [
    { regNo: "24BIT003", courseCode: "24ITI004" },
    { regNo: "24BIT018", courseCode: "24ITI004" },
    { regNo: "24BIT022", courseCode: "24ITI004" },
    { regNo: "24BIT025", courseCode: "24ITI004" },
    { regNo: "24BIT033", courseCode: "24ITI004" },
  ];
  const matched = matchSeatedStudentsToEnrollments(seated, STUDENTS);
  const m = byRegn(matched);
  assert.strictEqual(m["24BIT003"].studentId, 11221);
  assert.strictEqual(m["24BIT018"].studentId, 11234);
  assert.strictEqual(m["24BIT022"].studentId, 11238);
  assert.strictEqual(m["24BIT025"].studentId, 11241);
  assert.strictEqual(m["24BIT033"].studentId, 11249);

  for (const row of matched) {
    assert.strictEqual(row.courseCode, "24ITI004");
    assert.notStrictEqual(row.studentId, 11359);
    assert.notStrictEqual(row.studentId, 11372);
    assert.notStrictEqual(row.studentId, 11376);
    assert.notStrictEqual(row.studentId, 11379);
    assert.notStrictEqual(row.studentId, 11387);
  }
}

/** Same regn_no must yield different enrollment ids across plans. */
function testSameRegnDifferentPlansDifferentStudentIds() {
  const plan21 = matchSeatedStudentsToEnrollments(
    [{ regNo: "24BIT003", courseCode: "24ITI005" }],
    STUDENTS
  );
  const plan25 = matchSeatedStudentsToEnrollments(
    [{ regNo: "24BIT003", courseCode: "24ITI004" }],
    STUDENTS
  );
  assert.strictEqual(plan21[0].studentId, 11359);
  assert.strictEqual(plan25[0].studentId, 11221);
  assert.notStrictEqual(plan21[0].studentId, plan25[0].studentId);
}

function testTwentyFiveBitUsesIti005Enrollment() {
  const matched = matchSeatedStudentsToEnrollments(
    [{ regNo: "25BIT001", courseCode: "24ITI005" }],
    STUDENTS
  );
  assert.strictEqual(matched[0].studentId, 20001);
}

function testCaseInsensitiveCourseMatch() {
  const matched = matchSeatedStudentsToEnrollments(
    [{ regNo: "24BIT003", courseCode: "24iti004" }],
    STUDENTS
  );
  assert.strictEqual(matched[0].studentId, 11221);
}

function testAmbiguousWithoutCourseDoesNotGuess() {
  const matched = matchSeatedStudentsToEnrollments(
    [{ regNo: "24BIT003", courseCode: "" }],
    STUDENTS
  );
  assert.strictEqual(matched[0].studentId, null);
}

function testSingleEnrollmentFallbackWithoutCourse() {
  const matched = matchSeatedStudentsToEnrollments(
    [{ regNo: "24BIT099", courseCode: "" }],
    [
      { id: 99001, public_uuid: "solo", regn_no: "24BIT099", course_description: "24XYZ001" },
    ]
  );
  assert.strictEqual(matched[0].studentId, 99001);
}

function testMissingEnrollmentReturnsNullId() {
  const matched = matchSeatedStudentsToEnrollments(
    [{ regNo: "24BIT003", courseCode: "24ITI004" }],
    [
      { id: 11359, public_uuid: "only-005", regn_no: "24BIT003", course_description: "24ITI005" },
    ]
  );
  assert.strictEqual(matched[0].studentId, null);
}

function testRowOrderDoesNotAffectResolution() {
  const reversed = [...STUDENTS].reverse();
  const matched = matchSeatedStudentsToEnrollments(
    [{ regNo: "24BIT003", courseCode: "24ITI004" }],
    reversed
  );
  assert.strictEqual(matched[0].studentId, 11221);
}

/**
 * Future integrity: save/submit stores students.id from seating match;
 * export reads course via attendance.student_id → students (no remapping).
 * Exam A (Plan 21) and Exam B (Plan 25) must keep distinct enrollments.
 */
function testFutureMarkingToExportChain() {
  const byId = Object.fromEntries(STUDENTS.map((s) => [s.id, s]));

  // Simulate mark → INSERT attendance.student_id (no course column on attendance).
  function simulateSave(seatingCourse) {
    const matched = matchSeatedStudentsToEnrollments(
      [{ regNo: "24BIT003", courseCode: seatingCourse }],
      STUDENTS
    );
    assert.ok(matched[0].studentId, "must resolve an enrollment before save");
    return {
      student_id: matched[0].studentId,
      studentUuid: matched[0].publicUuid,
    };
  }

  // Simulate export JOIN students st ON st.id = att.student_id
  function simulateExportCourse(attendanceRow) {
    const st = byId[attendanceRow.student_id];
    assert.ok(st, "attendance.student_id must exist in students");
    return {
      courseCode: st.course_description,
      courseTitle: st.course_description === "24ITI005" ? "OPERATING SYSTEMS" : "CLOUD ARCHITECTURE",
      regnNo: st.regn_no,
    };
  }

  const examA = simulateSave("24ITI005"); // Plan 21 / Exam A
  const examB = simulateSave("24ITI004"); // Plan 25 / Exam B

  assert.strictEqual(examA.student_id, 11359);
  assert.strictEqual(examB.student_id, 11221);
  assert.notStrictEqual(examA.student_id, examB.student_id);
  assert.notStrictEqual(examA.studentUuid, examB.studentUuid);

  const exportA = simulateExportCourse(examA);
  const exportB = simulateExportCourse(examB);

  assert.strictEqual(exportA.courseCode, "24ITI005");
  assert.strictEqual(exportA.courseTitle, "OPERATING SYSTEMS");
  assert.strictEqual(exportB.courseCode, "24ITI004");
  assert.strictEqual(exportB.courseTitle, "CLOUD ARCHITECTURE");
  assert.strictEqual(exportA.regnNo, "24BIT003");
  assert.strictEqual(exportB.regnNo, "24BIT003");
}

testSeatingPlan21ResolvesIti005();
testSeatingPlan25ResolvesIti004();
testSameRegnDifferentPlansDifferentStudentIds();
testTwentyFiveBitUsesIti005Enrollment();
testCaseInsensitiveCourseMatch();
testAmbiguousWithoutCourseDoesNotGuess();
testSingleEnrollmentFallbackWithoutCourse();
testMissingEnrollmentReturnsNullId();
testRowOrderDoesNotAffectResolution();
testFutureMarkingToExportChain();

console.log("✅ Attendance student enrollment resolution regression checks passed");
process.exit(0);
