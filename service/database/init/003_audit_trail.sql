CREATE TABLE IF NOT EXISTS riwayat_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis_dokumen VARCHAR(50) NOT NULL,
  nomor_dokumen VARCHAR(100) NOT NULL,
  tabel_sumber VARCHAR(100) NOT NULL,
  id_sumber UUID NOT NULL,
  aksi VARCHAR(50) NOT NULL,
  status_sebelum VARCHAR(50),
  status_sesudah VARCHAR(50),
  data_sebelum JSONB,
  data_sesudah JSONB,
  keterangan TEXT,
  pengguna_id UUID REFERENCES master_pengguna(id) ON DELETE SET NULL,
  nama_pengguna VARCHAR(150),
  ip_address VARCHAR(100),
  user_agent TEXT,
  tanggal_audit TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_riwayat_audit_dokumen
  ON riwayat_audit(jenis_dokumen, nomor_dokumen);

CREATE INDEX IF NOT EXISTS idx_riwayat_audit_sumber
  ON riwayat_audit(tabel_sumber, id_sumber);

CREATE INDEX IF NOT EXISTS idx_riwayat_audit_tanggal
  ON riwayat_audit(tanggal_audit);
