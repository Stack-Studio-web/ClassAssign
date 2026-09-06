-- Independent faculty transfer counter (does not affect allocation capacity).
ALTER TABLE faculty ADD COLUMN IF NOT EXISTS transfer_count INT DEFAULT 0;
UPDATE faculty SET transfer_count = 0 WHERE transfer_count IS NULL;
