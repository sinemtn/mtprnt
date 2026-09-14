const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const asyncHandler = require("../utils/async-handler");
const { sukses, gagal } = require("../utils/response");
const { buatNomor } = require("../utils/nomor");
const { autentikasi, otorisasi } = require("../middlewares/auth");
const { normalisasiRole } = require("../utils/roles");
const { kurangiStok } = require("./stok.service");
const { aksiDariStatus, catatAudit } = require("./audit.service");

const router = express.Router();

const STATUS_SURAT_TUGAS = ["pending", "progress", "ready_to_print", "technician_completed", "warehouse_validated", "solved", "cancelled"];
const LEGACY_STATUS_SURAT_TUGAS = ["draft", "ditugaskan", "diproses", "diajukan", "disetujui", "ditutup", "dibatalkan"];

const suratTugasSchema = z.object({
  nomor_surat_tugas: z.string().optional(),
  pengaduan_id: z.string().uuid().optional().nullable(),
  mp_no: z.string().optional().nullable(),
  pelanggan_id: z.string().uuid(),
  lokasi_pelanggan_id: z.string().uuid().optional().nullable(),
  printer_terpasang_id: z.string().uuid().optional().nullable(),
  pic_teknisi_id: z.string().uuid().optional().nullable(),
  tanggal_jadwal: z.string().optional().nullable(),
  mulai_kunjungan: z.string().optional().nullable(),
  selesai_kunjungan: z.string().optional().nullable(),
  jenis_pekerjaan: z.string().optional(),
  catatan_masalah: z.string().optional().nullable(),
  tindakan: z.string().optional().nullable(),
  hasil: z.string().optional().nullable(),
  status: z.enum([...STATUS_SURAT_TUGAS, ...LEGACY_STATUS_SURAT_TUGAS]).optional()
});

const teknisiSchema = z.object({
  teknisi_id: z.string().uuid(),
  peran: z.enum(["utama", "pendamping"]).optional()
});

const pemakaianSchema = z.object({
  gudang_id: z.string().uuid(),
  jenis_barang: z.enum(["toner", "printer", "suku_cadang"]),
  toner_id: z.string().uuid().optional().nullable(),
  printer_id: z.string().uuid().optional().nullable(),
  suku_cadang_id: z.string().uuid().optional().nullable(),
  jumlah_pakai: z.number().positive(),
  serial_number: z.string().optional().nullable(),
  keterangan: z.string().optional().nullable()
});

function assertRole(role, allowed, message = "Anda tidak memiliki akses untuk aksi ini.") {
  if (role === "admin" || allowed.includes(role)) return;
  throw Object.assign(new Error(message), { statusCode: 403 });
}

function rolePengguna(req) {
  return normalisasiRole(req.pengguna.peran);
}

function hanyaRole(req, allowed, message = "Anda tidak memiliki akses untuk aksi ini.") {
  assertRole(rolePengguna(req), allowed, message);
}

function assertStatus(current, allowed, message) {
  if (allowed.includes(current)) return;
  throw Object.assign(new Error(message), { statusCode: 409 });
}

async function assertTeknisiAssigned(tx, req, suratId) {
  if (rolePengguna(req) === "admin") return;
  const assigned = await tx.teknisi_surat_tugas.findFirst({
    where: {
      surat_tugas_id: suratId,
      teknisi_id: req.pengguna.id
    }
  });
  if (!assigned) {
    throw Object.assign(new Error("Teknisi hanya bisa mengubah surat tugas yang ditugaskan ke dirinya."), { statusCode: 403 });
  }
}

function bolehLihatSuratTugas(req, item) {
  const role = rolePengguna(req);
  if (["admin", "kepala_teknisi", "warehouse"].includes(role)) return true;
  if (role === "teknisi") {
    return item.teknisi_surat_tugas?.some((teknisi) => teknisi.teknisi_id === req.pengguna.id);
  }
  if (["sales", "sales_admin"].includes(role)) {
    if (!item.pengaduan) return false;
    return item.pengaduan.sales_id === req.pengguna.id || item.pengaduan.dibuat_oleh === req.pengguna.id;
  }
  return false;
}

