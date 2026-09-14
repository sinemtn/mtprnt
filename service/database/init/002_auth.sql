ALTER TABLE master_pengguna
  ADD COLUMN IF NOT EXISTS user_id VARCHAR(20),
  ADD COLUMN IF NOT EXISTS kata_sandi_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_pengguna_user_id
  ON master_pengguna(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_master_pengguna_email
  ON master_pengguna(email);
