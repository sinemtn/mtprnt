const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const asyncHandler = require("../utils/async-handler");
const { sukses, gagal } = require("../utils/response");
const { buatNomor } = require("../utils/nomor");
const { autentikasi, otorisasi } = require("../middlewares/auth");
const { normalisasiRole } = require("../utils/roles");
const { aksiDariStatus, catatAudit } = require("./audit.service");
const { terapkanSlaPendingKomplain } = require("./sla.service");

const router = express.Router();

const querySchema = z.object({
  halaman: z.coerce.number().int().min(1).default(1),
  batas: z.coerce.number().int().min(1).max(100).default(20),
  cari: z.string().optional()
});

const STATUS_PENGADUAN = ["new", "pending", "progress", "solved", "cancelled"];
const LEGACY_STATUS_PENGADUAN = ["baru", "ditugaskan", "diproses", "selesai", "ditutup", "dibatalkan"];

const pengaduanBuatSchema = z.object({
  nomor_pengaduan: z.string().optional(),
  mp_no: z.string().optional().nullable(),
  pelanggan_id: z.string().uuid(),
  lokasi_pelanggan_id: z.string().uuid().optional().nullable(),
  sales_id: z.string().uuid().optional().nullable(),
  printer_terpasang_id: z.string().uuid().optional().nullable(),
  nama_pelapor: z.string().min(1),
  telepon_pelapor: z.string().optional().nullable(),
  tanggal_pengaduan: z.string().optional().nullable(),
  kategori: z.string().optional().nullable(),
  prioritas: z.enum(["rendah", "normal", "tinggi", "darurat"]).optional(),
  deskripsi_masalah: z.string().min(1),
  batas_respon: z.string().optional().nullable(),
  batas_penyelesaian: z.string().optional().nullable(),
  status: z.enum([...STATUS_PENGADUAN, ...LEGACY_STATUS_PENGADUAN]).optional(),
  ringkasan_penyelesaian: z.string().optional().nullable()
});

router.use(autentikasi);

function rolePengguna(req) {
  return normalisasiRole(req.pengguna.peran);
}

function hanyaRole(req, allowed, message = "Anda tidak memiliki akses untuk aksi ini.") {
  const role = rolePengguna(req);
  if (role === "admin" || allowed.includes(role)) return;
  throw Object.assign(new Error(message), { statusCode: 403 });
}

