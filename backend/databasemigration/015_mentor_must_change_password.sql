-- Require password change after default mentor password is used

ALTER TABLE mentors ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
