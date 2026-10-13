BEGIN;

DO $$
BEGIN
  IF to_regclass('public.master_account') IS NOT NULL THEN
    RAISE EXCEPTION 'Migrasi Account/Customer sudah dijalankan.';
  END IF;
END $$;

TRUNCATE TABLE
  riwayat_audit,
  pemakaian_barang_surat_tugas,
  teknisi_surat_tugas,
  detail_mutasi_stok,
  mutasi_stok,
  stok_printer,
  stok_toner,
  stok_suku_cadang,
  surat_tugas,
  pengaduan,
  master_printer_terpasang,
  master_kontrak,
  master_lokasi_pelanggan,
  master_pelanggan,
  master_printer,
  master_toner,
  master_suku_cadang,
  master_gudang
RESTART IDENTITY CASCADE;

CREATE TABLE master_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_account VARCHAR(50) NOT NULL UNIQUE,
  nama_account VARCHAR(200) NOT NULL,
  npwp VARCHAR(50),
  telepon VARCHAR(50),
  email VARCHAR(150),
  alamat_penagihan TEXT,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE master_customer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES master_account(id) ON DELETE RESTRICT,
  kode_customer VARCHAR(50) NOT NULL,
  nama_customer VARCHAR(200) NOT NULL,
  alamat TEXT NOT NULL,
  nama_pic VARCHAR(150),
  telepon_pic VARCHAR(50),
  email_pic VARCHAR(150),
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_customer_account_kode UNIQUE (account_id, kode_customer)
);

ALTER TABLE master_kontrak
  DROP COLUMN lokasi_pelanggan_id,
  ADD COLUMN customer_id UUID NOT NULL REFERENCES master_customer(id) ON DELETE RESTRICT;

ALTER TABLE master_printer_terpasang
  DROP COLUMN pelanggan_id,
  DROP COLUMN lokasi_pelanggan_id,
  ADD COLUMN account_id UUID NOT NULL REFERENCES master_account(id) ON DELETE RESTRICT,
  ADD COLUMN customer_id UUID NOT NULL REFERENCES master_customer(id) ON DELETE RESTRICT;

ALTER TABLE pengaduan
  DROP COLUMN pelanggan_id,
  DROP COLUMN lokasi_pelanggan_id,
  ADD COLUMN account_id UUID NOT NULL REFERENCES master_account(id) ON DELETE RESTRICT,
  ADD COLUMN customer_id UUID NOT NULL REFERENCES master_customer(id) ON DELETE RESTRICT;

ALTER TABLE surat_tugas
  DROP COLUMN pelanggan_id,
  DROP COLUMN lokasi_pelanggan_id,
  ADD COLUMN account_id UUID NOT NULL REFERENCES master_account(id) ON DELETE RESTRICT,
  ADD COLUMN customer_id UUID NOT NULL REFERENCES master_customer(id) ON DELETE RESTRICT;

DROP TABLE master_lokasi_pelanggan;
DROP TABLE master_pelanggan;
DROP TYPE jenis_pelanggan;

CREATE INDEX idx_customer_account ON master_customer(account_id);
CREATE INDEX idx_kontrak_customer ON master_kontrak(customer_id);
CREATE INDEX idx_printer_terpasang_customer ON master_printer_terpasang(customer_id);
CREATE INDEX idx_pengaduan_customer_status ON pengaduan(customer_id, status);
CREATE INDEX idx_surat_tugas_customer_status ON surat_tugas(customer_id, status);

COMMIT;
