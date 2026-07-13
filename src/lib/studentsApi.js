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

export async function fetchStudentFilterOptions() {
  const res = await api.get("/students/filter-options");
  return res.data?.data ?? res.data ?? {};
}

export async function fetchStudentCourseStats(params = {}) {
  const res = await api.get("/students/course-stats", {
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? 12,
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

export async function fetchStudentStatsTotal() {
  const res = await api.get("/students/stats");
  return res.data?.totalStudents ?? res.data?.data?.totalStudents ?? 0;
}

export function buildStudentsQueryParams({
  page = 1,
  limit = 25,
  search = "",
  filters = {},
  sortBy = "studentName",
  sortOrder = "asc",
}) {
  const params = {
    page,
    limit,
    sortBy,
    sortOrder,
  };
  const q = String(search || "").trim();
  if (q) params.search = q;
  if (filters.year) params.year = filters.year;
  if (filters.batch) params.batch = filters.batch;
  if (filters.department) params.department = filters.department;
  if (filters.section) params.section = filters.section;
  if (filters.courseName) params.courseName = filters.courseName;
  if (filters.courseDescription) params.courseDescription = filters.courseDescription;
  return params;
}
