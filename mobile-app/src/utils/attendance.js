export function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const raw = String(dateStr).includes("T") ? dateStr.split("T")[0] : dateStr;
  const [y, m, d] = raw.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return raw;
}

export function normalizeApiDate(dateStr) {
  if (!dateStr) return "";
  const raw = String(dateStr).trim();
  if (raw.includes("T")) return raw.split("T")[0];
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

export function mergeCourseAttendance(seatingData, savedStudents = [], draftCourses = null) {
  const savedByReg = {};
  for (const s of savedStudents) {
    const reg = String(s.regnNo || s.regNo || "").trim();
    if (reg) savedByReg[reg] = s;
  }

  const draftByReg = {};
  if (draftCourses) {
    for (const course of draftCourses) {
      for (const st of course.students || []) {
        if (st.regNo) draftByReg[st.regNo] = st.status;
      }
    }
  }

  return (seatingData.courses || []).map((course) => ({
    courseCode: course.courseCode,
    courseName: course.courseName,
    expanded: true,
    students: (course.students || []).map((st) => {
      const regNo = String(st.regNo || st.regnNo || "").trim();
      const saved = savedByReg[regNo];
      const draftStatus = draftByReg[regNo];
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
