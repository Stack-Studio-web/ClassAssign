import { useCallback, useEffect, useState } from "react";
import { fetchBatches } from "../lib/academicApi";
import { isBatchActive } from "../lib/batchStatus";

/**
 * Loads batch lists for each semester to compute student & batch counts.
 * @param {Array<{ uuid: string }>} semesters
 */
export function useSemesterBatchStats(semesters) {
  const [statsBySemester, setStatsBySemester] = useState({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!semesters?.length) {
      setStatsBySemester({});
      return;
    }
    setLoading(true);
    try {
      const entries = await Promise.all(
        semesters.map(async (sem) => {
          const batches = await fetchBatches(sem.uuid);
          const active = batches.filter((b) => isBatchActive(b));
          const studentCount = active.reduce((sum, b) => sum + (b.studentCount ?? 0), 0);
          return [
            sem.uuid,
            {
              batches: active,
              batchCount: active.length,
              studentCount,
              draftBatchCount: active.filter((b) => (b.studentCount ?? 0) === 0).length,
            },
          ];
        })
      );
      setStatsBySemester(Object.fromEntries(entries));
    } catch {
      setStatsBySemester({});
    } finally {
      setLoading(false);
    }
  }, [semesters]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { statsBySemester, loading, refreshStats: refresh };
}

export function computeYearEnrollment(semesters, statsBySemester) {
  return semesters.reduce(
    (sum, sem) => sum + (statsBySemester[sem.uuid]?.studentCount ?? 0),
    0
  );
}