async function catatStatusSurat(tx, req, sebelum, sesudah, aksi, keterangan, dataTambahan = {}) {
  await catatAudit(tx, req, {
    jenis_dokumen: "surat_tugas",
    nomor_dokumen: sesudah.nomor_surat_tugas,
    tabel_sumber: "surat_tugas",
    id_sumber: sesudah.id,
    aksi,
    status_sebelum: sebelum.status,
    status_sesudah: sesudah.status,
    data_sebelum: sebelum,
    data_sesudah: { ...sesudah, ...dataTambahan },
    keterangan
  });
}

function dataSuratTugas(body) {
  const { pic_teknisi_id, ...data } = body;
  if ("tanggal_jadwal" in data) data.tanggal_jadwal = data.tanggal_jadwal ? new Date(data.tanggal_jadwal) : null;
  if ("mulai_kunjungan" in data) data.mulai_kunjungan = data.mulai_kunjungan ? new Date(data.mulai_kunjungan) : null;
  if ("selesai_kunjungan" in data) data.selesai_kunjungan = data.selesai_kunjungan ? new Date(data.selesai_kunjungan) : null;
  return data;
}

async function simpanPicTeknisi(tx, suratId, picTeknisiId) {
  if (!picTeknisiId) return;
  const teknisi = await tx.master_pengguna.findUnique({ where: { id: picTeknisiId } });
  if (!teknisi || teknisi.peran !== "teknisi") {
    throw Object.assign(new Error("PIC harus user dengan role teknisi."), { statusCode: 422 });
  }
  await tx.teknisi_surat_tugas.deleteMany({ where: { surat_tugas_id: suratId, peran: "utama" } });
  await tx.teknisi_surat_tugas.create({
    data: {
      surat_tugas_id: suratId,
      teknisi_id: picTeknisiId,
      peran: "utama"
    }
  });
}

async function pastikanCabangJikaMultisite(tx, pelangganId, lokasiId) {
  if (!pelangganId) return;
  const pelanggan = await tx.master_pelanggan.findUnique({ where: { id: pelangganId } });
  if (!pelanggan) {
    throw Object.assign(new Error("Customer tidak ditemukan."), { statusCode: 404 });
  }
  if (pelanggan?.jenis_pelanggan === "multisite" && !lokasiId) {
    throw Object.assign(new Error("Cabang customer wajib diisi untuk customer multisite."), { statusCode: 422 });
  }
  if (pelanggan.jenis_pelanggan === "single") return pelanggan;
  const lokasi = await tx.master_lokasi_pelanggan.findUnique({ where: { id: lokasiId } });
  if (!lokasi || lokasi.pelanggan_id !== pelangganId) {
    throw Object.assign(new Error("Cabang customer tidak sesuai dengan customer yang dipilih."), { statusCode: 422 });
  }
  return pelanggan;
}

function pekerjaanMemasangPrinter(jenisPekerjaan) {
  return ["installation", "install", "instalasi", "delivery", "replacement", "penggantian"].includes(String(jenisPekerjaan || "").toLowerCase());
}

function nomorSeriTerpasang(surat, line) {
  return String(line.serial_number || surat.mp_no || `${surat.nomor_surat_tugas}-${line.id.slice(0, 8)}`).trim();
}

