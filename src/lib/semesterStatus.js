export function isSemesterCompleted(semester) {
  return Boolean(semester?.isArchived);
}

export const COMPLETED_SEMESTER_MESSAGE =
  "This semester has been completed. No further modifications are allowed.";

export const DELETE_COMPLETED_SEMESTER_MESSAGE =
  "Deleting this completed semester will permanently remove all students, batches, and related records. This action cannot be undone.";
