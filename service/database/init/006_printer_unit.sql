BEGIN;

DO $$
BEGIN
  IF to_regclass('public.master_printer_kategori') IS NOT NULL THEN
    RAISE EXCEPTION 'Migrasi printer per unit sudah dijalankan.';
  END IF;
  IF EXISTS (SELECT 1 FROM master_printer LIMIT 1)
    OR EXISTS (SELECT 1 FROM stok_printer LIMIT 1)
    OR EXISTS (SELECT 1 FROM master_printer_terpasang LIMIT 1)
    OR EXISTS (SELECT 1 FROM detail_mutasi_stok WHERE printer_id IS NOT NULL LIMIT 1)
    OR EXISTS (SELECT 1 FROM pemakaian_barang_surat_tugas WHERE printer_id IS NOT NULL LIMIT 1) THEN
    RAISE EXCEPTION 'Data printer lama ada; petakan setiap unit dan MP No sebelum migrasi.';
  END IF;
END $$;

CREATE TABLE master_printer_kategori (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_kategori VARCHAR(50) NOT NULL UNIQUE,
  nama_kategori VARCHAR(150) NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE master_printer_model (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kategori_id UUID NOT NULL REFERENCES master_printer_kategori(id) ON DELETE RESTRICT,
  kode_model VARCHAR(50) NOT NULL UNIQUE,
  merek VARCHAR(100) NOT NULL,
  nama_model VARCHAR(150) NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pengaduan DROP COLUMN printer_terpasang_id;
ALTER TABLE surat_tugas DROP COLUMN printer_terpasang_id;
DROP TABLE master_printer_terpasang;
DROP TABLE stok_printer;

ALTER TABLE master_printer
  DROP COLUMN kode_printer,
  DROP COLUMN merek,
  DROP COLUMN model,
  DROP COLUMN jenis_printer,
  DROP COLUMN aktif,
  ADD COLUMN mp_no VARCHAR(150) NOT NULL UNIQUE,
  ADD COLUMN serial_number VARCHAR(150) UNIQUE,
  ADD COLUMN model_id UUID NOT NULL REFERENCES master_printer_model(id) ON DELETE RESTRICT,
  ADD COLUMN gudang_id UUID REFERENCES master_gudang(id) ON DELETE RESTRICT,
  ADD COLUMN account_id UUID REFERENCES master_account(id) ON DELETE RESTRICT,
  ADD COLUMN customer_id UUID REFERENCES master_customer(id) ON DELETE RESTRICT,
  ADD COLUMN surat_tugas_aktif_id UUID REFERENCES surat_tugas(id) ON DELETE RESTRICT,
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'available',
  ADD COLUMN lokasi_detail VARCHAR(200),
  ADD COLUMN tanggal_instalasi DATE,
  ADD COLUMN meter_hitam_putih INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN meter_warna INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT ck_printer_status CHECK (status IN ('available','reserved','issued','installed','inactive')),
  ADD CONSTRAINT ck_printer_location CHECK (
    (status = 'available' AND gudang_id IS NOT NULL AND surat_tugas_aktif_id IS NULL AND customer_id IS NULL AND account_id IS NULL)
    OR (status IN ('reserved','issued') AND gudang_id IS NOT NULL AND surat_tugas_aktif_id IS NOT NULL AND customer_id IS NULL AND account_id IS NULL)
    OR (status = 'installed' AND gudang_id IS NULL AND surat_tugas_aktif_id IS NULL AND customer_id IS NOT NULL AND account_id IS NOT NULL)
    OR status = 'inactive'
  );

ALTER TABLE pengaduan ADD COLUMN printer_id UUID REFERENCES master_printer(id) ON DELETE RESTRICT;
ALTER TABLE surat_tugas ADD COLUMN printer_id UUID REFERENCES master_printer(id) ON DELETE RESTRICT;

CREATE INDEX idx_printer_model ON master_printer(model_id);
CREATE INDEX idx_printer_location ON master_printer(status, gudang_id);
CREATE INDEX idx_printer_customer ON master_printer(customer_id, status);
CREATE INDEX idx_printer_model_kategori ON master_printer_model(kategori_id);

COMMIT;
