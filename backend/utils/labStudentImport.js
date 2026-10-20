/**
 * Parse LAB exam student Excel rows:
 * Register Number | Course-1 | Email ID
 */
const xlsx = require("xlsx");
const { normalizeFacultyEmail } = require("./facultyIdentity");

function cellStr(value) {
  if (value == null || value === "") return "";
  return String(value).trim();
}

function pickColumn(row, candidates) {
  for (const key of Object.keys(row || {})) {
    const normalized = String(key).trim().toLowerCase().replace(/[\s._-]+/g, "");
    for (const candidate of candidates) {
      if (normalized === candidate) return row[key];
    }
  }
  return undefined;
}

/**
 * @param {Buffer|string} fileOrPath
 * @returns {{ sheetNames: string[], sheets: Record<string, object[]> }}
 */
function readWorkbookSheets(fileOrPath) {
  const workbook = xlsx.readFile
    ? typeof fileOrPath === "string"
      ? xlsx.readFile(fileOrPath)
      : xlsx.read(fileOrPath, { type: "buffer" })
    : xlsx.read(fileOrPath, { type: Buffer.isBuffer(fileOrPath) ? "buffer" : "file" });

  const sheetNames = workbook.SheetNames || [];
  const sheets = {};
  for (const name of sheetNames) {
    sheets[name] = xlsx.utils.sheet_to_json(workbook.Sheets[name], { defval: "" });
  }
  return { sheetNames, sheets, workbook };
}

/**
 * Parse raw sheet rows into validated LAB student records.
 * Does not touch the database — faculty resolution is applied by the caller.
 */
function parseLabStudentRows(rawRows = []) {
  const valid = [];
  const invalid = [];
  const seenRegn = new Map();

  (rawRows || []).forEach((row, index) => {
    const excelRow = index + 2; // header is row 1
    const regnNo = cellStr(
      pickColumn(row, ["registernumber", "regnno", "regno", "register", "regn"])
    );
    const courseCode = cellStr(
      pickColumn(row, ["course1", "coursecode", "course", "labcourse", "coursecode1"])
    );
    const facultyEmailRaw = cellStr(
      pickColumn(row, ["emailid", "email", "facultyemail", "facultyemailid", "mailid"])
    );
    const facultyEmail = normalizeFacultyEmail(facultyEmailRaw);
    const studentName = cellStr(
      pickColumn(row, ["studentname", "name", "student"])
    );
    const batchLabel = cellStr(pickColumn(row, ["batch", "batchlabel", "group"]));

    const base = {
      importRow: excelRow,
      regnNo,
      courseCode,
      facultyEmail,
      facultyEmailRaw,
      studentName: studentName || null,
      batchLabel: batchLabel || null,
    };

    if (!regnNo || !courseCode || !facultyEmail) {
      invalid.push({
        ...base,
        reason: "Missing Register Number, Course-1, or Email ID",
      });
      return;
    }

    if (!facultyEmail.includes("@")) {
      invalid.push({ ...base, reason: "Invalid faculty email format" });
      return;
    }

    const regnKey = regnNo.toLowerCase();
    if (seenRegn.has(regnKey)) {
      invalid.push({
        ...base,
        reason: `Duplicate register number in sheet (also on row ${seenRegn.get(regnKey)})`,
      });
      return;
    }
    seenRegn.set(regnKey, excelRow);
    valid.push(base);
  });

  return { valid, invalid };
}

function summarizeFacultyCounts(validRows = []) {
  const map = new Map();
  for (const row of validRows) {
    const key = row.facultyEmail;
    if (!map.has(key)) {
      map.set(key, {
        facultyEmail: key,
        studentCount: 0,
        registerNumbers: [],
      });
    }
    const entry = map.get(key);
    entry.studentCount += 1;
    entry.registerNumbers.push(row.regnNo);
  }
  return [...map.values()].sort((a, b) =>
    a.facultyEmail.localeCompare(b.facultyEmail)
  );
}

module.exports = {
  cellStr,
  pickColumn,
  readWorkbookSheets,
  parseLabStudentRows,
  summarizeFacultyCounts,
};