function buatSlug(nomor) {
  const base = String(nomor || buatNomor("PGD"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base || `komplain-${Date.now()}`;
}

async function pastikanSlugPengaduan(tx, item) {
  if (!item || item.slug) return item;
  return tx.pengaduan.update({
    where: { id: item.id },
    data: { slug: buatSlug(item.nomor_pengaduan) }
  });
}

function bolehLihatPengaduan(req, item) {
  const role = rolePengguna(req);
  if (["admin", "sales_admin", "kepala_teknisi", "warehouse"].includes(role)) return true;
  if (role === "sales") return item.sales_id === req.pengguna.id || item.dibuat_oleh === req.pengguna.id;
  if (role === "teknisi") {
    return item.surat_tugas?.some((surat) =>
      surat.teknisi_surat_tugas?.some((teknisi) => teknisi.teknisi_id === req.pengguna.id)
    );
  }
  return false;
}

function dataPengaduan(body) {
  const data = { ...body };
  if ("tanggal_pengaduan" in data) data.tanggal_pengaduan = data.tanggal_pengaduan ? new Date(data.tanggal_pengaduan) : undefined;
  if ("batas_respon" in data) data.batas_respon = data.batas_respon ? new Date(data.batas_respon) : null;
  if ("batas_penyelesaian" in data) data.batas_penyelesaian = data.batas_penyelesaian ? new Date(data.batas_penyelesaian) : null;
  return data;
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

router.get("/", otorisasi("sales", "sales-admin", "kepala-teknisi", "teknisi", "warehouse"), asyncHandler(async (req, res) => {
  await terapkanSlaPendingKomplain();
  const query = querySchema.parse(req.query);
  const where = {};
  const role = rolePengguna(req);

  if (role === "sales") {
    where.OR = [
      { sales_id: req.pengguna.id },
      { dibuat_oleh: req.pengguna.id }
    ];
  } else if (role === "teknisi") {
    where.surat_tugas = {
      some: {
        teknisi_surat_tugas: {
          some: { teknisi_id: req.pengguna.id }
        }
      }
    };
  }

  if (query.cari) {
    const searchOr = [
      { nomor_pengaduan: { contains: query.cari, mode: "insensitive" } },
      { nama_pelapor: { contains: query.cari, mode: "insensitive" } },
      { telepon_pelapor: { contains: query.cari, mode: "insensitive" } },
      { kategori: { contains: query.cari, mode: "insensitive" } },
      { deskripsi_masalah: { contains: query.cari, mode: "insensitive" } }
    ];
    where.AND = [{ OR: searchOr }];
  }

  const [total, items] = await Promise.all([
    prisma.pengaduan.count({ where }),
    prisma.pengaduan.findMany({
      where,
      skip: (query.halaman - 1) * query.batas,
      take: query.batas,
      orderBy: { tanggal_dibuat: "desc" }
    })
  ]);
  const itemsDenganSlug = await prisma.$transaction((tx) => Promise.all(items.map((item) => pastikanSlugPengaduan(tx, item))));

  return sukses(res, "Data berhasil diambil.", {
    items: itemsDenganSlug,
    meta: { halaman: query.halaman, batas: query.batas, total }
  });
}));

router.get("/:id", otorisasi("sales", "sales-admin", "kepala-teknisi", "teknisi", "warehouse"), asyncHandler(async (req, res) => {
  await terapkanSlaPendingKomplain();
  const item = await prisma.pengaduan.findUnique({
    where: { id: req.params.id },
    include: {
      surat_tugas: {
        orderBy: { tanggal_dibuat: "desc" },
        include: { teknisi_surat_tugas: true }
      }
    }
  });
  if (!item) return gagal(res, "Pengaduan tidak ditemukan.", 404);
  if (!bolehLihatPengaduan(req, item)) return gagal(res, "Anda tidak memiliki akses ke komplain ini.", 403);
  const itemDenganSlug = await prisma.$transaction((tx) => pastikanSlugPengaduan(tx, item));
  return sukses(res, "Pengaduan berhasil diambil.", itemDenganSlug);
}));

router.post("/", otorisasi("sales-admin"), asyncHandler(async (req, res) => {
  hanyaRole(req, ["sales_admin"]);
  const body = pengaduanBuatSchema.parse(req.body);
  if (rolePengguna(req) !== "admin" && body.status && !["new", "pending"].includes(body.status)) {
    return gagal(res, "Status awal komplain hanya boleh new atau pending.", 422);
  }
  const hasil = await prisma.$transaction(async (tx) => {
    const pelanggan = await pastikanCabangJikaMultisite(tx, body.pelanggan_id, body.lokasi_pelanggan_id);
    if (pelanggan?.jenis_pelanggan === "single") body.lokasi_pelanggan_id = null;
    const nomorPengaduan = body.nomor_pengaduan || buatNomor("PGD");
    const item = await tx.pengaduan.create({
      data: {
        ...dataPengaduan(body),
        nomor_pengaduan: nomorPengaduan,
        slug: buatSlug(nomorPengaduan),
        dibuat_oleh: req.pengguna.id
      }
    });

    await catatAudit(tx, req, {
      jenis_dokumen: "pengaduan",
      nomor_dokumen: item.nomor_pengaduan,
      tabel_sumber: "pengaduan",
      id_sumber: item.id,
      aksi: "buat",
      status_sesudah: item.status,
      data_sesudah: item,
      keterangan: "Pengaduan dibuat."
    });

    return item;
  });

  return sukses(res, "Pengaduan berhasil dibuat.", hasil, 201);
}));

router.put("/:id", otorisasi(), asyncHandler(async (req, res) => {
  hanyaRole(req, []);
  const body = pengaduanBuatSchema.partial().parse(req.body);
  if (rolePengguna(req) !== "admin" && ["solved", "cancelled"].includes(body.status)) {
    return gagal(res, "Status solved/cancelled hanya bisa lewat aksi resolve atau pembatalan admin.", 422);
  }
  const hasil = await prisma.$transaction(async (tx) => {
    const sebelum = await tx.pengaduan.findUnique({ where: { id: req.params.id } });
    if (!sebelum) return null;
    const pelanggan = await pastikanCabangJikaMultisite(tx, body.pelanggan_id || sebelum.pelanggan_id, body.lokasi_pelanggan_id ?? sebelum.lokasi_pelanggan_id);
    if (pelanggan?.jenis_pelanggan === "single") body.lokasi_pelanggan_id = null;

    const sesudah = await tx.pengaduan.update({
      where: { id: req.params.id },
      data: dataPengaduan(body)
    });

    await catatAudit(tx, req, {
      jenis_dokumen: "pengaduan",
      nomor_dokumen: sesudah.nomor_pengaduan,
      tabel_sumber: "pengaduan",
      id_sumber: sesudah.id,
      aksi: aksiDariStatus(sebelum, sesudah),
      status_sebelum: sebelum.status,
      status_sesudah: sesudah.status,
      data_sebelum: sebelum,
      data_sesudah: sesudah,
      keterangan: "Pengaduan diperbarui."
    });

    return sesudah;
  });

  if (!hasil) return gagal(res, "Pengaduan tidak ditemukan.", 404);
  return sukses(res, "Pengaduan berhasil diperbarui.", hasil);
}));

router.delete("/:id", otorisasi(), asyncHandler(async (req, res) => {
  hanyaRole(req, []);
  const hasil = await prisma.$transaction(async (tx) => {
    const sebelum = await tx.pengaduan.findUnique({ where: { id: req.params.id } });
    if (!sebelum) return null;

    const sesudah = await tx.pengaduan.update({
      where: { id: req.params.id },
      data: { status: "cancelled" }
    });

    await catatAudit(tx, req, {
      jenis_dokumen: "pengaduan",
      nomor_dokumen: sesudah.nomor_pengaduan,
      tabel_sumber: "pengaduan",
      id_sumber: sesudah.id,
      aksi: "batalkan",
      status_sebelum: sebelum.status,
      status_sesudah: sesudah.status,
      data_sebelum: sebelum,
      data_sesudah: sesudah,
      keterangan: "Pengaduan dibatalkan."
    });

    return sesudah;
  });

  if (!hasil) return gagal(res, "Pengaduan tidak ditemukan.", 404);
  return sukses(res, "Pengaduan berhasil dibatalkan.", hasil);
}));

router.post("/:id/resolve", otorisasi("sales-admin"), asyncHandler(async (req, res) => {
  hanyaRole(req, ["sales_admin"]);
  const hasil = await prisma.$transaction(async (tx) => {
    const sebelum = await tx.pengaduan.findUnique({
      where: { id: req.params.id },
      include: { surat_tugas: true }
    });
    if (!sebelum) return null;

    if (!sebelum.surat_tugas.length) {
      throw Object.assign(new Error("Komplain hanya bisa diselesaikan setelah memiliki surat tugas terkait."), { statusCode: 409 });
    }

    const belumSelesai = sebelum.surat_tugas.filter((surat) => surat.status !== "solved");
    if (belumSelesai.length) {
      throw Object.assign(new Error("Komplain hanya bisa diselesaikan jika semua surat tugas terkait sudah solved."), { statusCode: 409 });
    }

    const sesudah = await tx.pengaduan.update({
      where: { id: req.params.id },
      data: {
        status: "solved",
        tanggal_diselesaikan: new Date(),
        ringkasan_penyelesaian: req.body?.ringkasan_penyelesaian || sebelum.ringkasan_penyelesaian
      }
    });

    await catatAudit(tx, req, {
      jenis_dokumen: "pengaduan",
      nomor_dokumen: sesudah.nomor_pengaduan,
      tabel_sumber: "pengaduan",
      id_sumber: sesudah.id,
      aksi: "resolve",
      status_sebelum: sebelum.status,
      status_sesudah: sesudah.status,
      data_sebelum: sebelum,
      data_sesudah: sesudah,
      keterangan: "Pengaduan diselesaikan."
    });

    return sesudah;
  });

  if (!hasil) return gagal(res, "Pengaduan tidak ditemukan.", 404);
  return sukses(res, "Pengaduan berhasil diselesaikan.", hasil);
}));

module.exports = router;