async function sinkronPrinterTerpasangDariSurat(tx, surat, pemakaian) {
  if (!pekerjaanMemasangPrinter(surat.jenis_pekerjaan)) return [];

  const printerLines = pemakaian.filter((line) => line.jenis_barang === "printer" && line.printer_id);
  const hasil = [];

  for (const line of printerLines) {
    const nomor_seri = nomorSeriTerpasang(surat, line);
    const data = {
      pelanggan_id: surat.pelanggan_id,
      lokasi_pelanggan_id: surat.lokasi_pelanggan_id || null,
      printer_id: line.printer_id,
      nomor_seri,
      lokasi_detail: line.keterangan || surat.hasil || surat.catatan_masalah || null,
      tanggal_instalasi: surat.selesai_kunjungan || new Date(),
      status: "aktif",
      tanggal_diperbarui: new Date()
    };

    const existing = await tx.master_printer_terpasang.findUnique({
      where: { nomor_seri }
    });

    const printerTerpasang = existing
      ? await tx.master_printer_terpasang.update({
        where: { id: existing.id },
        data
      })
      : await tx.master_printer_terpasang.create({
        data
      });

    await tx.surat_tugas.update({
      where: { id: surat.id },
      data: { printer_terpasang_id: printerTerpasang.id }
    });

    hasil.push(printerTerpasang);
  }

  return hasil;
}

const suratTugasInclude = {
  master_pelanggan: true,
  master_lokasi_pelanggan: true,
  master_printer_terpasang: true,
  pengaduan: true,
  master_pengguna_surat_tugas_dibuat_olehTomaster_pengguna: true,
  master_pengguna_surat_tugas_disetujui_olehTomaster_pengguna: true,
  master_pengguna_surat_tugas_validasi_warehouse_olehTomaster_pengguna: true,
  master_pengguna_surat_tugas_validasi_kepala_olehTomaster_pengguna: true,
  teknisi_surat_tugas: {
    include: {
      master_pengguna: true
    }
  },
  pemakaian_barang_surat_tugas: {
    include: {
      master_gudang: true,
      master_printer: true,
      master_toner: true,
      master_suku_cadang: true
    }
  }
};

router.use(autentikasi);

router.get("/", otorisasi("sales", "sales-admin", "kepala-teknisi", "teknisi", "warehouse"), asyncHandler(async (req, res) => {
  const role = rolePengguna(req);
  let where = {};
  if (role === "teknisi") {
    where = { teknisi_surat_tugas: { some: { teknisi_id: req.pengguna.id } } };
  } else if (["sales", "sales_admin"].includes(role)) {
    where = {
      pengaduan: {
        is: {
          OR: [
            { sales_id: req.pengguna.id },
            { dibuat_oleh: req.pengguna.id }
          ]
        }
      }
    };
  }
  const items = await prisma.surat_tugas.findMany({
    where,
    orderBy: { tanggal_dibuat: "desc" },
    take: 100,
    include: suratTugasInclude
  });
  return sukses(res, "Surat tugas berhasil diambil.", items);
}));

router.get("/:id", otorisasi("sales", "sales-admin", "kepala-teknisi", "teknisi", "warehouse"), asyncHandler(async (req, res) => {
  const item = await prisma.surat_tugas.findUnique({
    where: { id: req.params.id },
    include: suratTugasInclude
  });
  if (!item) return gagal(res, "Surat tugas tidak ditemukan.", 404);
  if (!bolehLihatSuratTugas(req, item)) return gagal(res, "Anda tidak memiliki akses ke surat tugas ini.", 403);
  return sukses(res, "Surat tugas berhasil diambil.", {
    ...item,
    teknisi: item.teknisi_surat_tugas,
    pemakaian: item.pemakaian_barang_surat_tugas
  });
}));

