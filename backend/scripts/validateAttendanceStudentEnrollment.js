/**
 * Regression: attendance marking must resolve students.id by
 * seating (regn_no + course_description), not regn_no alone.
 *
 * Mirrors production Seating Plan 25 shape (24BIT → 24ITI004 vs 24ITI005).
 */
const assert = require("assert");
const {
  matchSeatedStudentsToEnrollments,
} = require("../utils/resolveSeatedStudentEnrollments");

function testMultiEnrollmentPicksSeatingCourse() {
  const seated = [
    { regNo: "24BIT003", courseCode: "24ITI004", name: "Student 003" },
    { regNo: "24BIT018", courseCode: "24ITI004", name: "Student 018" },
    { regNo: "24BIT022", courseCode: "24ITI004", name: "Student 022" },
    { regNo: "24BIT025", courseCode: "24ITI004", name: "Student 025" },
    { regNo: "24BIT033", courseCode: "24ITI004", name: "Student 033" },
  ];

  // Same shape as production: two enrollments per regn; wrong id is higher.
  const studentRows = [
    { id: 11221, public_uuid: "u-003-iti004", regn_no: "24BIT003", course_description: "24ITI004", student_name: "Student 003" },
    { id: 11359, public_uuid: "u-003-iti005", regn_no: "24BIT003", course_description: "24ITI005", student_name: "Student 003" },
    { id: 11230, public_uuid: "u-018-iti004", regn_no: "24BIT018", course_description: "24ITI004", student_name: "Student 018" },
    { id: 11372, public_uuid: "u-018-iti005", regn_no: "24BIT018", course_description: "24ITI005", student_name: "Student 018" },
    { id: 11240, public_uuid: "u-022-iti004", regn_no: "24BIT022", course_description: "24ITI004", student_name: "Student 022" },
    { id: 11376, public_uuid: "u-022-iti005", regn_no: "24BIT022", course_description: "24ITI005", student_name: "Student 022" },
    { id: 11250, public_uuid: "u-025-iti004", regn_no: "24BIT025", course_description: "24ITI004", student_name: "Student 025" },
    { id: 11379, public_uuid: "u-025-iti005", regn_no: "24BIT025", course_description: "24ITI005", student_name: "Student 025" },
    { id: 11260, public_uuid: "u-033-iti004", regn_no: "24BIT033", course_description: "24ITI004", student_name: "Student 033" },
    { id: 11387, public_uuid: "u-033-iti005", regn_no: "24BIT033", course_description: "24ITI005", student_name: "Student 033" },
  ];

  const matched = matchSeatedStudentsToEnrollments(seated, studentRows);
  assert.strictEqual(matched.length, 5);

  const byRegn = Object.fromEntries(matched.map((m) => [m.regnNo, m]));
  assert.strictEqual(byRegn["24BIT003"].studentId, 11221);
  assert.strictEqual(byRegn["24BIT018"].studentId, 11230);
  assert.strictEqual(byRegn["24BIT022"].studentId, 11240);
  assert.strictEqual(byRegn["24BIT025"].studentId, 11250);
  assert.strictEqual(byRegn["24BIT033"].studentId, 11260);

  for (const m of matched) {
    assert.strictEqual(m.courseCode, "24ITI004");
    assert.notStrictEqual(m.studentId, 11359);
    assert.notStrictEqual(m.studentId, 11372);
    assert.notStrictEqual(m.studentId, 11376);
    assert.notStrictEqual(m.studentId, 11379);
    assert.notStrictEqual(m.studentId, 11387);
  }
}

function testNeverPicksWrongCourseWhenSeatingIsIti004() {
  const matched = matchSeatedStudentsToEnrollments(
    [{ regNo: "24BIT003", courseCode: "24ITI004" }],
    [
      { id: 11359, public_uuid: "wrong", regn_no: "24BIT003", course_description: "24ITI005" },
      { id: 11221, public_uuid: "right", regn_no: "24BIT003", course_description: "24ITI004" },
    ]
  );
  assert.strictEqual(matched[0].studentId, 11221);
  assert.strictEqual(matched[0].publicUuid, "right");
}

function testTwentyFiveBitUsesIti005() {
  const matched = matchSeatedStudentsToEnrollments(
    [{ regNo: "25BIT001", courseCode: "24ITI005" }],
    [
      { id: 20001, public_uuid: "u-25-005", regn_no: "25BIT001", course_description: "24ITI005" },
      { id: 20002, public_uuid: "u-25-004", regn_no: "25BIT001", course_description: "24ITI004" },
    ]
  );
  assert.strictEqual(matched[0].studentId, 20001);
  assert.strictEqual(matched[0].courseCode, "24ITI005");
}

function testCaseInsensitiveCourseMatch() {
  const matched = matchSeatedStudentsToEnrollments(
    [{ regNo: "24BIT003", courseCode: "24iti004" }],
    [
      { id: 11221, public_uuid: "u", regn_no: "24bit003", course_description: "24ITI004" },
      { id: 11359, public_uuid: "w", regn_no: "24bit003", course_description: "24ITI005" },
    ]
  );
  assert.strictEqual(matched[0].studentId, 11221);
}

function testAmbiguousWithoutCourseDoesNotGuess() {
  const matched = matchSeatedStudentsToEnrollments(
    [{ regNo: "24BIT003", courseCode: "" }],
    [
      { id: 11221, public_uuid: "a", regn_no: "24BIT003", course_description: "24ITI004" },
      { id: 11359, public_uuid: "b", regn_no: "24BIT003", course_description: "24ITI005" },
    ]
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

testMultiEnrollmentPicksSeatingCourse();
testNeverPicksWrongCourseWhenSeatingIsIti004();
testTwentyFiveBitUsesIti005();
testCaseInsensitiveCourseMatch();
testAmbiguousWithoutCourseDoesNotGuess();
testSingleEnrollmentFallbackWithoutCourse();
testMissingEnrollmentReturnsNullId();

console.log("✅ Attendance student enrollment resolution regression checks passed");
process.exit(0);
