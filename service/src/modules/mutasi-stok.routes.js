const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const asyncHandler = require("../utils/async-handler");
const { sukses, gagal } = require("../utils/response");
const { buatNomor } = require("../utils/nomor");
const { autentikasi, izin } = require("../middlewares/auth");
const { terapkanMutasi } = require("./stok.service");
const { catatAudit } = require("./audit.service");

const router = express.Router();

const lineSchema = z.object({
  jenis_barang: z.enum(["toner", "printer", "suku_cadang"]),
  toner_id: z.string().uuid().optional().nullable(),
  printer_id: z.string().uuid().optional().nullable(),
  suku_cadang_id: z.string().uuid().optional().nullable(),
  jumlah: z.number().positive(),
  satuan: z.string().optional(),
  keterangan: z.string().optional().nullable()
});

const mutasiSchema = z.object({
  nomor_mutasi: z.string().optional(),
  jenis_mutasi: z.enum(["masuk", "keluar", "transfer", "penyesuaian", "pemakaian"]),
  gudang_asal_id: z.string().uuid().optional().nullable(),
  gudang_tujuan_id: z.string().uuid().optional().nullable(),
  jenis_referensi: z.string().optional().nullable(),
  referensi_id: z.string().uuid().optional().nullable(),
  keterangan: z.string().optional().nullable(),
  detail: z.array(lineSchema).min(1),
  langsung_posting: z.boolean().optional()
});

router.use(autentikasi);

router.get("/", izin("stock_data", "view", "warehouse", "kepala-teknisi"), asyncHandler(async (req, res) => {
  const items = await prisma.mutasi_stok.findMany({
    orderBy: { tanggal_mutasi: "desc" },
    take: 100
  });
  return sukses(res, "Mutasi stok berhasil diambil.", items);
}));

router.get("/:id", izin("stock_data", "view", "warehouse", "kepala-teknisi"), asyncHandler(async (req, res) => {
  const item = await prisma.mutasi_stok.findUnique({ where: { id: req.params.id } });
  if (!item) return gagal(res, "Mutasi stok tidak ditemukan.", 404);
  const detail = await prisma.detail_mutasi_stok.findMany({ where: { mutasi_stok_id: item.id } });
  return sukses(res, "Mutasi stok berhasil diambil.", { ...item, detail });
}));

router.post("/", izin("stock_data", "create", "warehouse"), asyncHandler(async (req, res) => {
  const body = mutasiSchema.parse(req.body);
  const hasil = await prisma.$transaction(async (tx) => {
    const mutasi = await tx.mutasi_stok.create({
      data: {
        nomor_mutasi: body.nomor_mutasi || buatNomor("MTS"),
        jenis_mutasi: body.jenis_mutasi,
        gudang_asal_id: body.gudang_asal_id || null,
        gudang_tujuan_id: body.gudang_tujuan_id || null,
        jenis_referensi: body.jenis_referensi || "manual",
        referensi_id: body.referensi_id || null,
        status: body.langsung_posting ? "terposting" : "draft",
        keterangan: body.keterangan || null,
        dibuat_oleh: req.pengguna.id,
        tanggal_terposting: body.langsung_posting ? new Date() : null
      }
    });

    await tx.detail_mutasi_stok.createMany({
      data: body.detail.map((line) => ({
        mutasi_stok_id: mutasi.id,
        ...line
      }))
    });

    if (body.langsung_posting) {
      await terapkanMutasi(tx, mutasi, body.detail);
    }

    await catatAudit(tx, req, {
      jenis_dokumen: "mutasi_stok",
      nomor_dokumen: mutasi.nomor_mutasi,
      tabel_sumber: "mutasi_stok",
      id_sumber: mutasi.id,
      aksi: "buat",
      status_sesudah: mutasi.status,
      data_sesudah: { ...mutasi, detail: body.detail },
      keterangan: body.langsung_posting ? "Mutasi stok dibuat dan langsung diposting." : "Mutasi stok dibuat."
    });

    return mutasi;
  });

  return sukses(res, "Mutasi stok berhasil dibuat.", hasil, 201);
}));

router.post("/:id/posting", izin("stock_data", "workflow", "warehouse"), asyncHandler(async (req, res) => {
  const hasil = await prisma.$transaction(async (tx) => {
    const mutasi = await tx.mutasi_stok.findUnique({ where: { id: req.params.id } });
    if (!mutasi) return null;
    if (mutasi.status !== "draft") {
      throw Object.assign(new Error("Mutasi stok sudah diproses."), { statusCode: 409 });
    }

    const detail = await tx.detail_mutasi_stok.findMany({ where: { mutasi_stok_id: mutasi.id } });
    await terapkanMutasi(tx, mutasi, detail);

    const sesudah = await tx.mutasi_stok.update({
      where: { id: mutasi.id },
      data: { status: "terposting", tanggal_terposting: new Date() }
    });

    await catatAudit(tx, req, {
      jenis_dokumen: "mutasi_stok",
      nomor_dokumen: sesudah.nomor_mutasi,
      tabel_sumber: "mutasi_stok",
      id_sumber: sesudah.id,
      aksi: "posting",
      status_sebelum: mutasi.status,
      status_sesudah: sesudah.status,
      data_sebelum: { ...mutasi, detail },
      data_sesudah: { ...sesudah, detail },
      keterangan: "Mutasi stok diposting."
    });

    return sesudah;
  });

  if (!hasil) return gagal(res, "Mutasi stok tidak ditemukan.", 404);
  return sukses(res, "Mutasi stok berhasil diposting.", hasil);
}));

module.exports = router;
