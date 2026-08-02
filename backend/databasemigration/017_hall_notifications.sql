-- Hall module automated Teams notification tracking

CREATE TABLE IF NOT EXISTS notification_settings (
  id SERIAL PRIMARY KEY,
  offset_preset VARCHAR(50) NOT NULL DEFAULT '12_hours',
  offset_minutes INT NOT NULL DEFAULT 720,
  custom_offset_minutes INT,
  notifications_paused BOOLEAN NOT NULL DEFAULT FALSE,
  portal_url VARCHAR(500) DEFAULT '',
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO notification_settings (offset_preset, offset_minutes)
SELECT '12_hours', 720
WHERE NOT EXISTS (SELECT 1 FROM notification_settings LIMIT 1);

CREATE TABLE IF NOT EXISTS hall_notifications (
  id SERIAL PRIMARY KEY,
  public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  seating_plan_id INT NOT NULL REFERENCES seating_plans(id) ON DELETE CASCADE,
  exam_date DATE NOT NULL,
  exam_session VARCHAR(10),
  exam_start_time TIME,
  exam_end_time TIME,
  exam_type VARCHAR(50),
  scheduled_time TIMESTAMPTZ NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255),
  regn_no VARCHAR(50),
  hall_name VARCHAR(200),
  course_code VARCHAR(100),
  course_name VARCHAR(255),
  department VARCHAR(100),
  notification_type VARCHAR(50) NOT NULL DEFAULT 'hall_seating',
  idempotency_key VARCHAR(500) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN (
      'SCHEDULED', 'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED',
      'FAILED', 'RETRYING', 'CANCELLED'
    )),
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  last_error TEXT,
  bull_job_id VARCHAR(100),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_hall_notifications_status_scheduled
  ON hall_notifications (status, scheduled_time);

CREATE INDEX IF NOT EXISTS idx_hall_notifications_seating_plan
  ON hall_notifications (seating_plan_id);

CREATE INDEX IF NOT EXISTS idx_hall_notifications_exam_date
  ON hall_notifications (exam_date, exam_session);

CREATE TABLE IF NOT EXISTS hall_notification_events (
  id SERIAL PRIMARY KEY,
  notification_id INT NOT NULL REFERENCES hall_notifications(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hall_notification_events_notification
  ON hall_notification_events (notification_id, created_at DESC);
