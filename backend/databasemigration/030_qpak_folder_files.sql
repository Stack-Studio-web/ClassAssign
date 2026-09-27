-- QPAK folder files (store uploaded folder contents as-is)
CREATE TABLE IF NOT EXISTS qpak_files (
  id SERIAL PRIMARY KEY,
  public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  document_id INT NOT NULL REFERENCES qpak_documents(id) ON DELETE CASCADE,
  relative_path VARCHAR(500) NOT NULL,
  stored_path VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_size INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qpak_files_public_uuid ON qpak_files (public_uuid);
CREATE INDEX IF NOT EXISTS idx_qpak_files_document_id ON qpak_files (document_id);

ALTER TABLE qpak_documents
  ADD COLUMN IF NOT EXISTS folder_name VARCHAR(255);
