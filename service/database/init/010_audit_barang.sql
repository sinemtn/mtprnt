BEGIN;

ALTER TABLE riwayat_audit ALTER COLUMN nomor_dokumen TYPE VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_riwayat_audit_barang_item
  ON riwayat_audit(jenis_dokumen, id_sumber, tanggal_audit DESC);
CREATE INDEX IF NOT EXISTS idx_riwayat_audit_barang_tanggal
  ON riwayat_audit(jenis_dokumen, tanggal_audit DESC);

INSERT INTO riwayat_audit (jenis_dokumen, nomor_dokumen, tabel_sumber, id_sumber, aksi, data_sesudah, keterangan, nama_pengguna)
SELECT 'barang_printer', p.mp_no, 'master_printer', p.id, 'snapshot_awal',
  to_jsonb(p) || jsonb_build_object(
    'lokasi_nama', COALESCE(c.nama_customer, g.nama_gudang, CASE WHEN p.status = 'issued' THEN 'Dalam surat tugas' END),
    'account_nama', a.nama_account
  ),
  'Snapshot awal saat Audit Barang diaktifkan; bukan riwayat perubahan sebelumnya.', 'Sistem'
FROM master_printer p
LEFT JOIN master_gudang g ON g.id = p.gudang_id
LEFT JOIN master_account a ON a.id = p.account_id
LEFT JOIN master_customer c ON c.id = p.customer_id
WHERE NOT EXISTS (
  SELECT 1 FROM riwayat_audit r WHERE r.jenis_dokumen = 'barang_printer' AND r.id_sumber = p.id AND r.aksi = 'snapshot_awal'
);

INSERT INTO riwayat_audit (jenis_dokumen, nomor_dokumen, tabel_sumber, id_sumber, aksi, data_sesudah, keterangan, nama_pengguna)
SELECT 'barang_toner', t.kode_toner, 'master_toner', t.id, 'snapshot_awal',
  to_jsonb(t) || jsonb_build_object('stok', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('gudang_id', s.gudang_id, 'nama_gudang', g.nama_gudang, 'jumlah_tersedia', s.jumlah_tersedia))
    FROM stok_toner s JOIN master_gudang g ON g.id = s.gudang_id WHERE s.toner_id = t.id
  ), '[]'::jsonb)),
  'Snapshot awal saat Audit Barang diaktifkan; bukan riwayat perubahan sebelumnya.', 'Sistem'
FROM master_toner t
WHERE NOT EXISTS (
  SELECT 1 FROM riwayat_audit r WHERE r.jenis_dokumen = 'barang_toner' AND r.id_sumber = t.id AND r.aksi = 'snapshot_awal'
);

INSERT INTO riwayat_audit (jenis_dokumen, nomor_dokumen, tabel_sumber, id_sumber, aksi, data_sesudah, keterangan, nama_pengguna)
SELECT 'barang_suku_cadang', s.kode_suku_cadang, 'master_suku_cadang', s.id, 'snapshot_awal',
  to_jsonb(s) || jsonb_build_object('stok', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('gudang_id', st.gudang_id, 'nama_gudang', g.nama_gudang, 'jumlah_tersedia', st.jumlah_tersedia))
    FROM stok_suku_cadang st JOIN master_gudang g ON g.id = st.gudang_id WHERE st.suku_cadang_id = s.id
  ), '[]'::jsonb)),
  'Snapshot awal saat Audit Barang diaktifkan; bukan riwayat perubahan sebelumnya.', 'Sistem'
FROM master_suku_cadang s
WHERE NOT EXISTS (
  SELECT 1 FROM riwayat_audit r WHERE r.jenis_dokumen = 'barang_suku_cadang' AND r.id_sumber = s.id AND r.aksi = 'snapshot_awal'
);

COMMIT;
