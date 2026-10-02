/**
 * Timetable bulk-import parsing & validation.
 *
 * Columns match Timetable → Add Schedule:
 * Date | Start Time | End Time | Session | Department | Course Code | Course Name | Batch | Exam Type
 *
 * Batch is the Academic Context Batch name (e.g. 2024-2028), same as Manual Entry.
 * Legacy YY+Dept codes (e.g. 24BCS) are still accepted when they resolve in context.
 */

const LEGACY_BATCH_PATTERN = /^[0-9]{2}[A-Z]{2,10}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_SESSIONS = new Set(["FN", "AN"]);
const ALLOWED_EXAM_TYPES = new Set(["CAT1", "CAT2", "SEM"]);

function excelSerialToYmd(serial) {
  const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
  const parsed = new Date(EXCEL_EPOCH + Number(serial) * 86400000);
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateCell(date) {
  if (date == null || date === "") return { error: "Date is required" };

  let formatted;
  if (typeof date === "number") {
    formatted = excelSerialToYmd(date);
  } else if (date instanceof Date && !Number.isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    formatted = `${year}-${month}-${day}`;
  } else if (typeof date === "string") {
    const trimmed = date.trim();
    if (DATE_PATTERN.test(trimmed)) {
      formatted = trimmed;
    } else {
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) return { error: "Invalid date format. Expected YYYY-MM-DD." };
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      formatted = `${year}-${month}-${day}`;
    }
  } else {
    return { error: "Invalid date format. Expected YYYY-MM-DD." };
  }

  if (!DATE_PATTERN.test(formatted)) {
    return { error: "Invalid date format. Expected YYYY-MM-DD." };
  }

  const [y, m, d] = formatted.split("-").map(Number);
  const asUtc = new Date(Date.UTC(y, m - 1, d));
  if (
    asUtc.getUTCFullYear() !== y ||
    asUtc.getUTCMonth() !== m - 1 ||
    asUtc.getUTCDate() !== d
  ) {
    return { error: "Invalid date value." };
  }

  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (formatted < todayYmd) {
    return { error: "Date must be today or a future date." };
  }

  return { value: formatted };
}

function parseTimeCell(value, label) {
  if (value == null || value === "") return { error: `${label} is required` };

  let hhmm;
  if (typeof value === "number" && Number.isFinite(value)) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    hhmm = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  } else {
    const raw = String(value).trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return { error: `${label} must be HH:MM (24-hour).` };
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return { error: `${label} must be HH:MM (24-hour).` };
    hhmm = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  if (!TIME_PATTERN.test(hhmm)) {
    return { error: `${label} must be HH:MM (24-hour).` };
  }
  return { value: hhmm };
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function cell(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== "") return row[key];
  }
  return "";
}

/**
 * Parse + validate one Excel row (sync field checks only).
 * Async existence checks happen in validateTimetableRows.
 */
function parseTimetableRow(row, rowNum) {
  const errors = [];

  const dateRaw = cell(row, "Date", "date");
  const startRaw = cell(row, "Start Time", "startTime", "start_time");
  const endRaw = cell(row, "End Time", "endTime", "end_time");
  const sessionRaw = cell(row, "Session", "session");
  const departmentRaw = String(cell(row, "Department", "department") || "").trim();
  const courseCode = String(cell(row, "Course Code", "courseCode", "course_code") || "").trim();
  const courseName = String(cell(row, "Course Name", "courseName", "course_name") || "").trim();
  const batchRaw = String(cell(row, "Batch", "batch") || "").trim();
  const examTypeRaw = String(cell(row, "Exam Type", "examType", "exam_type") || "").trim();

  const dateResult = parseDateCell(dateRaw === "" ? null : dateRaw);
  if (dateResult.error) errors.push(dateResult.error);

  const startResult = parseTimeCell(startRaw === "" ? null : startRaw, "Start Time");
  if (startResult.error) errors.push(startResult.error);

  const endResult = parseTimeCell(endRaw === "" ? null : endRaw, "End Time");
  if (endResult.error) errors.push(endResult.error);

  if (startResult.value && endResult.value) {
    if (timeToMinutes(endResult.value) <= timeToMinutes(startResult.value)) {
      errors.push("End Time must be after Start Time.");
    }
  }

  const session = String(sessionRaw);
  if (!session) {
    errors.push("Session is required.");
  } else if (!ALLOWED_SESSIONS.has(session)) {
    errors.push("Session must be FN or AN (case-sensitive).");
  }

  const department = departmentRaw.toUpperCase();
  if (!departmentRaw) {
    errors.push("Department is required.");
  } else if (departmentRaw !== department) {
    errors.push(`Department must be uppercase (e.g. ${department}).`);
  } else if (!/^[A-Z]{2,10}$/.test(department)) {
    errors.push("Department must be an uppercase code (e.g. BCS, BAD, BIT).");
  }

  if (!courseCode) errors.push("Course Code is required.");
  if (!courseName) errors.push("Course Name is required.");

  // Batch = Academic Context batch name (e.g. 2024-2028), same as Add Schedule.
  const batch = batchRaw;
  if (!batch) {
    errors.push("Batch is required (use the Batch name from Batch Management, e.g. 2024-2028).");
  } else if (LEGACY_BATCH_PATTERN.test(batch) && department && batch.slice(2) !== department) {
    errors.push(
      `Batch ${batch} does not match Department ${department}. Expected a batch such as ${batch.slice(0, 2)}${department}.`
    );
  }

  const examType = examTypeRaw.replace(/\s+/g, "");
  if (!examTypeRaw) {
    errors.push("Exam Type is required.");
  } else if (examTypeRaw !== examType || !ALLOWED_EXAM_TYPES.has(examType)) {
    if (ALLOWED_EXAM_TYPES.has(examType) && examTypeRaw !== examType) {
      errors.push("Exam Type must be CAT1, CAT2, or SEM (no spaces, uppercase).");
    } else if (!ALLOWED_EXAM_TYPES.has(examTypeRaw)) {
      errors.push("Exam Type must be CAT1, CAT2, or SEM (case-sensitive).");
    }
  }

  if (session && startResult.value && !errors.some((e) => e.includes("Session"))) {
    const startMin = timeToMinutes(startResult.value);
    if (session === "FN" && startMin >= 12 * 60) {
      errors.push("Session FN is inconsistent with Start Time (afternoon).");
    }
    if (session === "AN" && startMin < 12 * 60) {
      errors.push("Session AN is inconsistent with Start Time (forenoon).");
    }
  }

  return {
    rowNum,
    date: dateResult.value || "",
    startTime: startResult.value || "",
    endTime: endResult.value || "",
    session: ALLOWED_SESSIONS.has(session) ? session : session,
    courseCode,
    courseName,
    department: department || departmentRaw,
    batch,
    examType: ALLOWED_EXAM_TYPES.has(examTypeRaw) ? examTypeRaw : examType,
    errors,
    batchId: null,
  };
}

