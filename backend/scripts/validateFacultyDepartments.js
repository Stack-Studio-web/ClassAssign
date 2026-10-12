/**
 * Validate predefined faculty department resolution.
 * Run: node scripts/validateFacultyDepartments.js
 */
const assert = require("assert");
const {
  FACULTY_DEPARTMENTS,
  listFacultyDepartments,
  resolveFacultyDepartment,
} = require("../utils/facultyDepartments");

assert.strictEqual(FACULTY_DEPARTMENTS.length, 15);
assert.strictEqual(listFacultyDepartments().length, 15);

const expectCode = (raw, code) => {
  const r = resolveFacultyDepartment(raw);
  assert.strictEqual(r.ok, true, `expected ok for ${raw}`);
  assert.strictEqual(r.code, code, `raw=${raw}`);
};

expectCode("", null);
expectCode(null, null);
expectCode("  cse  ", "CSE");
expectCode("Information Technology", "IT");
expectCode("AD", "AD");
expectCode("ai & ds", "AD"); // legacy alias
expectCode("AI&DS", "AD"); // legacy alias
expectCode("Artificial Intelligence and Data Science", "AD");
expectCode("Computer Science and Engineering (CSE)", "CSE");
expectCode("e&i", "E&I");
expectCode("E & I", "E&I");
expectCode("School of Foundation Science", "SFS");

const bad = resolveFacultyDepartment("Computer Sci");
assert.strictEqual(bad.ok, false);
assert.match(bad.error, /Unknown department/i);

const labels = listFacultyDepartments().map((d) => d.label);
assert.ok(labels.every((l) => /\(.+\)$/.test(l)));

console.log("✅ faculty department list & resolution OK (15 departments)");
