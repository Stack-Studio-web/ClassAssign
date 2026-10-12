/**
 * Auto-complete timetable rows whose exam date is strictly before
 * "today" in the institution timezone (INSTITUTION_TIMEZONE || Asia/Kolkata).
 *
 * Rule: future + today stay ACTIVE; only past calendar dates become COMPLETED.
 * Idempotent: only ACTIVE rows with a non-null date < today are updated.
 */
const Timetable = require("../models/Timetable");

function getInstitutionTimezone() {
  return process.env.INSTITUTION_TIMEZONE || "Asia/Kolkata";
}

/**
 * Calendar date (YYYY-MM-DD) for "now" in the institution timezone.
 * Uses Intl — not the server local TZ and not browser TZ.
 */
function getInstitutionTodayYmd(now = new Date(), timeZone = getInstitutionTimezone()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA yields YYYY-MM-DD
  return fmt.format(now);
}

/**
 * Mark all ACTIVE timetable rows with date < institutionToday as COMPLETED.
 * @returns {{ updated: number, institutionToday: string, timeZone: string }}
 */
async function completePastTimetableEntries(opts = {}) {
  const timeZone = opts.timeZone || getInstitutionTimezone();
  const institutionToday =
    opts.institutionToday || getInstitutionTodayYmd(opts.now || new Date(), timeZone);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(institutionToday)) {
    throw new Error(`Invalid institution today date: ${institutionToday}`);
  }

  const updated = await Timetable.markPastDatesCompleted(institutionToday);
  return { updated, institutionToday, timeZone };
}

module.exports = {
  getInstitutionTimezone,
  getInstitutionTodayYmd,
  completePastTimetableEntries,
};
