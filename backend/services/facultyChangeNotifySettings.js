const db = require("../config/db");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function assertValidEmail(email) {
  if (!email || !EMAIL_RE.test(email)) {
    const err = new Error("Enter a valid email address");
    err.statusCode = 400;
    throw err;
  }
  return email;
}

const FacultyChangeNotifySettings = {
  getForUser: async (userId) => {
    const [rows] = await db.query(
      `SELECT notification_email, updated_at
       FROM faculty_change_notification_settings
       WHERE faculty_incharge_user_id = ?
       LIMIT 1`,
      [userId]
    );
    const row = rows?.[0];
    if (!row) {
      return { email: null, updatedAt: null };
    }
    return {
      email: row.notification_email ?? row.notificationemail ?? null,
      updatedAt: row.updated_at ?? row.updatedat ?? null,
    };
  },

  upsertForUser: async (userId, email) => {
    const normalized = assertValidEmail(normalizeEmail(email));
    await db.query(
      `INSERT INTO faculty_change_notification_settings
         (faculty_incharge_user_id, notification_email, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (faculty_incharge_user_id)
       DO UPDATE SET
         notification_email = EXCLUDED.notification_email,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, normalized]
    );
    return FacultyChangeNotifySettings.getForUser(userId);
  },

  getEmailForOwner: async (ownerUserId) => {
    if (!ownerUserId) return null;
    const settings = await FacultyChangeNotifySettings.getForUser(ownerUserId);
    return settings.email || null;
  },
};

module.exports = FacultyChangeNotifySettings;
