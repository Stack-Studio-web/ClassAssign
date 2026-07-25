import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchAcademicYears,
  fetchSemesters,
  fetchBatches,
} from "../lib/academicApi";
import { isSemesterCompleted } from "../lib/semesterStatus";

const STORAGE_KEY = "hallora_academic_context_v1";

const AcademicContext = createContext(null);

export function useAcademicContext() {
  const ctx = useContext(AcademicContext);
  if (!ctx) {
    throw new Error("useAcademicContext must be used within AcademicContextProvider");
  }
  return ctx;
}

function loadStored() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function pickDefaultYear(list) {
  if (!list?.length) return null;
  return list.find((y) => !y.isArchived) ?? list[0];
}

function matchYear(list, year) {
  if (!year?.uuid || !list?.length) return null;
  return list.find((y) => y.uuid === year.uuid) ?? null;
}

function matchSemester(list, semester) {
  if (!semester?.uuid || !list?.length) return null;
  return list.find((s) => s.uuid === semester.uuid) ?? null;
}

function matchBatch(list, batch) {
  if (!batch?.uuid || !list?.length) return null;
  return list.find((b) => b.uuid === batch.uuid) ?? null;
}

function isNotFoundError(err) {
  return err?.response?.status === 404;
}

export function AcademicContextProvider({ children }) {
  const stored = useRef(loadStored()).current;
  const [years, setYears] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedYear, setSelectedYear] = useState(stored.selectedYear ?? null);
  const [selectedSemester, setSelectedSemester] = useState(stored.selectedSemester ?? null);
  const [selectedBatch, setSelectedBatch] = useState(stored.selectedBatch ?? null);

  const selectionRef = useRef({
    year: stored.selectedYear ?? null,
    semester: stored.selectedSemester ?? null,
    batch: stored.selectedBatch ?? null,
  });

  useEffect(() => {
    selectionRef.current = {
      year: selectedYear,
      semester: selectedSemester,
      batch: selectedBatch,
    };
  }, [selectedYear, selectedSemester, selectedBatch]);

  const persist = useCallback((year, semester, batch) => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedYear: year,
        selectedSemester: semester,
        selectedBatch: batch,
      })
    );
    selectionRef.current = { year, semester, batch };
  }, []);

  const applySelection = useCallback(
    (year, semester, batch) => {
      setSelectedYear(year);
      setSelectedSemester(semester);
      setSelectedBatch(batch);
      persist(year, semester, batch);
    },
    [persist]
  );

  const loadSemestersAndBatches = useCallback(
    async (year, preferredSemester, preferredBatch) => {
      if (!year?.uuid) {
        setSemesters([]);
        setBatches([]);
        applySelection(null, null, null);
        return;
      }

      const semList = await fetchSemesters(year.uuid);
      setSemesters(semList);

      const semester = matchSemester(semList, preferredSemester);
      if (!semester) {
        setBatches([]);
        applySelection(year, null, null);
        return;
      }

      const batchList = await fetchBatches(semester.uuid);
      setBatches(batchList);
      const batch = matchBatch(batchList, preferredBatch);
      applySelection(year, semester, batch);
    },
    [applySelection]
  );

  const reconcileFromYears = useCallback(
    async (list, preferred) => {
      const prev = preferred ?? selectionRef.current;
      let year = matchYear(list, prev.year);
      let semester = prev.semester;
      let batch = prev.batch;

      if (!year) {
        year = pickDefaultYear(list);
        semester = null;
        batch = null;
      }

      setYears(list);

      if (!year) {
        setSemesters([]);
        setBatches([]);
        applySelection(null, null, null);
        return list;
      }

      try {
        await loadSemestersAndBatches(year, semester, batch);
      } catch (err) {
        if (isNotFoundError(err)) {
          const fallbackYear = pickDefaultYear(list);
          if (fallbackYear?.uuid === year.uuid) {
            setSemesters([]);
            setBatches([]);
            applySelection(year, null, null);
          } else {
            await loadSemestersAndBatches(fallbackYear, null, null);
          }
        } else {
          throw err;
        }
      }

      return list;
    },
    [applySelection, loadSemestersAndBatches]
  );

  const refreshYears = useCallback(async () => {
    const list = await fetchAcademicYears();
    return reconcileFromYears(list);
  }, [reconcileFromYears]);

  const refreshSemesters = useCallback(
    async (yearUuid) => {
      if (!yearUuid) {
        setSemesters([]);
        return [];
      }

      try {
        const list = await fetchSemesters(yearUuid);
        setSemesters(list);

        const { semester: prevSem, batch: prevBatch } = selectionRef.current;
        const semester = matchSemester(list, prevSem);
        if (!semester) {
          setBatches([]);
          applySelection(selectionRef.current.year, null, null);
          return list;
        }

        if (semester.uuid !== prevSem?.uuid) {
          const batchList = await fetchBatches(semester.uuid);
          setBatches(batchList);
          applySelection(selectionRef.current.year, semester, null);
          return list;
        }

        applySelection(selectionRef.current.year, semester, prevBatch);
        return list;
      } catch (err) {
        if (isNotFoundError(err)) {
          await refreshYears();
          return [];
        }
        throw err;
      }
    },
    [applySelection, refreshYears]
  );

  const refreshBatches = useCallback(async (semesterUuid) => {
    if (!semesterUuid) {
      setBatches([]);
      return [];
    }
    const list = await fetchBatches(semesterUuid);
    setBatches(list);
    return list;
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const list = await fetchAcademicYears();
        await reconcileFromYears(list, {
          year: stored.selectedYear ?? null,
          semester: stored.selectedSemester ?? null,
          batch: stored.selectedBatch ?? null,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [reconcileFromYears]);

  const selectYear = useCallback(
    async (year) => {
      if (!year?.uuid) {
        setSemesters([]);
        setBatches([]);
        applySelection(null, null, null);
        return;
      }

      const matched = matchYear(years, year) ?? year;
      applySelection(matched, null, null);
      try {
        const list = await fetchSemesters(matched.uuid);
        setSemesters(list);
      } catch (err) {
        if (isNotFoundError(err)) {
          await refreshYears();
        } else {
          throw err;
        }
      }
    },
    [applySelection, refreshYears, years]
  );

  const selectSemester = useCallback(
    async (semester) => {
      const year = selectionRef.current.year;
      applySelection(year, semester, null);
      if (semester?.uuid) await refreshBatches(semester.uuid);
      else setBatches([]);
    },
    [applySelection, refreshBatches]
  );

  const selectBatch = useCallback(
    (batch) => {
      const { year, semester } = selectionRef.current;
      applySelection(year, semester, batch);
    },
    [applySelection]
  );

  const isContextComplete = Boolean(
    selectedYear?.uuid && selectedSemester?.uuid && selectedBatch?.uuid
  );

  const isYearSemesterComplete = Boolean(
    selectedYear?.uuid && selectedSemester?.uuid
  );

  const isSelectedSemesterCompleted = isSemesterCompleted(selectedSemester);

  const value = useMemo(
    () => ({
      years,
      semesters,
      batches,
      loading,
      selectedYear,
      selectedSemester,
      selectedBatch,
      selectYear,
      selectSemester,
      selectBatch,
      refreshYears,
      refreshSemesters,
      refreshBatches,
      isContextComplete,
      isYearSemesterComplete,
      isSelectedSemesterCompleted,
      batchId: selectedBatch?.uuid ?? null,
    }),
    [
      years,
      semesters,
      batches,
      loading,
      selectedYear,
      selectedSemester,
      selectedBatch,
      selectYear,
      selectSemester,
      selectBatch,
      refreshYears,
      refreshSemesters,
      refreshBatches,
      isContextComplete,
      isYearSemesterComplete,
      isSelectedSemesterCompleted,
    ]
  );

  return (
    <AcademicContext.Provider value={value}>{children}</AcademicContext.Provider>
  );
}