router.post("/", otorisasi("kepala-teknisi"), asyncHandler(async (req, res) => {
  hanyaRole(req, ["kepala_teknisi"]);
  const body = suratTugasSchema.parse(req.body);
  if (!body.pic_teknisi_id) {
    return gagal(res, "PIC teknisi wajib diisi.", 422);
  }
  const item = await prisma.$transaction(async (tx) => {
    const pelanggan = await pastikanCabangJikaMultisite(tx, body.pelanggan_id, body.lokasi_pelanggan_id);
    if (pelanggan?.jenis_pelanggan === "single") body.lokasi_pelanggan_id = null;
    const surat = await tx.surat_tugas.create({
      data: {
        ...dataSuratTugas(body),
        nomor_surat_tugas: body.nomor_surat_tugas || buatNomor("ST"),
        status: body.status || "pending",
        dibuat_oleh: req.pengguna.id
      }
    });
    await simpanPicTeknisi(tx, surat.id, body.pic_teknisi_id);

    if (surat.pengaduan_id) {
      await tx.pengaduan.update({
        where: { id: surat.pengaduan_id },
        data: { status: "progress" }
      });
    }

    await catatAudit(tx, req, {
      jenis_dokumen: "surat_tugas",
      nomor_dokumen: surat.nomor_surat_tugas,
      tabel_sumber: "surat_tugas",
      id_sumber: surat.id,
      aksi: "buat",
      status_sesudah: surat.status,
      data_sesudah: surat,
      keterangan: "Surat tugas dibuat."
    });

    return surat;
  });
  return sukses(res, "Surat tugas berhasil dibuat.", item, 201);
}));

router.put("/:id", otorisasi("kepala-teknisi", "teknisi"), asyncHandler(async (req, res) => {
  hanyaRole(req, ["kepala_teknisi", "teknisi"]);
  const body = suratTugasSchema.partial().parse(req.body);
  const item = await prisma.$transaction(async (tx) => {
    const sebelum = await tx.surat_tugas.findUnique({ where: { id: req.params.id } });
    if (!sebelum) return null;
    if (rolePengguna(req) !== "admin") {
      delete body.status;
    }
    if (rolePengguna(req) === "teknisi") {
      await assertTeknisiAssigned(tx, req, sebelum.id);
      delete body.pengaduan_id;
      delete body.pelanggan_id;
      delete body.lokasi_pelanggan_id;
      delete body.printer_terpasang_id;
      delete body.status;
    }
    const pelanggan = await pastikanCabangJikaMultisite(tx, body.pelanggan_id || sebelum.pelanggan_id, body.lokasi_pelanggan_id ?? sebelum.lokasi_pelanggan_id);
    if (pelanggan?.jenis_pelanggan === "single") body.lokasi_pelanggan_id = null;

    const sesudah = await tx.surat_tugas.update({
      where: { id: req.params.id },
      data: dataSuratTugas(body)
    });
    await simpanPicTeknisi(tx, sesudah.id, body.pic_teknisi_id);

    await catatAudit(tx, req, {
      jenis_dokumen: "surat_tugas",
      nomor_dokumen: sesudah.nomor_surat_tugas,
      tabel_sumber: "surat_tugas",
      id_sumber: sesudah.id,
      aksi: aksiDariStatus(sebelum, sesudah),
      status_sebelum: sebelum.status,
      status_sesudah: sesudah.status,
      data_sebelum: sebelum,
      data_sesudah: sesudah,
      keterangan: "Surat tugas diperbarui."
    });

    return sesudah;
  });
  if (!item) return gagal(res, "Surat tugas tidak ditemukan.", 404);
  return sukses(res, "Surat tugas berhasil diperbarui.", item);
}));

router.post("/:id/teknisi", otorisasi("kepala-teknisi"), asyncHandler(async (req, res) => {
  hanyaRole(req, ["kepala_teknisi"]);
  const body = teknisiSchema.parse(req.body);
  const item = await prisma.$transaction(async (tx) => {
    const surat = await tx.surat_tugas.findUnique({ where: { id: req.params.id } });
    if (!surat) return null;
    const teknisi = await tx.master_pengguna.findUnique({ where: { id: body.teknisi_id } });
    if (!teknisi || teknisi.peran !== "teknisi") {
      throw Object.assign(new Error("PIC harus user dengan role teknisi."), { statusCode: 422 });
    }

    const assigned = await tx.teknisi_surat_tugas.create({
      data: {
        surat_tugas_id: req.params.id,
        teknisi_id: body.teknisi_id,
        peran: body.peran || "utama"
      }
    });

    await catatStatusSurat(tx, req, surat, surat, "assign_teknisi", "Teknisi ditugaskan.", { teknisi_id: body.teknisi_id });

    return assigned;
  });
  if (!item) return gagal(res, "Surat tugas tidak ditemukan.", 404);
  return sukses(res, "Teknisi surat tugas berhasil ditambahkan.", item, 201);
}));

