ALTER TABLE surat_tugas
  ADD COLUMN IF NOT EXISTS alasan_penolakan_warehouse TEXT,
  ADD COLUMN IF NOT EXISTS penolakan_warehouse_oleh VARCHAR(20),
  ADD COLUMN IF NOT EXISTS penolakan_warehouse_pada TIMESTAMPTZ;
