/**
 * Lightweight validation of institution-timezone "today" and completion rule.
 * Run: node scripts/validateTimetableCompletion.js
 */
const assert = require("assert");
const {
  getInstitutionTodayYmd,
  getInstitutionTimezone,
} = require("../services/timetableCompletionService");

function assertYmd(value, label) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `${label} must be YYYY-MM-DD, got ${value}`);
}

function main() {
  const tz = getInstitutionTimezone();
  assert.strictEqual(tz, process.env.INSTITUTION_TIMEZONE || "Asia/Kolkata");

  // Fixed UTC instant: 2026-09-29 18:30 UTC = 2026-09-30 00:00 Asia/Kolkata
  const atKolkataMidnight = new Date("2026-09-29T18:30:00.000Z");
  const todayAtMidnight = getInstitutionTodayYmd(atKolkataMidnight, "Asia/Kolkata");
  assert.strictEqual(todayAtMidnight, "2026-09-30");

  // Same calendar day still "today" late evening Kolkata
  const lateEvening = new Date("2026-09-30T16:00:00.000Z"); // 21:30 IST
  assert.strictEqual(getInstitutionTodayYmd(lateEvening, "Asia/Kolkata"), "2026-09-30");

  // Completion eligibility: date < today (not <=)
  const institutionToday = "2026-09-30";
  const cases = [
    { date: "2026-09-28", eligible: true },
    { date: "2026-09-29", eligible: true },
    { date: "2026-09-30", eligible: false }, // current date stays active
    { date: "2026-10-01", eligible: false },
  ];
  for (const c of cases) {
    const eligible = c.date < institutionToday;
    assert.strictEqual(
      eligible,
      c.eligible,
      `date ${c.date} vs today ${institutionToday}`
    );
  }

  assertYmd(getInstitutionTodayYmd(new Date(), tz), "live today");

  console.log("✅ timetable completion date rules OK");
  console.log(`   timezone=${tz} liveToday=${getInstitutionTodayYmd(new Date(), tz)}`);
}

main();