router.post("/:id/start", otorisasi("kepala-teknisi"), asyncHandler(async (req, res) => {
  hanyaRole(req, ["kepala_teknisi"]);
  const item = await prisma.$transaction(async (tx) => {
    const sebelum = await tx.surat_tugas.findUnique({ where: { id: req.params.id } });
    if (!sebelum) return null;
    assertStatus(sebelum.status, ["pending"], "Surat tugas hanya bisa dimulai dari status pending.");

    const sesudah = await tx.surat_tugas.update({
      where: { id: sebelum.id },
      data: { status: "progress" }
    });

    await catatStatusSurat(tx, req, sebelum, sesudah, "start", "Kepala teknisi memulai surat tugas.");
    return sesudah;
  });
  if (!item) return gagal(res, "Surat tugas tidak ditemukan.", 404);
  return sukses(res, "Surat tugas dimulai.", item);
}));

router.post("/:id/pemakaian", otorisasi("teknisi"), asyncHandler(async (req, res) => {
  hanyaRole(req, ["teknisi"]);
  const body = pemakaianSchema.parse(req.body);
  const item = await prisma.$transaction(async (tx) => {
    const surat = await tx.surat_tugas.findUnique({ where: { id: req.params.id } });
    if (!surat) return null;
    await assertTeknisiAssigned(tx, req, surat.id);
    assertStatus(surat.status, ["progress", "ready_to_print"], "Item hanya bisa ditambahkan saat surat tugas progress atau ready_to_print.");

    const pemakaian = await tx.pemakaian_barang_surat_tugas.create({
      data: {
        surat_tugas_id: req.params.id,
        ...body
      }
    });

    await catatAudit(tx, req, {
      jenis_dokumen: "surat_tugas",
      nomor_dokumen: surat.nomor_surat_tugas,
      tabel_sumber: "pemakaian_barang_surat_tugas",
      id_sumber: pemakaian.id,
      aksi: "tambah_item",
      status_sesudah: surat.status,
      data_sesudah: pemakaian,
      keterangan: "Item surat tugas ditambahkan."
    });

    return pemakaian;
  });
  if (!item) return gagal(res, "Surat tugas tidak ditemukan.", 404);
  return sukses(res, "Pemakaian barang berhasil ditambahkan.", item, 201);
}));

router.delete("/:id/pemakaian/:pemakaianId", otorisasi("teknisi"), asyncHandler(async (req, res) => {
  hanyaRole(req, ["teknisi"]);
  const item = await prisma.$transaction(async (tx) => {
    const surat = await tx.surat_tugas.findUnique({ where: { id: req.params.id } });
    if (!surat) return null;
    await assertTeknisiAssigned(tx, req, surat.id);
    assertStatus(surat.status, ["progress", "ready_to_print"], "Item hanya bisa dihapus saat surat tugas progress atau ready_to_print.");

    const pemakaian = await tx.pemakaian_barang_surat_tugas.findFirst({
      where: {
        id: req.params.pemakaianId,
        surat_tugas_id: surat.id
      }
    });
    if (!pemakaian) {
      throw Object.assign(new Error("Item surat tugas tidak ditemukan."), { statusCode: 404 });
    }

    await tx.pemakaian_barang_surat_tugas.delete({ where: { id: pemakaian.id } });

    await catatAudit(tx, req, {
      jenis_dokumen: "surat_tugas",
      nomor_dokumen: surat.nomor_surat_tugas,
      tabel_sumber: "pemakaian_barang_surat_tugas",
      id_sumber: pemakaian.id,
      aksi: "hapus_item",
      status_sebelum: surat.status,
      status_sesudah: surat.status,
      data_sebelum: pemakaian,
      keterangan: "Item surat tugas dihapus."
    });

    return pemakaian;
  });
  if (!item) return gagal(res, "Surat tugas tidak ditemukan.", 404);
  return sukses(res, "Item surat tugas berhasil dihapus.", item);
}));

