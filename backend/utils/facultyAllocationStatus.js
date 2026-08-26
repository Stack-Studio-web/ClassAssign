/**
 * Shared SQL fragments for faculty exam allocation status.
 *
 * Fully completed = attendance completed AND report completed.
 * Active allocated = assignment that is NOT fully completed.
 *
 * Attendance completed:
 *   locked attendance rows OR attendance_sessions.lifecycle_status = 'COMPLETED'
 * Report completed:
 *   seating_plans.report_status = 'COMPLETED'
 */

/** Attendance done for seating_plan_venues alias `spv` + seating_plans alias `sp`. */
const ATTENDANCE_DONE_SQL = `
  EXISTS (
    SELECT 1
    FROM faculty_assignments fa
    WHERE fa.faculty_id = spv.faculty_id
      AND fa.venue_id = spv.venue_id
      AND fa.assigned_date = sp.exam_date
      AND (
        EXISTS (
          SELECT 1 FROM attendance att
          WHERE att.exam_id = fa.exam_id
            AND att.venue_id = fa.venue_id
            AND att.is_locked = TRUE
        )
        OR EXISTS (
          SELECT 1 FROM attendance_sessions sess
          WHERE sess.exam_id = fa.exam_id
            AND sess.venue_id = fa.venue_id
            AND sess.lifecycle_status = 'COMPLETED'
        )
      )
  )
`;

/** Report done for seating_plans alias `sp`. */
const REPORT_DONE_SQL = `COALESCE(sp.report_status, 'ACTIVE') = 'COMPLETED'`;

/** Fully completed for spv + sp. */
const FULLY_COMPLETED_SQL = `(${ATTENDANCE_DONE_SQL}) AND (${REPORT_DONE_SQL})`;

/** Still counts against Allocated (not released). */
const ACTIVE_ALLOCATION_SQL = `NOT (${FULLY_COMPLETED_SQL})`;

module.exports = {
  ATTENDANCE_DONE_SQL,
  REPORT_DONE_SQL,
  FULLY_COMPLETED_SQL,
  ACTIVE_ALLOCATION_SQL,
};
