/**
 * Department code → official display name for COE documents.
 * Codes themselves always come from the existing department/filter API.
 */
const DEPARTMENT_DISPLAY_NAMES = {
  CSE: "COMPUTER SCIENCE AND ENGINEERING",
  BCS: "COMPUTER SCIENCE AND ENGINEERING",
  IT: "INFORMATION TECHNOLOGY",
  BIT: "INFORMATION TECHNOLOGY",
  ECE: "ELECTRONICS AND COMMUNICATION ENGINEERING",
  BEC: "ELECTRONICS AND COMMUNICATION ENGINEERING",
  EEE: "ELECTRICAL AND ELECTRONICS ENGINEERING",
  BEE: "ELECTRICAL AND ELECTRONICS ENGINEERING",
  MECH: "MECHANICAL ENGINEERING",
  ME: "MECHANICAL ENGINEERING",
  BME: "MECHANICAL ENGINEERING",
  CIVIL: "CIVIL ENGINEERING",
  CE: "CIVIL ENGINEERING",
  BCE: "CIVIL ENGINEERING",
  AIDS: "ARTIFICIAL INTELLIGENCE AND DATA SCIENCE",
  AD: "ARTIFICIAL INTELLIGENCE AND DATA SCIENCE",
  BAD: "ARTIFICIAL INTELLIGENCE AND DATA SCIENCE",
  AIML: "ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING",
  AI: "ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING",
  MCA: "MASTER OF COMPUTER APPLICATIONS",
  BT: "BIOTECHNOLOGY",
  BBT: "BIOTECHNOLOGY",
  EIE: "ELECTRONICS AND INSTRUMENTATION ENGINEERING",
};

function departmentDisplayName(codeOrName) {
  const raw = String(codeOrName || "").trim();
  if (!raw) return "";
  const key = raw.toUpperCase();
  if (DEPARTMENT_DISPLAY_NAMES[key]) return DEPARTMENT_DISPLAY_NAMES[key];
  // Already a full name
  if (raw.includes(" ")) return raw.toUpperCase();
  return key;
}

function departmentBranchCode(codeOrName) {
  const raw = String(codeOrName || "").trim().toUpperCase();
  if (!raw) return "";
  // Prefer short code when we have a known alias
  const reverse = {
    "INFORMATION TECHNOLOGY": "IT",
    "COMPUTER SCIENCE AND ENGINEERING": "CSE",
    "ELECTRONICS AND COMMUNICATION ENGINEERING": "ECE",
    "ELECTRICAL AND ELECTRONICS ENGINEERING": "EEE",
    "MECHANICAL ENGINEERING": "MECH",
    "CIVIL ENGINEERING": "CIVIL",
    "ARTIFICIAL INTELLIGENCE AND DATA SCIENCE": "AIDS",
    "ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING": "AIML",
    "MASTER OF COMPUTER APPLICATIONS": "MCA",
    BIOTECHNOLOGY: "BT",
  };
  if (reverse[raw]) return reverse[raw];
  // Map storage codes to display branch codes
  const aliases = {
    BIT: "IT",
    BCS: "CSE",
    BEC: "ECE",
    BEE: "EEE",
    BME: "MECH",
    BCE: "CIVIL",
    BAD: "AIDS",
    AD: "AIDS",
  };
  return aliases[raw] || raw;
}

function toRoman(num) {
  const n = Number(num);
  if (!Number.isFinite(n) || n <= 0) return null;
  const map = [
    [10, "X"],
    [9, "IX"],
    [8, "VIII"],
    [7, "VII"],
    [6, "VI"],
    [5, "V"],
    [4, "IV"],
    [3, "III"],
    [2, "II"],
    [1, "I"],
  ];
  let remaining = Math.floor(n);
  let out = "";
  for (const [v, s] of map) {
    while (remaining >= v) {
      out += s;
      remaining -= v;
    }
  }
  return out || String(n);
}

function deriveDegree(department, batchName = "") {
  const d = String(department || "").toUpperCase();
  const b = String(batchName || "").toUpperCase();
  if (d.includes("MCA") || b.includes("MCA")) return "MCA";
  if (d.includes("MBA") || b.includes("MBA")) return "MBA";
  if (d.includes("MTECH") || d.startsWith("MT") || b.includes("MT")) return "M.Tech";
  if (d.includes("M.E") || d.includes("ME ")) return "M.E";
  return "B.Tech";
}

/** Map COE assessment label → exam_type values stored in timetable */
function examTypesForAssessment(assessment) {
  const a = String(assessment || "").trim().toUpperCase();
  if (a === "CAT 1" || a === "CAT1") return ["CAT1", "CAT 1"];
  if (a === "CAT 2" || a === "CAT2") return ["CAT2", "CAT 2"];
  if (a.includes("SUMMATIVE") && a.includes("II")) {
    return ["SEM2", "SA2", "SUMMATIVE ASSESSMENT - II", "SUMMATIVE-II"];
  }
  if (a.includes("SUMMATIVE") && a.includes("I")) {
    return ["SEM", "SEM1", "SA1", "SUMMATIVE ASSESSMENT - I", "SUMMATIVE-I"];
  }
  return [String(assessment || "").trim()].filter(Boolean);
}

function parseScheduleKey(schedule) {
  // "SEPTEMBER 2026" or "2026-09"
  const s = String(schedule || "").trim();
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    return { year: Number(ym[1]), month: Number(ym[2]) };
  }
  const months = {
    JANUARY: 1,
    FEBRUARY: 2,
    MARCH: 3,
    APRIL: 4,
    MAY: 5,
    JUNE: 6,
    JULY: 7,
    AUGUST: 8,
    SEPTEMBER: 9,
    OCTOBER: 10,
    NOVEMBER: 11,
    DECEMBER: 12,
  };
  const m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const month = months[m[1].toUpperCase()];
    const year = Number(m[2]);
    if (month && year) return { year, month };
  }
  return null;
}

function formatScheduleLabel(year, month) {
  const names = [
    "",
    "JANUARY",
    "FEBRUARY",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER",
  ];
  return `${names[month]} ${year}`;
}

module.exports = {
  DEPARTMENT_DISPLAY_NAMES,
  departmentDisplayName,
  departmentBranchCode,
  toRoman,
  deriveDegree,
  examTypesForAssessment,
  parseScheduleKey,
  formatScheduleLabel,
};
