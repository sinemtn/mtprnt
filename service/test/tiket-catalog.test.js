const test = require("node:test");
const assert = require("node:assert/strict");
const { JENIS_TIKET, JENIS_ST, kategoriUntukJenisSt, jenisStDiizinkan, tugasWajib, unitSelesai, reviewTiket } = require("../src/modules/tiket.catalog");

test("setiap jenis ST hanya berasal dari satu subjenis tiket", () => {
  assert.equal(new Set(JENIS_ST).size, JENIS_ST.length);
  for (const [kategori, jenis] of Object.entries(JENIS_TIKET)) {
    for (const [subjenis, tugas] of Object.entries(jenis)) {
      for (const st of tugas) {
        assert.deepEqual(kategoriUntukJenisSt(st), { kategori, jenis: subjenis });
        if (st !== "terima_tukar") assert.equal(jenisStDiizinkan(kategori, subjenis, st), true);
      }
    }
  }
});

test("TUKAR membutuhkan pengiriman dan penerimaan terpisah", () => {
  assert.deepEqual(tugasWajib("delivery", "kontrak", "baru"), ["kirim_kontrak"]);
  assert.deepEqual(tugasWajib("delivery", "kontrak", "tukar"), ["kirim_kontrak", "terima_tukar"]);
  assert.equal(jenisStDiizinkan("delivery", "kontrak", "terima_tukar", "baru"), false);
  assert.equal(jenisStDiizinkan("delivery", "kontrak", "terima_tukar", "tukar"), true);
});

test("BACK-UP mewajibkan pengiriman pengganti dan penerimaan unit rusak", () => {
  assert.deepEqual(tugasWajib("komplain", "back_up", "permanen"), ["kirim_back_up", "terima_unit_rusak"]);
  assert.equal(jenisStDiizinkan("komplain", "back_up", "qc", "permanen"), false);
});

test("unit tertunda memerlukan persetujuan dan tidak menjadi konfirmasi fisik", () => {
  const surat = { jenis_tugas: "kirim_kontrak" };
  const line = { mp_no: "MP-1", hasil: "tertunda", alasan_pengecualian: "Menunggu unit" };
  assert.equal(unitSelesai(surat, line), false);
  line.pengecualian_disetujui_pada = new Date();
  assert.equal(unitSelesai(surat, line), true);
  assert.equal(line.konfirmasi_keluar_pada, undefined);
  assert.equal(line.konfirmasi_serah_pada, undefined);
});

test("review Tiket memeriksa seluruh ST dan unit, termasuk penerimaan unit lama", () => {
  const unit = { mp_no: "MP-1", hasil: "Selesai", konfirmasi_keluar_pada: new Date(), konfirmasi_serah_pada: new Date() };
  const surat = { jenis_tugas: "kirim_back_up", status: "solved", surat_tugas_printer: [unit] };
  const inbound = { jenis_tugas: "terima_unit_rusak", status: "solved", surat_tugas_printer: [{ mp_no: "MP-LAMA", pengecualian_disetujui_pada: new Date() }] };
  const tiket = { kategori: "komplain", jenis: "back_up", mode: "permanen", mp_no: "MP-LAMA", surat_tugas: [surat, inbound] };
  assert.match(reviewTiket(tiket), /benar-benar diterima/);
  inbound.surat_tugas_printer[0].konfirmasi_terima_pada = new Date();
  assert.equal(reviewTiket(tiket), null);
  surat.status = "progress";
  assert.match(reviewTiket(tiket), /wajib|berjalan/);
  surat.status = "solved";
  unit.hasil = "tertunda";
  assert.match(reviewTiket(tiket), /belum selesai/);
});
