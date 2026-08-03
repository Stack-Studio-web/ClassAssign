-- Seating plan report lifecycle: ACTIVE (Reports) → COMPLETED (/report/completed)

ALTER TABLE seating_plans
  ADD COLUMN IF NOT EXISTS report_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (report_status IN ('ACTIVE', 'COMPLETED'));

ALTER TABLE seating_plans
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_seating_plans_report_status
  ON seating_plans (report_status, exam_date DESC);
