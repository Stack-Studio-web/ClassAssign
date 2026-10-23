/** Calendar YYYY-MM-DD using local Y/M/D (avoid UTC day shift for IST). */
export function normalizeApiDate(dateStr) {
  if (!dateStr) return "";
  if (dateStr instanceof Date && !Number.isNaN(dateStr.getTime())) {
    const y = dateStr.getFullYear();
    const m = String(dateStr.getMonth() + 1).padStart(2, "0");
    const d = String(dateStr.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const raw = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) && !raw.includes("T")) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return raw.slice(0, 10);
}

export function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const raw = normalizeApiDate(dateStr);
  const [y, m, d] = raw.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return raw;
}

export function parseExamTimeRange(examTime) {
  if (!examTime) return { startTime: "", endTime: "" };
  const normalized = String(examTime).replace(/\u2013|\u2014/g, "-");
  const parts = normalized.split("-").map((s) => s.trim());
  const pickTime = (value) => {
    const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
    if (!match) return value || "";
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  };
  return {
    startTime: pickTime(parts[0]),
    endTime: pickTime(parts[1]),
  };
}

function normalizeMergeRegn(regn) {
  return String(regn || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizeMergeCourse(course) {
  return String(course || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function mergeCourseAttendance(seatingData, savedStudents = [], draftCourses = null) {
  const byRegCourse = new Map();
  const byReg = new Map();
  for (const s of savedStudents || []) {
    const reg = normalizeMergeRegn(s.regnNo || s.regNo);
    if (!reg) continue;
    const course = normalizeMergeCourse(s.courseCode || s.course);
    if (course) byRegCourse.set(`${reg}::${course}`, s);
    if (!byReg.has(reg)) byReg.set(reg, []);
    byReg.get(reg).push(s);
  }

  const draftByReg = {};
  if (draftCourses) {
    for (const course of draftCourses) {
      for (const st of course.students || []) {
        if (st.regNo) draftByReg[normalizeMergeRegn(st.regNo)] = st.status;
      }
    }
  }

  return (seatingData.courses || []).map((course) => ({
    courseCode: course.courseCode,
    courseName: course.courseName,
    expanded: true,
    students: (course.students || []).map((st) => {
      const regNo = String(st.regNo || st.regnNo || "").trim();
      const regKey = normalizeMergeRegn(regNo);
      const courseKey = normalizeMergeCourse(course.courseCode || st.courseCode);
      let saved = courseKey ? byRegCourse.get(`${regKey}::${courseKey}`) : null;
      if (!saved) {
        const list = byReg.get(regKey) || [];
        if (list.length === 1) saved = list[0];
        else if (list.length > 1 && courseKey) {
          saved =
            list.find(
              (s) =>
                normalizeMergeCourse(s.courseCode || s.course) === courseKey
            ) || null;
        }
      }
      const draftStatus = draftByReg[regKey];
      return {
        regNo,
        name: st.name || st.studentName || regNo,
        studentUuid: saved?.uuid ?? saved?.studentUuid ?? null,
        status: draftStatus || saved?.status || "Present",
      };
    }),
  }));
}

export function createRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
