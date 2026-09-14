CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE jenis_pelanggan AS ENUM ('single', 'multisite');
CREATE TYPE jenis_gudang AS ENUM ('utama', 'cabang', 'teknisi');
CREATE TYPE jenis_mutasi_stok AS ENUM ('masuk', 'keluar', 'transfer', 'penyesuaian', 'pemakaian');
CREATE TYPE status_mutasi_stok AS ENUM ('draft', 'terposting', 'dibatalkan');
CREATE TYPE jenis_barang AS ENUM ('toner', 'printer', 'suku_cadang');
CREATE TYPE prioritas_pengaduan AS ENUM ('rendah', 'normal', 'tinggi', 'darurat');
CREATE TYPE status_pengaduan AS ENUM ('new', 'pending', 'progress', 'solved', 'cancelled', 'baru', 'ditugaskan', 'diproses', 'selesai', 'ditutup', 'dibatalkan');
CREATE TYPE status_surat_tugas AS ENUM ('pending', 'progress', 'ready_to_print', 'technician_completed', 'warehouse_validated', 'solved', 'cancelled', 'draft', 'ditugaskan', 'diproses', 'diajukan', 'disetujui', 'ditutup', 'dibatalkan');
CREATE TYPE peran_pengguna AS ENUM ('admin', 'sales', 'sales_admin', 'kepala_teknisi', 'teknisi', 'warehouse');
CREATE TYPE peran_teknisi_surat_tugas AS ENUM ('utama', 'pendamping');
CREATE TYPE status_printer_terpasang AS ENUM ('aktif', 'nonaktif', 'dipindahkan', 'dikembalikan');

CREATE TABLE app_pengaturan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kunci VARCHAR(100) NOT NULL UNIQUE,
  nilai JSONB NOT NULL,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE role_permission (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(30) NOT NULL,
  modul VARCHAR(50) NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT FALSE,
  can_create BOOLEAN NOT NULL DEFAULT FALSE,
  can_update BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  can_resolve BOOLEAN NOT NULL DEFAULT FALSE,
  can_workflow BOOLEAN NOT NULL DEFAULT FALSE,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_role_permission UNIQUE (role, modul)
);

CREATE TABLE master_pengguna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(20) UNIQUE,
  nama VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE,
  telepon VARCHAR(50),
  peran peran_pengguna NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE master_pelanggan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_pelanggan VARCHAR(50) NOT NULL UNIQUE,
  nama_pelanggan VARCHAR(200) NOT NULL,
  jenis_pelanggan jenis_pelanggan NOT NULL DEFAULT 'single',
  npwp VARCHAR(50),
  telepon VARCHAR(50),
  email VARCHAR(150),
  alamat TEXT,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE master_lokasi_pelanggan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pelanggan_id UUID NOT NULL REFERENCES master_pelanggan(id) ON DELETE RESTRICT,
  kode_lokasi VARCHAR(50) NOT NULL,
  nama_lokasi VARCHAR(200) NOT NULL,
  alamat TEXT NOT NULL,
  kota VARCHAR(100),
  nama_pic VARCHAR(150),
  telepon_pic VARCHAR(50),
  email_pic VARCHAR(150),
  lokasi_default BOOLEAN NOT NULL DEFAULT FALSE,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_lokasi_pelanggan UNIQUE (pelanggan_id, kode_lokasi)
);

CREATE TABLE master_kontrak (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lokasi_pelanggan_id UUID REFERENCES master_lokasi_pelanggan(id) ON DELETE RESTRICT,
  nomor_kontrak VARCHAR(100) NOT NULL UNIQUE,
  tanggal_mulai DATE NOT NULL,
  tanggal_selesai DATE NOT NULL,
  jenis_layanan VARCHAR(100) NOT NULL,
  sla_respon_jam INTEGER NOT NULL DEFAULT 0,
  sla_penyelesaian_jam INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'aktif',
  keterangan TEXT,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_periode_kontrak CHECK (tanggal_selesai >= tanggal_mulai)
);

