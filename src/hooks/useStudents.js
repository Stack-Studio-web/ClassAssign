import { useEffect } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  STUDENTS_QUERY_KEY,
  fetchStudentsPage,
  fetchStudentFilterOptions,
  fetchStudentCourseStats,
  fetchStudentStatsTotal,
  buildStudentsQueryParams,
} from "../lib/studentsApi";

export function useStudentsQuery({ page, limit, search, filters, sortBy, sortOrder, enabled = true }) {
  const queryClient = useQueryClient();
  const params = buildStudentsQueryParams({ page, limit, search, filters, sortBy, sortOrder });

  const query = useQuery({
    queryKey: [STUDENTS_QUERY_KEY, params],
    queryFn: () => fetchStudentsPage(params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!enabled || !query.data?.pagination?.hasNext) return;
    const nextParams = buildStudentsQueryParams({
      page: page + 1,
      limit,
      search,
      filters,
      sortBy,
      sortOrder,
    });
    queryClient.prefetchQuery({
      queryKey: [STUDENTS_QUERY_KEY, nextParams],
      queryFn: () => fetchStudentsPage(nextParams),
      staleTime: 60_000,
    });
  }, [enabled, page, limit, search, filters, sortBy, sortOrder, query.data, queryClient]);

  return query;
}

export function useStudentFilterOptions(enabled = true) {
  return useQuery({
    queryKey: [STUDENTS_QUERY_KEY, "filter-options"],
    queryFn: fetchStudentFilterOptions,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useStudentCourseStats({ page = 1, limit = 12, enabled = true } = {}) {
  return useQuery({
    queryKey: [STUDENTS_QUERY_KEY, "course-stats", { page, limit }],
    queryFn: () => fetchStudentCourseStats({ page, limit }),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useStudentStatsTotal(enabled = true) {
  return useQuery({
    queryKey: [STUDENTS_QUERY_KEY, "stats"],
    queryFn: fetchStudentStatsTotal,
    enabled,
    staleTime: 60_000,
  });
}

export function invalidateStudentsQueries(queryClient) {
  return queryClient.invalidateQueries({ queryKey: [STUDENTS_QUERY_KEY] });
}
