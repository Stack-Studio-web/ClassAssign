/**
 * Canonical student ↔ department matching for Hallora.
 *
 * Department dropdown values are program codes from register numbers
 * (e.g. 26BAE001 → BAE), same extraction as Student.getFilterOptions.
 *
 * students.department may be blank, an org label (KSI/KCT), a full school name,
 * or the importer's user.department — which is often NOT the student's program
 * (shared courses like 24MEI101 taught across BAE/BAU/…).
 *
 * Prefer the register-number program segment. Only treat students.department as
 * a match when it looks like a short program code (not an org/college label).
 *
 * Binds two params: dept, dept (same value twice).
 */

function normalizeDept(department) {
  return String(department || "").trim().toUpperCase();
}

function deriveDepartmentFromRegnNo(regnNo) {
  if (!regnNo) return null;
  const match = String(regnNo).trim().toUpperCase().match(/^[0-9]{2}([A-Z]+)/);
  return match ? match[1] : null;
}

function programFromRegnSql(alias = "st") {
  return `UPPER((regexp_match(UPPER(TRIM(COALESCE(${alias}.regn_no, ''))), '^[0-9]{2}([A-Z]+)'))[1])`;
}

/**
 * SQL boolean expression. Alias must be the students table alias (default st).
 * When regn yields a program code, that code is authoritative (importer-stamped
 * students.department must not move the student into another department's lists).
 */
function studentDepartmentMatchSql(alias = "st") {
  const programExpr = programFromRegnSql(alias);
  const deptCol = `UPPER(TRIM(COALESCE(${alias}.department, '')))`;
  return `(
    ${programExpr} = ?
    OR (
      ${programExpr} IS NULL
      AND ${deptCol} = ?
      AND LENGTH(${deptCol}) BETWEEN 2 AND 8
      AND ${deptCol} !~ '^(KSI|KCT)$'
    )
  )`;
}

/** Pure JS mirror of studentDepartmentMatchSql (for offline tests). */
function studentMatchesDepartment(student, department) {
  const dept = normalizeDept(department);
  if (!dept) return false;
  const fromRegn = deriveDepartmentFromRegnNo(
    student?.regnNo ?? student?.regn_no ?? student?.regnno
  );
  if (fromRegn) return fromRegn === dept;
  const col = normalizeDept(student?.department);
  if (
    col &&
    col === dept &&
    col.length >= 2 &&
    col.length <= 8 &&
    !/^(KSI|KCT)$/.test(col)
  ) {
    return true;
  }
  return false;
}

module.exports = {
  normalizeDept,
  deriveDepartmentFromRegnNo,
  programFromRegnSql,
  studentDepartmentMatchSql,
  studentMatchesDepartment,
};
