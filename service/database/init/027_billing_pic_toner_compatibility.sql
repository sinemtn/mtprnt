BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'master_account' AND column_name = 'minimal_pembelian')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'master_account' AND column_name = 'minimum_toner_tahunan') THEN
    ALTER TABLE master_account RENAME COLUMN minimal_pembelian TO minimum_toner_tahunan;
    UPDATE master_account SET minimum_toner_tahunan = 0;
  END IF;
END $$;

ALTER TABLE master_account
  ADD COLUMN IF NOT EXISTS nama_pic_billing VARCHAR(150),
  ADD COLUMN IF NOT EXISTS telepon_pic_billing VARCHAR(50),
  ADD COLUMN IF NOT EXISTS email_pic_billing VARCHAR(150),
  ADD COLUMN IF NOT EXISTS kena_ppn BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE master_account DROP CONSTRAINT IF EXISTS ck_account_minimal_pembelian;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_account_minimum_toner_tahunan') THEN
    ALTER TABLE master_account ADD CONSTRAINT ck_account_minimum_toner_tahunan CHECK (minimum_toner_tahunan >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS master_customer_pic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES master_customer(slug) ON DELETE CASCADE,
  nama_pic VARCHAR(150) NOT NULL,
  telepon_pic VARCHAR(50),
  email_pic VARCHAR(150),
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_master_customer_pic_customer ON master_customer_pic(customer_id, tanggal_dibuat);

INSERT INTO master_customer_pic (customer_id, nama_pic, telepon_pic, email_pic, tanggal_dibuat)
SELECT c.slug, COALESCE(NULLIF(BTRIM(c.nama_pic), ''), 'PIC Lama'),
       NULLIF(BTRIM(c.telepon_pic), ''), NULLIF(BTRIM(c.email_pic), ''), c.tanggal_dibuat
FROM master_customer c
WHERE (NULLIF(BTRIM(c.nama_pic), '') IS NOT NULL OR NULLIF(BTRIM(c.telepon_pic), '') IS NOT NULL OR NULLIF(BTRIM(c.email_pic), '') IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM master_customer_pic p WHERE p.customer_id = c.slug);

CREATE TABLE IF NOT EXISTS printer_model_toner_kompatibel (
  model_id UUID NOT NULL REFERENCES master_printer_model(slug) ON DELETE CASCADE,
  toner_id UUID NOT NULL REFERENCES master_toner(slug) ON DELETE CASCADE,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (model_id, toner_id)
);
CREATE INDEX IF NOT EXISTS idx_printer_model_toner_toner ON printer_model_toner_kompatibel(toner_id, model_id);

ALTER TABLE surat_tugas ADD COLUMN IF NOT EXISTS alur_st_baru BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
