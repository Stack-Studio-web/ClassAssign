-- Migration: Create audit_logs table
-- This table stores all system activity for administrative tracking

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255) DEFAULT NULL,
  changes JSON NOT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for better query performance
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_entity_type (entity_type),
  INDEX idx_entity_id (entity_id),
  INDEX idx_created_at (created_at),
  INDEX idx_user_action (user_id, action),
  INDEX idx_entity_composite (entity_type, entity_id),
  
  -- Foreign key to users table
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add comments for documentation
ALTER TABLE audit_logs 
  COMMENT = 'Stores audit trail of all administrative actions in the system';

-- Sample action types (for reference):
-- CREATE, UPDATE, DELETE, LOGIN, LOGOUT, IMPORT, EXPORT, VIEW

-- Sample entity types (for reference):
-- USER, SEATING_PLAN, VENUE, STUDENT, FACULTY, EXAM, NOTIFICATION