CREATE TABLE master_toner (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_toner VARCHAR(50) NOT NULL UNIQUE,
  nama_toner VARCHAR(200) NOT NULL,
  warna VARCHAR(50),
  merek VARCHAR(100),
  model_printer_kompatibel TEXT,
  satuan VARCHAR(30) NOT NULL DEFAULT 'pcs',
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE master_printer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_printer VARCHAR(50) NOT NULL UNIQUE,
  merek VARCHAR(100) NOT NULL,
  model VARCHAR(150) NOT NULL,
  jenis_printer VARCHAR(100),
  keterangan TEXT,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE master_suku_cadang (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_suku_cadang VARCHAR(50) NOT NULL UNIQUE,
  nama_suku_cadang VARCHAR(200) NOT NULL,
  kategori VARCHAR(100),
  merek VARCHAR(100),
  model_printer_kompatibel TEXT,
  satuan VARCHAR(30) NOT NULL DEFAULT 'pcs',
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE master_printer_terpasang (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pelanggan_id UUID REFERENCES master_pelanggan(id) ON DELETE RESTRICT,
  lokasi_pelanggan_id UUID REFERENCES master_lokasi_pelanggan(id) ON DELETE RESTRICT,
  printer_id UUID NOT NULL REFERENCES master_printer(id) ON DELETE RESTRICT,
  nomor_seri VARCHAR(150) NOT NULL UNIQUE,
  lokasi_detail VARCHAR(200),
  tanggal_instalasi DATE,
  meter_hitam_putih INTEGER NOT NULL DEFAULT 0,
  meter_warna INTEGER NOT NULL DEFAULT 0,
  status status_printer_terpasang NOT NULL DEFAULT 'aktif',
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE master_gudang (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_gudang VARCHAR(50) NOT NULL UNIQUE,
  nama_gudang VARCHAR(150) NOT NULL,
  jenis_gudang jenis_gudang NOT NULL,
  teknisi_id UUID REFERENCES master_pengguna(id) ON DELETE RESTRICT,
  alamat TEXT,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_gudang_teknisi CHECK (
    (jenis_gudang = 'teknisi' AND teknisi_id IS NOT NULL)
    OR (jenis_gudang <> 'teknisi')
  )
);

CREATE TABLE stok_toner (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gudang_id UUID NOT NULL REFERENCES master_gudang(id) ON DELETE RESTRICT,
  toner_id UUID NOT NULL REFERENCES master_toner(id) ON DELETE RESTRICT,
  jumlah_tersedia NUMERIC(14, 2) NOT NULL DEFAULT 0,
  jumlah_dicadangkan NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_stok_toner UNIQUE (gudang_id, toner_id),
  CONSTRAINT ck_stok_toner_non_negatif CHECK (jumlah_tersedia >= 0 AND jumlah_dicadangkan >= 0)
);

CREATE TABLE stok_printer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gudang_id UUID NOT NULL REFERENCES master_gudang(id) ON DELETE RESTRICT,
  printer_id UUID NOT NULL REFERENCES master_printer(id) ON DELETE RESTRICT,
  jumlah_tersedia NUMERIC(14, 2) NOT NULL DEFAULT 0,
  jumlah_dicadangkan NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_stok_printer UNIQUE (gudang_id, printer_id),
  CONSTRAINT ck_stok_printer_non_negatif CHECK (jumlah_tersedia >= 0 AND jumlah_dicadangkan >= 0)
);

CREATE TABLE stok_suku_cadang (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gudang_id UUID NOT NULL REFERENCES master_gudang(id) ON DELETE RESTRICT,
  suku_cadang_id UUID NOT NULL REFERENCES master_suku_cadang(id) ON DELETE RESTRICT,
  jumlah_tersedia NUMERIC(14, 2) NOT NULL DEFAULT 0,
  jumlah_dicadangkan NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_stok_suku_cadang UNIQUE (gudang_id, suku_cadang_id),
  CONSTRAINT ck_stok_suku_cadang_non_negatif CHECK (jumlah_tersedia >= 0 AND jumlah_dicadangkan >= 0)
);

CREATE TABLE mutasi_stok (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_mutasi VARCHAR(100) NOT NULL UNIQUE,
  jenis_mutasi jenis_mutasi_stok NOT NULL,
  tanggal_mutasi TIMESTAMPTZ NOT NULL DEFAULT now(),
  gudang_asal_id UUID REFERENCES master_gudang(id) ON DELETE RESTRICT,
  gudang_tujuan_id UUID REFERENCES master_gudang(id) ON DELETE RESTRICT,
  jenis_referensi VARCHAR(50),
  referensi_id UUID,
  status status_mutasi_stok NOT NULL DEFAULT 'draft',
  keterangan TEXT,
  dibuat_oleh UUID REFERENCES master_pengguna(id) ON DELETE RESTRICT,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_terposting TIMESTAMPTZ
);

CREATE TABLE detail_mutasi_stok (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mutasi_stok_id UUID NOT NULL REFERENCES mutasi_stok(id) ON DELETE CASCADE,
  jenis_barang jenis_barang NOT NULL,
  toner_id UUID REFERENCES master_toner(id) ON DELETE RESTRICT,
  printer_id UUID REFERENCES master_printer(id) ON DELETE RESTRICT,
  suku_cadang_id UUID REFERENCES master_suku_cadang(id) ON DELETE RESTRICT,
  jumlah NUMERIC(14, 2) NOT NULL,
  satuan VARCHAR(30) NOT NULL DEFAULT 'pcs',
  keterangan TEXT,
  CONSTRAINT ck_detail_mutasi_jumlah_positif CHECK (jumlah > 0),
  CONSTRAINT ck_detail_mutasi_satu_barang CHECK (
    (jenis_barang = 'toner' AND toner_id IS NOT NULL AND printer_id IS NULL AND suku_cadang_id IS NULL)
    OR (jenis_barang = 'printer' AND printer_id IS NOT NULL AND toner_id IS NULL AND suku_cadang_id IS NULL)
    OR (jenis_barang = 'suku_cadang' AND suku_cadang_id IS NOT NULL AND toner_id IS NULL AND printer_id IS NULL)
  )
);

CREATE TABLE pengaduan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_pengaduan VARCHAR(100) NOT NULL UNIQUE,
  mp_no VARCHAR(150),
  pelanggan_id UUID NOT NULL REFERENCES master_pelanggan(id) ON DELETE RESTRICT,
  lokasi_pelanggan_id UUID REFERENCES master_lokasi_pelanggan(id) ON DELETE RESTRICT,
  sales_id UUID,
  printer_terpasang_id UUID REFERENCES master_printer_terpasang(id) ON DELETE RESTRICT,
  nama_pelapor VARCHAR(150) NOT NULL,
  telepon_pelapor VARCHAR(50),
  tanggal_pengaduan TIMESTAMPTZ NOT NULL DEFAULT now(),
  kategori VARCHAR(100),
  prioritas prioritas_pengaduan NOT NULL DEFAULT 'normal',
  deskripsi_masalah TEXT NOT NULL,
  batas_respon TIMESTAMPTZ,
  batas_penyelesaian TIMESTAMPTZ,
  status status_pengaduan NOT NULL DEFAULT 'new',
  ringkasan_penyelesaian TEXT,
  tanggal_diselesaikan TIMESTAMPTZ,
  slug VARCHAR(160) UNIQUE,
  dibuat_oleh UUID REFERENCES master_pengguna(id) ON DELETE RESTRICT,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE surat_tugas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_surat_tugas VARCHAR(100) NOT NULL UNIQUE,
  pengaduan_id UUID REFERENCES pengaduan(id) ON DELETE RESTRICT,
  mp_no VARCHAR(150),
  pelanggan_id UUID NOT NULL REFERENCES master_pelanggan(id) ON DELETE RESTRICT,
  lokasi_pelanggan_id UUID REFERENCES master_lokasi_pelanggan(id) ON DELETE RESTRICT,
  printer_terpasang_id UUID REFERENCES master_printer_terpasang(id) ON DELETE RESTRICT,
  tanggal_jadwal TIMESTAMPTZ,
  mulai_kunjungan TIMESTAMPTZ,
  selesai_kunjungan TIMESTAMPTZ,
  jenis_pekerjaan VARCHAR(100) NOT NULL DEFAULT 'perbaikan',
  catatan_masalah TEXT,
  tindakan TEXT,
  hasil TEXT,
  status status_surat_tugas NOT NULL DEFAULT 'pending',
  disetujui_oleh UUID REFERENCES master_pengguna(id) ON DELETE RESTRICT,
  disetujui_pada TIMESTAMPTZ,
  validasi_warehouse_oleh UUID REFERENCES master_pengguna(id) ON DELETE RESTRICT,
  validasi_warehouse_pada TIMESTAMPTZ,
  validasi_kepala_teknisi_oleh UUID REFERENCES master_pengguna(id) ON DELETE RESTRICT,
  validasi_kepala_teknisi_pada TIMESTAMPTZ,
  dibuat_oleh UUID REFERENCES master_pengguna(id) ON DELETE RESTRICT,
  tanggal_dibuat TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_diperbarui TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teknisi_surat_tugas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surat_tugas_id UUID NOT NULL REFERENCES surat_tugas(id) ON DELETE CASCADE,
  teknisi_id UUID NOT NULL REFERENCES master_pengguna(id) ON DELETE RESTRICT,
  peran peran_teknisi_surat_tugas NOT NULL DEFAULT 'utama',
  CONSTRAINT uq_teknisi_surat_tugas UNIQUE (surat_tugas_id, teknisi_id)
);

CREATE TABLE pemakaian_barang_surat_tugas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surat_tugas_id UUID NOT NULL REFERENCES surat_tugas(id) ON DELETE CASCADE,
  gudang_id UUID NOT NULL REFERENCES master_gudang(id) ON DELETE RESTRICT,
  jenis_barang jenis_barang NOT NULL,
  toner_id UUID REFERENCES master_toner(id) ON DELETE RESTRICT,
  printer_id UUID REFERENCES master_printer(id) ON DELETE RESTRICT,
  suku_cadang_id UUID REFERENCES master_suku_cadang(id) ON DELETE RESTRICT,
  jumlah_pakai NUMERIC(14, 2) NOT NULL,
  serial_number VARCHAR(150),
  keterangan TEXT,
  CONSTRAINT ck_pemakaian_jumlah_positif CHECK (jumlah_pakai > 0),
  CONSTRAINT ck_pemakaian_satu_barang CHECK (
    (jenis_barang = 'toner' AND toner_id IS NOT NULL AND printer_id IS NULL AND suku_cadang_id IS NULL)
    OR (jenis_barang = 'printer' AND printer_id IS NOT NULL AND toner_id IS NULL AND suku_cadang_id IS NULL)
    OR (jenis_barang = 'suku_cadang' AND suku_cadang_id IS NOT NULL AND toner_id IS NULL AND printer_id IS NULL)
  )
);

CREATE INDEX idx_lokasi_pelanggan_pelanggan ON master_lokasi_pelanggan(pelanggan_id);
CREATE INDEX idx_kontrak_lokasi ON master_kontrak(lokasi_pelanggan_id);
CREATE INDEX idx_printer_terpasang_lokasi ON master_printer_terpasang(lokasi_pelanggan_id);
CREATE INDEX idx_printer_terpasang_pelanggan ON master_printer_terpasang(pelanggan_id);
CREATE INDEX idx_gudang_teknisi ON master_gudang(teknisi_id);
CREATE INDEX idx_mutasi_stok_tanggal ON mutasi_stok(tanggal_mutasi);
CREATE INDEX idx_detail_mutasi_stok ON detail_mutasi_stok(mutasi_stok_id);
CREATE INDEX idx_pengaduan_lokasi_status ON pengaduan(lokasi_pelanggan_id, status);
CREATE INDEX idx_surat_tugas_pengaduan_status ON surat_tugas(pengaduan_id, status);
CREATE INDEX idx_teknisi_surat_tugas_teknisi ON teknisi_surat_tugas(teknisi_id);
CREATE INDEX idx_pemakaian_surat_tugas ON pemakaian_barang_surat_tugas(surat_tugas_id);
