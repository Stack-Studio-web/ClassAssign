/**
 * Pure helpers for Datewise Attendance Statement (unit-tested without DB).
 */

function normalizeTime(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(
      value.getMinutes()
    ).padStart(2, "0")}`;
  }
  const match = String(value).trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return String(value).trim().slice(0, 5);
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function normalizeDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}/.test(str) && !str.includes("T")) return str.slice(0, 10);
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return str.includes("T") ? str.split("T")[0] : str.slice(0, 10);
}

function normalizeRegnKey(regn) {
  return String(regn || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function formatTime12h(value) {
  const norm = normalizeTime(value);
  if (!norm || !norm.includes(":")) return String(value || "");
  const [hStr, mStr] = norm.split(":");
  let hour = Number(hStr);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${mStr} ${ampm}`;
}

function sessionLabel(examSession, startTime, endTime) {
  const session = String(examSession || "").trim() || "—";
  const start = formatTime12h(startTime);
  const end = formatTime12h(endTime);
  if (start && end) return `${session} — ${start} to ${end}`;
  return session;
}

function sessionValue(examSession, startTime, endTime) {
  return `${String(examSession || "").trim()}|${normalizeTime(startTime)}|${normalizeTime(endTime)}`;
}

function parseSessionValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return { examSession: "", startTime: "", endTime: "" };
  const parts = raw.split("|");
  if (parts.length >= 3) {
    return {
      examSession: parts[0],
      startTime: normalizeTime(parts[1]),
      endTime: normalizeTime(parts[2]),
    };
  }
  return { examSession: raw, startTime: "", endTime: "" };
}

/**
 * Continuous roll range when same prefix + consecutive numbers; otherwise list.
 */
function formatRollDisplay(rolls) {
  const unique = [
    ...new Set(
      (rolls || [])
        .map((r) => String(r || "").trim())
        .filter((r) => r && r !== "0" && r !== "-")
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (unique.length === 0) return "—";
  if (unique.length === 1) return unique[0];

  const parsed = unique.map((r) => {
    const m = String(r).match(/^(.*?)(\d+)$/);
    if (!m) return null;
    return { prefix: m[1], num: Number(m[2]), raw: r, width: m[2].length };
  });

  if (parsed.every((p) => p && p.prefix === parsed[0].prefix)) {
    const nums = parsed.map((p) => p.num).sort((a, b) => a - b);
    let continuous = true;
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] !== nums[i - 1] + 1) {
        continuous = false;
        break;
      }
    }
    if (continuous) {
      return `${unique[0]} - ${unique[unique.length - 1]}`;
    }
  }

  if (unique.length <= 8) return unique.join(", ");
  return `${unique[0]}, …, ${unique[unique.length - 1]} (${unique.length})`;
}

/**
 * Group distinct students by hall + branch.
 * @param {Array<{hallNo, facultyName, branch, regNo}>} students
 * @param {Map<string, 'Absent'|'Present'>} attendanceByRegnKey - only keys with marked status
 * @param {Set<string>} markedRegnKeys - all students who have ANY attendance row for the venue
 * @param {boolean} venueHasAttendance - whether the venue has any attendance records
 */
function buildHallBranchRows(students, { attendanceByRegnKey, venueAttendanceReady } = {}) {
  const groups = new Map();

  for (const s of students || []) {
    const hallNo = String(s.hallNo || "").trim() || "—";
    const branch = String(s.branch || "").trim() || "—";
    const facultyName = String(s.facultyName || "").trim() || "—";
    const regNo = String(s.regNo || "").trim();
    if (!regNo || regNo === "0" || regNo === "-") continue;

    const key = `${hallNo}::${branch}`;
    if (!groups.has(key)) {
      groups.set(key, {
        hallNo,
        name: facultyName,
        branch,
        rolls: [],
        rollKeys: new Set(),
      });
    }
    const g = groups.get(key);
    const rk = normalizeRegnKey(regNo);
    if (g.rollKeys.has(rk)) continue;
    g.rollKeys.add(rk);
    g.rolls.push(regNo);
    if (facultyName && g.name === "—") g.name = facultyName;
  }

  const rows = [];
  for (const g of groups.values()) {
    let absentCount = 0;
    if (venueAttendanceReady && attendanceByRegnKey) {
      for (const reg of g.rolls) {
        if (attendanceByRegnKey.get(normalizeRegnKey(reg)) === "Absent") {
          absentCount += 1;
        }
      }
    }

    rows.push({
      hallNo: g.hallNo,
      name: g.name,
      branch: g.branch,
      rollNo: formatRollDisplay(g.rolls),
      totalStudents: g.rolls.length,
      totalAbsentees: venueAttendanceReady ? absentCount : null,
      signature: "",
    });
  }

  rows.sort(
    (a, b) =>
      String(a.hallNo).localeCompare(String(b.hallNo)) ||
      String(a.branch).localeCompare(String(b.branch))
  );
  return rows;
}

function flattenLayoutRegns(layoutJson) {
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
      const seats = Array.isArray(cell)
        ? cell
        : cell && typeof cell === "object"
          ? [cell]
          : [];
      for (const seat of seats) {
        if (!seat || typeof seat !== "object") continue;
        if (seat.blocked === true) continue;
        const regNo = String(
          seat.regn_no ?? seat.regnNo ?? seat.regNo ?? ""
        ).trim();
        if (!regNo || regNo === "-" || regNo === "0") continue;
        const key = normalizeRegnKey(regNo);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(regNo);
      }
    }
  }
  return out;
}

module.exports = {
  normalizeTime,
  normalizeDate,
  normalizeRegnKey,
  formatTime12h,
  sessionLabel,
  sessionValue,
  parseSessionValue,
  formatRollDisplay,
  buildHallBranchRows,
  flattenLayoutRegns,
};
