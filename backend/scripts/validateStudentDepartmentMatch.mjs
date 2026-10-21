/**
 * Department matching for Student Browser / Manual Entry / timetable options.
 * Run: node backend/scripts/validateStudentDepartmentMatch.mjs
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const {
  studentMatchesDepartment,
  deriveDepartmentFromRegnNo,
  studentDepartmentMatchSql,
} = require("../utils/studentDepartmentMatch.js");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testRegnPreferredOverImporterDept() {
  // Shared EG student: importer stamped department=MEI, regn is BAE program
  const st = {
    regn_no: "26BAE001",
    department: "MEI",
    course_description: "24MEI101",
  };
  assert.strictEqual(deriveDepartmentFromRegnNo(st.regn_no), "BAE");
  assert.strictEqual(studentMatchesDepartment(st, "BAE"), true);
  assert.strictEqual(studentMatchesDepartment(st, "MEI"), false);
  console.log("✓ regn program BAE wins over stamped importer dept MEI");
}

function testOrgLabelsDoNotMatchAsDepartment() {
  const st = { regn_no: "26BCE010", department: "KSI" };
  assert.strictEqual(studentMatchesDepartment(st, "KSI"), false);
  assert.strictEqual(studentMatchesDepartment(st, "BCE"), true);
  const long = {
    regn_no: "26BME001",
    department: "DEPARTMENT OF MECHANICAL ENGINEERING",
  };
  assert.strictEqual(studentMatchesDepartment(long, "BME"), true);
  assert.strictEqual(
    studentMatchesDepartment(long, "DEPARTMENT OF MECHANICAL ENGINEERING"),
    false
  );
  console.log("✓ org/full-name department labels do not false-match program codes");
}

function testBlankDepartmentUsesRegn() {
  const st = { regn_no: "26BTT005", department: "" };
  assert.strictEqual(studentMatchesDepartment(st, "BTT"), true);
  assert.strictEqual(studentMatchesDepartment(st, "BAE"), false);
  console.log("✓ blank department column still matches via regn");
}

function testSharedCoursesVisiblePerDepartment() {
  const students = [
    { regn_no: "26BAE001", department: "MEI", course_description: "24MEI101" },
    { regn_no: "26BAU002", department: "MEI", course_description: "24MEI101" },
    { regn_no: "26BCE003", department: "MEI", course_description: "24MEI101" },
    { regn_no: "26BEE004", department: "BEE", course_description: "24MET105" },
  ];
  const coursesFor = (dept) => [
    ...new Set(
      students
        .filter((s) => studentMatchesDepartment(s, dept))
        .map((s) => s.course_description)
    ),
  ];
  assert.deepStrictEqual(coursesFor("BAE"), ["24MEI101"]);
  assert.deepStrictEqual(coursesFor("BAU"), ["24MEI101"]);
  assert.deepStrictEqual(coursesFor("BCE"), ["24MEI101"]);
  assert.deepStrictEqual(coursesFor("BEE"), ["24MET105"]);
  assert.deepStrictEqual(coursesFor("BCS"), []);
  console.log("✓ shared 24MEI101 appears under each student program department");
}

function testSqlAndWiring() {
  const sql = studentDepartmentMatchSql("st");
  assert(/regexp_match/.test(sql));
  assert(/KSI\|KCT/.test(sql));

  const formOpts = read("backend/utils/timetableFormOptions.js");
  assert(
    /studentDepartmentMatch/.test(formOpts),
    "timetableFormOptions must use shared department match"
  );
  const studentModel = read("backend/models/Student.js");
  assert(/studentDepartmentMatchSql\("st"\)/.test(studentModel));
  assert(/deriveDepartmentFromRegnNo\(s\.regnNo\)/.test(studentModel));
  const routes = read("backend/routes/studentRoutes.js");
  assert(/semesterId/.test(routes), "course-stats must accept semesterId for All Batches");
  const browser = read("src/pages/Student.jsx");
  assert(/semesterId: semesterUuid/.test(browser));
  console.log("✓ shared SQL + Student Browser semester scope wired");
}

testRegnPreferredOverImporterDept();
testOrgLabelsDoNotMatchAsDepartment();
testBlankDepartmentUsesRegn();
testSharedCoursesVisiblePerDepartment();
testSqlAndWiring();
console.log("validateStudentDepartmentMatch: ok");
