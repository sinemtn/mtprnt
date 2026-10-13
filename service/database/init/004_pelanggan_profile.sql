ALTER TABLE master_pelanggan
  ADD COLUMN IF NOT EXISTS kota VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nama_pic VARCHAR(150),
  ADD COLUMN IF NOT EXISTS telepon_pic VARCHAR(50),
  ADD COLUMN IF NOT EXISTS email_pic VARCHAR(150);

UPDATE master_pelanggan AS p
SET alamat = COALESCE(NULLIF(p.alamat, ''), l.alamat),
    kota = COALESCE(p.kota, l.kota),
    nama_pic = COALESCE(p.nama_pic, l.nama_pic),
    telepon_pic = COALESCE(p.telepon_pic, l.telepon_pic),
    email_pic = COALESCE(p.email_pic, l.email_pic)
FROM master_lokasi_pelanggan AS l
WHERE p.jenis_pelanggan = 'single'
  AND l.id = (
    SELECT id
    FROM master_lokasi_pelanggan
    WHERE pelanggan_id = p.id
    ORDER BY lokasi_default DESC, tanggal_dibuat ASC
    LIMIT 1
  );