async function validateTimetableRows(rawRows, opts = {}, helpers = {}) {
  const {
    findBatchByName,
    courseExistsForDeptBatch,
    departmentExists,
  } = helpers;

  const knownDepartments = helpers.knownDepartments || null;
  const preview = [];
  let validCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2;
    const parsed = parseTimetableRow(rawRows[i], rowNum);

    const empty =
      !parsed.date &&
      !parsed.startTime &&
      !parsed.endTime &&
      !parsed.courseCode &&
      !parsed.courseName &&
      !parsed.department &&
      !parsed.batch &&
      !parsed.examType;
    if (empty) continue;

    if (opts.role === "hod" && opts.department) {
      const hodDept = String(opts.department).toUpperCase().trim();
      if (parsed.department && parsed.department !== hodDept) {
        parsed.errors.push(`HoD can only import for department ${hodDept}.`);
      }
    }

    if (parsed.department && !parsed.errors.some((e) => e.startsWith("Department"))) {
      let deptOk = true;
      if (typeof departmentExists === "function") {
        deptOk = await departmentExists(parsed.department);
      } else if (Array.isArray(knownDepartments) && knownDepartments.length) {
        deptOk = knownDepartments.map((d) => String(d).toUpperCase()).includes(parsed.department);
      }
      if (!deptOk) {
        parsed.errors.push(`Department ${parsed.department} is not a recognized department.`);
      }
    }

    if (
      parsed.batch &&
      !parsed.errors.some((e) => e.includes("Batch")) &&
      typeof findBatchByName === "function"
    ) {
      const found = await findBatchByName(parsed.batch, parsed.department);
      if (!found) {
        parsed.errors.push(
          `Batch "${parsed.batch}" does not exist for the selected academic context. Use the Batch name from Batch Management (e.g. 2024-2028).`
        );
      } else {
        parsed.batchId = found.id ?? found.batchId ?? null;
        if (found.name) parsed.batch = String(found.name).trim();
      }
    }

    if (
      parsed.courseCode &&
      parsed.department &&
      parsed.batch &&
      typeof courseExistsForDeptBatch === "function" &&
      !parsed.errors.some(
        (e) => e.includes("Course Code") || e.includes("Department") || e.includes("Batch")
      )
    ) {
      const courseCheck = await courseExistsForDeptBatch(
        parsed.courseCode,
        parsed.department,
        parsed.batch,
        parsed.batchId
      );
      if (!courseCheck?.ok) {
        parsed.errors.push(
          courseCheck?.message ||
            `Course Code ${parsed.courseCode} was not found for Department ${parsed.department} / Batch ${parsed.batch}.`
        );
      } else if (courseCheck.courseName && !parsed.courseName) {
        parsed.courseName = courseCheck.courseName;
      }
    }

    const status = parsed.errors.length ? "ERROR" : "VALID";
    if (status === "VALID") validCount += 1;
    else errorCount += 1;

    preview.push({
      rowNum: parsed.rowNum,
      date: parsed.date,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      session: parsed.session,
      courseCode: parsed.courseCode,
      courseName: parsed.courseName,
      department: parsed.department,
      batch: parsed.batch,
      batchId: parsed.batchId,
      examType: parsed.examType,
      status,
      errors: parsed.errors,
      error: parsed.errors[0] || null,
    });
  }

  return {
    rows: preview,
    validCount,
    errorCount,
    total: preview.length,
    canImport: preview.length > 0 && errorCount === 0,
    message:
      preview.length === 0
        ? "No timetable rows found in the file."
        : errorCount > 0
          ? "Import blocked. Please correct the errors before importing."
          : "All timetable records validated successfully.",
  };
}

module.exports = {
  BATCH_PATTERN: LEGACY_BATCH_PATTERN,
  LEGACY_BATCH_PATTERN,
  parseTimetableRow,
  validateTimetableRows,
  parseDateCell,
  parseTimeCell,
};
