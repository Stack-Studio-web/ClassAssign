const HallNotificationService = require("../services/hallNotificationService");

const SCHEDULER_INTERVAL_MS = 60 * 1000;

function startHallNotificationScheduler() {
  console.log("⏰ Hall notification scheduler started (every 60s, server time)");

  const tick = async () => {
    try {
      const result = await HallNotificationService.processDueNotifications();
      if (result.queued > 0) {
        console.log(`📬 Scheduler queued ${result.queued} due hall notification(s)`);
      }
    } catch (err) {
      console.error("Hall notification scheduler error:", err.message);
    }
  };

  tick();
  return setInterval(tick, SCHEDULER_INTERVAL_MS);
}

module.exports = { startHallNotificationScheduler };
