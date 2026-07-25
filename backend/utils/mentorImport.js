const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function cellStr(value) {
  if (value == null || value === "") return "";
  return String(value).trim();
}

function pickColumn(row, keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== "") {
      return cellStr(row[key]);
    }
  }
  const normalized = {};
  for (const [k, v] of Object.entries(row)) {
    normalized[String(k).toLowerCase().replace(/\s+/g, " ")] = v;
  }
  for (const key of keys) {
    const nk = key.toLowerCase();
    if (normalized[nk] != null && String(normalized[nk]).trim() !== "") {
      return cellStr(normalized[nk]);
    }
  }
  return "";
}

function parseMentorImportRows(data) {
  return data.map((row, index) => ({
    rowNumber: index + 2,
    regnNo: pickColumn(row, ["Reg No", "Regn. No.", "Regn No", "Registration Number", "Reg No."]),
    studentName: pickColumn(row, ["Student Name", "Name"]),
    studentEmail: pickColumn(row, [
      "Student Email ID",
      "Student Email",
      "Email",
      "Student Email Id",
    ]),
    mentorName: pickColumn(row, ["Mentor Name", "Mentor"]),
    mentorEmail: pickColumn(row, ["Mentor Email ID", "Mentor Email", "Mentor Email Id"]),
  }));
}

function validateMentorRow(row) {
  const errors = [];
  if (!row.regnNo) errors.push("Registration Number is required");
  if (!row.studentEmail) errors.push("Student Email is required");
  if (!row.mentorName) errors.push("Mentor Name is required");
  if (!row.mentorEmail) errors.push("Mentor Email is required");
  if (row.studentEmail && !EMAIL_RE.test(row.studentEmail)) {
    errors.push("Invalid student email format");
  }
  if (row.mentorEmail && !EMAIL_RE.test(row.mentorEmail)) {
    errors.push("Invalid mentor email format");
  }
  return errors;
}

function detectDuplicateRegnInFile(rows) {
  const seen = new Map();
  const duplicates = [];
  for (const row of rows) {
    if (!row.regnNo) continue;
    const key = row.regnNo.toUpperCase();
    if (seen.has(key)) {
      duplicates.push({ rowNumber: row.rowNumber, regnNo: row.regnNo });
    } else {
      seen.set(key, row.rowNumber);
    }
  }
  return duplicates;
}

module.exports = {
  EMAIL_RE,
  parseMentorImportRows,
  validateMentorRow,
  detectDuplicateRegnInFile,
};
