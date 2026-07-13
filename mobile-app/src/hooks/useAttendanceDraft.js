import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearAttendanceDraft,
  loadAttendanceDraft,
  saveAttendanceDraft,
} from "../services/draftService";
import { ATTENDANCE_DRAFT_AUTOSAVE_MS } from "../constants";

export function useAttendanceDraft(assignmentUuid, courses, enabled = true) {
  const [draftLoaded, setDraftLoaded] = useState(false);
  const coursesRef = useRef(courses);
  coursesRef.current = courses;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!assignmentUuid) return;
      const draft = await loadAttendanceDraft(assignmentUuid);
      if (!cancelled && draft?.courses) {
        setDraftLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentUuid]);

  const persistDraft = useCallback(async () => {
    if (!enabled || !assignmentUuid) return;
    await saveAttendanceDraft(assignmentUuid, {
      courses: coursesRef.current,
    });
  }, [assignmentUuid, enabled]);

  useEffect(() => {
    if (!enabled || !assignmentUuid || !courses.length) return undefined;
    const timer = setTimeout(persistDraft, ATTENDANCE_DRAFT_AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [courses, assignmentUuid, enabled, persistDraft]);

  const clearDraft = useCallback(async () => {
    await clearAttendanceDraft(assignmentUuid);
  }, [assignmentUuid]);

  return { draftLoaded, persistDraft, clearDraft, loadAttendanceDraft };
}

export { loadAttendanceDraft };
