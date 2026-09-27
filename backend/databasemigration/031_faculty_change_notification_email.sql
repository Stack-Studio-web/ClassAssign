-- Faculty Incharge configurable email for mutual faculty-change notifications
CREATE TABLE IF NOT EXISTS faculty_change_notification_settings (
  id SERIAL PRIMARY KEY,
  faculty_incharge_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT faculty_change_notification_settings_fi_unique UNIQUE (faculty_incharge_user_id)
);

CREATE INDEX IF NOT EXISTS idx_faculty_change_notify_fi
  ON faculty_change_notification_settings (faculty_incharge_user_id);
