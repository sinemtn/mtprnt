ALTER TABLE master_account
  ADD COLUMN IF NOT EXISTS minimal_pembelian NUMERIC(15, 0) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_account_minimal_pembelian') THEN
    ALTER TABLE master_account
      ADD CONSTRAINT ck_account_minimal_pembelian CHECK (minimal_pembelian >= 0);
  END IF;
END $$;
