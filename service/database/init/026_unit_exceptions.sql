ALTER TABLE surat_tugas_printer
  ADD COLUMN IF NOT EXISTS alasan_pengecualian TEXT,
  ADD COLUMN IF NOT EXISTS pengecualian_diminta_oleh VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pengecualian_diminta_pada TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pengecualian_disetujui_oleh VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pengecualian_disetujui_pada TIMESTAMPTZ;
