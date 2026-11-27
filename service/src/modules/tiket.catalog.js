const JENIS_TIKET = Object.freeze({
  delivery: {
    kontrak: ["kirim_kontrak", "terima_tukar"],
    trial: ["kirim_trial"],
    stand_by: ["kirim_stand_by"],
    event: ["kirim_event"],
    sell: ["kirim_sell"],
    toner_purchase: ["kirim_toner"]
  },
  komplain: {
    on_site_service: ["on_site_service"],
    back_up: ["kirim_back_up", "terima_unit_rusak"]
  },
  internal: {
    repair: ["repair"],
    qc: ["qc"],
    internal_use: ["internal_use"]
  },
  inbound: {
    return: ["terima_return"],
    penerimaan_printer: ["terima_printer_baru"]
  },
  maintenance: {
    maintenance: ["maintenance"]
  }
});

const JENIS_ST = Object.freeze(Object.values(JENIS_TIKET).flatMap((group) => Object.values(group).flat()));
const PENGIRIMAN_PRINTER = Object.freeze(["kirim_kontrak", "kirim_trial", "kirim_stand_by", "kirim_event", "kirim_sell", "kirim_back_up", "internal_use"]);
const PENERIMAAN_PRINTER = Object.freeze(["terima_tukar", "terima_unit_rusak", "terima_return", "terima_printer_baru"]);
const HASIL_KONDISI = Object.freeze(["ready", "ready_with_condition", "need_repair", "unready", "kanibal"]);
const PEMILIK_TIKET = Object.freeze({ delivery: "sales_admin", komplain: "sales_admin", internal: "kepala_teknisi", inbound: "warehouse", maintenance: "kepala_teknisi" });

function kategoriUntukJenisSt(jenisTugas) {
  for (const [kategori, jenis] of Object.entries(JENIS_TIKET)) {
    for (const [subjenis, tugas] of Object.entries(jenis)) {
      if (tugas.includes(jenisTugas)) return { kategori, jenis: subjenis };
    }
  }
  return null;
}

function jenisStDiizinkan(kategori, jenis, jenisTugas, mode) {
  if (!JENIS_TIKET[kategori]?.[jenis]?.includes(jenisTugas)) return false;
  if (jenisTugas === "terima_tukar" && mode !== "tukar") return false;
  return true;
}

function tugasWajib(kategori, jenis, mode) {
  const allowed = JENIS_TIKET[kategori]?.[jenis] || [];
  return allowed.filter((value) => value !== "terima_tukar" || mode === "tukar");
}

function unitDikecualikan(line) {
  return Boolean(line.pengecualian_disetujui_pada);
}

function unitSelesai(surat, line, tiket = surat.tiket) {
  if (unitDikecualikan(line)) return true;
  if (!surat.jenis_tugas) return true;
  if (PENERIMAAN_PRINTER.includes(surat.jenis_tugas)) return Boolean(line.konfirmasi_terima_pada);
  if (PENGIRIMAN_PRINTER.includes(surat.jenis_tugas)) {
    const dariTrial = surat.jenis_tugas === "kirim_kontrak" && tiket?.tiket_asal_id;
    return Boolean(line.konfirmasi_serah_pada && (dariTrial || line.konfirmasi_keluar_pada) && line.hasil && line.hasil.toLowerCase() !== "tertunda");
  }
  return Boolean(line.hasil && line.hasil.toLowerCase() !== "tertunda");
}

function reviewTiket(item) {
  const tasks = item.surat_tugas || [];
  const required = tugasWajib(item.kategori, item.jenis, item.mode);
  if (required.some((jenis) => !tasks.some((st) => st.jenis_tugas === jenis && st.status === "solved"))) return "Seluruh jenis ST wajib harus selesai sebelum tiket ditutup.";
  if (!tasks.some((st) => st.status === "solved")) return "Minimal satu Surat Tugas harus selesai sebelum tiket ditutup.";
  if (tasks.some((st) => !["solved", "cancelled"].includes(st.status))) return "Masih ada ST yang berjalan.";
  if (tasks.some((st) => st.status === "solved" && st.surat_tugas_printer?.some((line) => !unitSelesai(st, line, item)))) return "Masih ada unit ST yang belum selesai atau belum disetujui pengecualiannya.";
  if (item.jenis === "trial" && !["berhasil", "gagal", "batal"].includes(item.hasil)) return "Hasil TRIAL harus dicatat sebelum ditutup.";
  if ((item.jenis === "back_up" && item.mode === "permanen" || item.jenis === "kontrak" && item.mode === "tukar")
    && !tasks.some((st) => ["terima_unit_rusak", "terima_tukar"].includes(st.jenis_tugas) && st.status === "solved"
      && st.surat_tugas_printer?.some((line) => line.mp_no === item.mp_no && line.konfirmasi_terima_pada))) {
    return "Unit lama harus benar-benar diterima Warehouse sebelum tiket ditutup.";
  }
  return null;
}

module.exports = {
  JENIS_TIKET,
  JENIS_ST,
  PENGIRIMAN_PRINTER,
  PENERIMAAN_PRINTER,
  HASIL_KONDISI,
  PEMILIK_TIKET,
  kategoriUntukJenisSt,
  jenisStDiizinkan,
  tugasWajib,
  unitDikecualikan,
  unitSelesai,
  reviewTiket
};
