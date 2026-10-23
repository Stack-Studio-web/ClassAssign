/**
 * Pure helpers for Datewise Seating Allotment Report (unit-tested without DB).
 * Seating-allotment only — no attendance logic.
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

/** Program / branch from regn, e.g. 26BCS119 → BCS (matches template). */
function branchFromRegn(regnNo) {
  if (!regnNo) return null;
  const match = String(regnNo).trim().toUpperCase().match(/^[0-9]{2}([A-Z]+)/);
  return match ? match[1] : null;
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

/** Exam time line for header: "9:00 AM - 11:30 AM" */
function examTimeLabel(startTime, endTime) {
  const start = formatTime12h(startTime);
  const end = formatTime12h(endTime);
  if (start && end) return `${start} - ${end}`;
  return start || end || "—";
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
 * Display uses en-dash for ranges (template style).
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
    return { prefix: m[1], num: Number(m[2]), raw: r };
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
      return `${unique[0]} – ${unique[unique.length - 1]}`;
    }
  }

  if (unique.length <= 8) return unique.join(", ");
  return `${unique[0]}, …, ${unique[unique.length - 1]} (${unique.length})`;
}

/**
 * Group distinct students by hall + branch (+ faculty).
 * Absentees intentionally omitted (blank on print).
 */
function buildHallBranchRows(students) {
  const groups = new Map();

  for (const s of students || []) {
    const hallNo = String(s.hallNo || "").trim() || "—";
    const branch = String(s.branch || branchFromRegn(s.regNo) || "").trim() || "—";
    const faculty = String(s.facultyName || s.name || "").trim() || "—";
    const regNo = String(s.regNo || "").trim();
    if (!regNo || regNo === "0" || regNo === "-") continue;

    const key = `${hallNo}::${faculty}::${branch}`;
    if (!groups.has(key)) {
      groups.set(key, {
        hallNo,
        faculty,
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
  }

  const rows = [];
  for (const g of groups.values()) {
    rows.push({
      hallNo: g.hallNo,
      faculty: g.faculty,
      name: g.faculty, // alias for older callers
      branch: g.branch,
      rollNo: formatRollDisplay(g.rolls),
      total: g.rolls.length,
      totalStudents: g.rolls.length,
      absentees: "",
      signature: "",
    });
  }

  rows.sort(
    (a, b) =>
      String(a.hallNo).localeCompare(String(b.hallNo)) ||
      String(a.faculty).localeCompare(String(b.faculty)) ||
      String(a.branch).localeCompare(String(b.branch))
  );
  return rows;
}

/**
 * Annotate rowspan for Hall No + Faculty when consecutive rows share them.
 * span > 1 on first row of group; span = 0 means skip cell (merged into above).
 */
function annotateHallFacultyMerge(rows) {
  const out = (rows || []).map((r) => ({
    ...r,
    hallSpan: 1,
    facultySpan: 1,
  }));
  let i = 0;
  while (i < out.length) {
    let j = i + 1;
    while (
      j < out.length &&
      out[j].hallNo === out[i].hallNo &&
      out[j].faculty === out[i].faculty
    ) {
      j += 1;
    }
    const span = j - i;
    out[i].hallSpan = span;
    out[i].facultySpan = span;
    for (let k = i + 1; k < j; k++) {
      out[k].hallSpan = 0;
      out[k].facultySpan = 0;
    }
    i = j;
  }
  return out;
}

function grandTotalStudents(rows) {
  return (rows || []).reduce(
    (sum, r) => sum + (Number(r.total ?? r.totalStudents) || 0),
    0
  );
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
  branchFromRegn,
  formatTime12h,
  sessionLabel,
  examTimeLabel,
  sessionValue,
  parseSessionValue,
  formatRollDisplay,
  buildHallBranchRows,
  annotateHallFacultyMerge,
  grandTotalStudents,
  flattenLayoutRegns,
};