router.post("/:id/ready-to-print", otorisasi("teknisi"), asyncHandler(async (req, res) => {
  hanyaRole(req, ["teknisi"]);
  const item = await prisma.$transaction(async (tx) => {
    const sebelum = await tx.surat_tugas.findUnique({ where: { id: req.params.id } });
    if (!sebelum) return null;
    await assertTeknisiAssigned(tx, req, sebelum.id);
    assertStatus(sebelum.status, ["progress"], "Surat tugas harus progress sebelum Ready to Print.");

    const sesudah = await tx.surat_tugas.update({
      where: { id: req.params.id },
      data: { status: "ready_to_print" }
    });

    await catatStatusSurat(tx, req, sebelum, sesudah, "ready_to_print", "Surat tugas siap dicetak.");

    return sesudah;
  });
  if (!item) return gagal(res, "Surat tugas tidak ditemukan.", 404);
  return sukses(res, "Surat tugas siap dicetak.", item);
}));

router.post("/:id/selesai-teknisi", otorisasi("teknisi"), asyncHandler(async (req, res) => {
  hanyaRole(req, ["teknisi"]);
  const item = await prisma.$transaction(async (tx) => {
    const sebelum = await tx.surat_tugas.findUnique({ where: { id: req.params.id } });
    if (!sebelum) return null;
    await assertTeknisiAssigned(tx, req, sebelum.id);
    assertStatus(sebelum.status, ["ready_to_print"], "Surat tugas harus ready_to_print sebelum diselesaikan teknisi.");

    const sesudah = await tx.surat_tugas.update({
      where: { id: req.params.id },
      data: {
        status: "technician_completed",
        selesai_kunjungan: req.body?.selesai_kunjungan ? new Date(req.body.selesai_kunjungan) : new Date(),
        hasil: req.body?.hasil || sebelum.hasil
      }
    });

    await catatStatusSurat(tx, req, sebelum, sesudah, "selesai_teknisi", "Teknisi menyelesaikan pekerjaan lapangan.");

    return sesudah;
  });
  if (!item) return gagal(res, "Surat tugas tidak ditemukan.", 404);
  return sukses(res, "Surat tugas selesai oleh teknisi.", item);
}));

