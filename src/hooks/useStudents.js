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

export function useStudentsQuery({
  page,
  limit,
  search,
  filters,
  sortBy,
  sortOrder,
  batchId,
  contextReady = false,
  enabled = true,
}) {
  const queryClient = useQueryClient();
  const params = buildStudentsQueryParams({
    page,
    limit,
    search,
    filters,
    sortBy,
    sortOrder,
    batchId,
  });

  const canFetch = enabled && (Boolean(batchId) || contextReady);

  const query = useQuery({
    queryKey: [STUDENTS_QUERY_KEY, params],
    queryFn: () => fetchStudentsPage(params),
    enabled: canFetch,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!canFetch || !query.data?.pagination?.hasNext) return;
    const nextParams = buildStudentsQueryParams({
      page: page + 1,
      limit,
      search,
      filters,
      sortBy,
      sortOrder,
      batchId,
    });
    queryClient.prefetchQuery({
      queryKey: [STUDENTS_QUERY_KEY, nextParams],
      queryFn: () => fetchStudentsPage(nextParams),
      staleTime: 60_000,
    });
  }, [canFetch, batchId, page, limit, search, filters, sortBy, sortOrder, query.data, queryClient]);

  return query;
}

export function useStudentFilterOptions(batchId, enabled = true, contextReady = false) {
  return useQuery({
    queryKey: [STUDENTS_QUERY_KEY, "filter-options", batchId ?? "all"],
    queryFn: () => fetchStudentFilterOptions(batchId),
    enabled: enabled && (Boolean(batchId) || contextReady),
    staleTime: 5 * 60_000,
  });
}

export function useStudentCourseStats({
  page = 1,
  limit = 12,
  batchId,
  contextReady = false,
  enabled = true,
} = {}) {
  return useQuery({
    queryKey: [STUDENTS_QUERY_KEY, "course-stats", { page, limit, batchId: batchId ?? "all" }],
    queryFn: () => fetchStudentCourseStats({ page, limit, batchId }),
    enabled: enabled && (Boolean(batchId) || contextReady),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useStudentStatsTotal(batchId, enabled = true, contextReady = false) {
  return useQuery({
    queryKey: [STUDENTS_QUERY_KEY, "stats", batchId ?? "all"],
    queryFn: () => fetchStudentStatsTotal(batchId),
    enabled: enabled && (Boolean(batchId) || contextReady),
    staleTime: 60_000,
  });
}

export function invalidateStudentsQueries(queryClient) {
  return queryClient.invalidateQueries({ queryKey: [STUDENTS_QUERY_KEY] });
}
