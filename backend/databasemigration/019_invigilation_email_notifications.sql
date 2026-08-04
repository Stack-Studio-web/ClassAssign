-- Invigilation duty email notifications (SMTP)

CREATE TABLE IF NOT EXISTS invigilation_notification_batches (
  id SERIAL PRIMARY KEY,
  public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  seating_plan_ids JSONB NOT NULL DEFAULT '[]',
  initiated_by INT REFERENCES users(id) ON DELETE SET NULL,
  resend BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  total_faculty INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  skipped_no_email INT NOT NULL DEFAULT 0,
  skipped_duplicate INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invig_notif_batches_uuid
  ON invigilation_notification_batches (public_uuid);

CREATE TABLE IF NOT EXISTS invigilation_email_logs (
  id SERIAL PRIMARY KEY,
  batch_id INT REFERENCES invigilation_notification_batches(id) ON DELETE CASCADE,
  seating_plan_id INT REFERENCES seating_plans(id) ON DELETE SET NULL,
  exam_id INT REFERENCES exams(id) ON DELETE SET NULL,
  faculty_id INT REFERENCES faculty(id) ON DELETE SET NULL,
  venue_id INT REFERENCES venues(id) ON DELETE SET NULL,
  faculty_email VARCHAR(255),
  faculty_name VARCHAR(255),
  subject TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED_NO_EMAIL', 'SKIPPED_DUPLICATE')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invig_email_logs_batch
  ON invigilation_email_logs (batch_id);

CREATE INDEX IF NOT EXISTS idx_invig_email_logs_faculty_exam
  ON invigilation_email_logs (faculty_id, exam_id, seating_plan_id);

CREATE INDEX IF NOT EXISTS idx_invig_email_logs_sent_lookup
  ON invigilation_email_logs (faculty_id, seating_plan_id, venue_id, status);