router.post("/:id/validasi-warehouse", otorisasi("warehouse"), asyncHandler(async (req, res) => {
  hanyaRole(req, ["warehouse"]);
  const hasil = await prisma.$transaction(async (tx) => {
    const surat = await tx.surat_tugas.findUnique({ where: { id: req.params.id } });
    if (!surat) return null;
    assertStatus(surat.status, ["technician_completed"], "Warehouse hanya bisa validasi surat tugas yang sudah technician_completed.");

    const pemakaian = await tx.pemakaian_barang_surat_tugas.findMany({
      where: { surat_tugas_id: surat.id }
    });
    if (!pemakaian.length) {
      throw Object.assign(new Error("Warehouse hanya validasi surat tugas yang memiliki item/barang."), { statusCode: 409 });
    }

    const mutasi = await tx.mutasi_stok.create({
      data: {
        nomor_mutasi: buatNomor("PMK"),
        jenis_mutasi: "pemakaian",
        gudang_asal_id: pemakaian[0]?.gudang_id || null,
        jenis_referensi: "surat_tugas",
        referensi_id: surat.id,
        status: "terposting",
        keterangan: `Pemakaian barang surat tugas ${surat.nomor_surat_tugas}`,
        dibuat_oleh: req.pengguna.id,
        tanggal_terposting: new Date()
      }
    });

    for (const line of pemakaian) {
      const itemId = line.toner_id || line.printer_id || line.suku_cadang_id;
      await kurangiStok(tx, line.jenis_barang, line.gudang_id, itemId, line.jumlah_pakai);
      await tx.detail_mutasi_stok.create({
        data: {
          mutasi_stok_id: mutasi.id,
          jenis_barang: line.jenis_barang,
          toner_id: line.toner_id,
          printer_id: line.printer_id,
          suku_cadang_id: line.suku_cadang_id,
          jumlah: line.jumlah_pakai,
          keterangan: line.keterangan
        }
      });
    }

    const sesudah = await tx.surat_tugas.update({
      where: { id: surat.id },
      data: {
        status: "warehouse_validated",
        validasi_warehouse_oleh: req.pengguna.id,
        validasi_warehouse_pada: new Date()
      }
    });

    await catatStatusSurat(tx, req, { ...surat, pemakaian }, sesudah, "validasi_warehouse", "Warehouse validasi barang dan stok pemakaian diposting.", { pemakaian, mutasi_stok_id: mutasi.id });

    return sesudah;
  });

  if (!hasil) return gagal(res, "Surat tugas tidak ditemukan.", 404);
  return sukses(res, "Surat tugas berhasil divalidasi warehouse dan stok sudah dikurangi.", hasil);
}));

router.post("/:id/resolve", otorisasi("kepala-teknisi"), asyncHandler(async (req, res) => {
  hanyaRole(req, ["kepala_teknisi"]);
  const hasil = await prisma.$transaction(async (tx) => {
    const sebelum = await tx.surat_tugas.findUnique({ where: { id: req.params.id } });
    if (!sebelum) return null;

    const pemakaian = await tx.pemakaian_barang_surat_tugas.findMany({
      where: { surat_tugas_id: sebelum.id }
    });

    if (pemakaian.length) {
      assertStatus(sebelum.status, ["warehouse_validated"], "Surat tugas dengan item harus warehouse_validated sebelum solved.");
    } else {
      assertStatus(sebelum.status, ["technician_completed"], "Surat tugas tanpa item harus technician_completed sebelum solved.");
    }

    const sesudah = await tx.surat_tugas.update({
      where: { id: sebelum.id },
      data: {
        status: "solved",
        validasi_kepala_teknisi_oleh: req.pengguna.id,
        validasi_kepala_teknisi_pada: new Date(),
        disetujui_oleh: req.pengguna.id,
        disetujui_pada: new Date()
      }
    });

    const printerTerpasang = await sinkronPrinterTerpasangDariSurat(tx, sesudah, pemakaian);

    await catatStatusSurat(tx, req, { ...sebelum, pemakaian }, sesudah, "resolve", "Surat tugas diselesaikan kepala teknisi.", { pemakaian, printer_terpasang: printerTerpasang });

    return {
      ...sesudah,
      printer_terpasang: printerTerpasang
    };
  });

  if (!hasil) return gagal(res, "Surat tugas tidak ditemukan.", 404);
  return sukses(res, "Surat tugas berhasil diselesaikan.", hasil);
}));

router.post("/:id/ajukan", otorisasi("teknisi", "kepala-teknisi"), asyncHandler(async (req, res) => {
  req.url = `/${req.params.id}/ready-to-print`;
  return gagal(res, "Endpoint ajukan sudah diganti menjadi /ready-to-print.", 410);
}));

router.post("/:id/setujui", otorisasi("warehouse"), asyncHandler(async (req, res) => {
  return gagal(res, "Endpoint setujui sudah diganti menjadi /validasi-warehouse.", 410);
}));

module.exports = router;
