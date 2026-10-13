ALTER TABLE master_suku_cadang
  DROP COLUMN IF EXISTS kategori,
  DROP COLUMN IF EXISTS merek,
  DROP COLUMN IF EXISTS model_printer_kompatibel,
  DROP COLUMN IF EXISTS satuan;
