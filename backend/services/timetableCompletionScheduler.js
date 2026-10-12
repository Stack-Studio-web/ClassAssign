const {
  completePastTimetableEntries,
} = require("./timetableCompletionService");

/** Run often enough to catch the post-midnight transition without heavy load. */
const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000;

function startTimetableCompletionScheduler() {
  console.log(
    "⏰ Timetable completion scheduler started (every 5m, institution TZ)"
  );

  const tick = async () => {
    try {
      const result = await completePastTimetableEntries();
      if (result.updated > 0) {
        console.log(
          `📅 Auto-completed ${result.updated} timetable row(s) (date < ${result.institutionToday} ${result.timeZone})`
        );
      }
    } catch (err) {
      console.error("Timetable completion scheduler error:", err.message);
    }
  };

  tick();
  return setInterval(tick, SCHEDULER_INTERVAL_MS);
}

module.exports = { startTimetableCompletionScheduler };
