import api from "../lib/api";

export const STUDENTS_QUERY_KEY = "students";

export async function fetchStudentsPage(params) {
  const res = await api.get("/students", { params });
  const body = res.data;

  const defaultPagination = {
    page: Number(params.page) || 1,
    limit: Number(params.limit) || 25,
    totalItems: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false,
  };

  // Api.success → { success, data: { students, pagination } }
  if (body?.data?.students && Array.isArray(body.data.students)) {
    return {
      students: body.data.students,
      pagination: body.data.pagination ?? defaultPagination,
    };
  }

  // Unwrapped paginated shape
  if (body?.students && Array.isArray(body.students)) {
    return {
      students: body.students,
      pagination: body.pagination ?? defaultPagination,
    };
  }

  // Legacy raw array (backward compatibility)
  if (Array.isArray(body)) {
    const total = body.length;
    return {
      students: body,
      pagination: {
        page: 1,
        limit: total,
        totalItems: total,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    };
  }

  if (Array.isArray(body?.data)) {
    const total = body.data.length;
    return {
      students: body.data,
      pagination: {
        page: 1,
        limit: total,
        totalItems: total,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    };
  }

  return { students: [], pagination: defaultPagination };
}

export async function fetchStudentFilterOptions(batchId) {
  const res = await api.get("/students/filter-options", {
    params: batchId ? { batchId } : undefined,
  });
  return res.data?.data ?? res.data ?? {};
}

export async function fetchStudentCourseStats(params = {}) {
  const res = await api.get("/students/course-stats", {
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? 12,
      ...(params.batchId ? { batchId: params.batchId } : {}),
    },
  });
  const body = res.data?.data ?? res.data ?? {};
  const defaultPagination = {
    page: Number(params.page) || 1,
    limit: Number(params.limit) || 12,
    totalItems: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false,
  };

  if (body?.courses && Array.isArray(body.courses)) {
    return {
      courses: body.courses,
      pagination: body.pagination ?? defaultPagination,
    };
  }

  if (Array.isArray(body)) {
    const total = body.length;
    return {
      courses: body,
      pagination: {
        page: 1,
        limit: total,
        totalItems: total,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    };
  }

  return { courses: [], pagination: defaultPagination };
}

export async function fetchStudentStatsTotal(batchId) {
  const res = await api.get("/students/stats", {
    params: batchId ? { batchId } : undefined,
  });
  return res.data?.totalStudents ?? res.data?.data?.totalStudents ?? 0;
}

export function buildStudentsQueryParams({
  page = 1,
  limit = 25,
  search = "",
  filters = {},
  sortBy = "studentName",
  sortOrder = "asc",
  batchId = null,
}) {
  const params = {
    page,
    limit,
    sortBy,
    sortOrder,
  };
  if (batchId) params.batchId = batchId;
  const q = String(search || "").trim();
  if (q) params.search = q;
  if (filters.year) params.year = filters.year;
  if (filters.batch) params.batch = filters.batch;
  if (filters.department) params.department = filters.department;
  if (filters.section) params.section = filters.section;
  if (filters.courseName) params.courseName = filters.courseName;
  if (filters.courseDescription) params.courseDescription = filters.courseDescription;
  if (filters.createdBy) params.createdBy = filters.createdBy;
  return params;
}

function escapeCsvCell(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Export all students in a batch as CSV (scoped by batch UUID). */
export async function exportStudentsCsv(batchUuid, batchLabel = "batch") {
  if (!batchUuid) throw new Error("Batch UUID is required for export.");

  const allStudents = [];
  let page = 1;
  const limit = 500;
  let hasNext = true;

  while (hasNext) {
    const params = buildStudentsQueryParams({ batchId: batchUuid, page, limit });
    const { students, pagination } = await fetchStudentsPage(params);
    allStudents.push(...students);
    hasNext = pagination.hasNext;
    page += 1;
    if (page > 200) break;
  }

  const header = ["Registration No", "Student Name", "Course Name", "Course Code", "Email"];
  const rows = allStudents.map((s) =>
    [
      escapeCsvCell(s.regnNo),
      escapeCsvCell(s.studentName),
      escapeCsvCell(s.courseName),
      escapeCsvCell(s.courseDescription),
      escapeCsvCell(s.email),
    ].join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = String(batchLabel).replace(/[^\w\-]+/g, "_");
  link.href = url;
  link.download = `students_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  return allStudents.length;
}
