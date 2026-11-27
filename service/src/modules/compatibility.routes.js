const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const asyncHandler = require("../utils/async-handler");
const { sukses, gagal } = require("../utils/response");
const { autentikasi, otorisasi, izin } = require("../middlewares/auth");

const router = express.Router();
router.use(autentikasi);
const lihat = otorisasi("sales", "sales-admin", "kepala-teknisi", "teknisi", "warehouse");

function register(side, sourceModel, targetModel, sourceField, targetField, targetParam) {
  const querySchema = z.object({
    cari: z.string().trim().max(100).default(""),
    halaman: z.coerce.number().int().min(1).default(1),
    batas: z.coerce.number().int().min(1).max(50).default(20)
  });
  const searchFields = side === "model" ? ["kode_toner", "nama_toner", "warna"] : ["kode_model", "nama_model", "merek"];
  const searchWhere = (cari) => ({ OR: searchFields.map((field) => ({ [field]: { contains: cari, mode: "insensitive" } })) });

  router.get(`/${side}/:id`, lihat, asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    if (!await prisma[sourceModel].count({ where: { id } })) return gagal(res, "Master tidak ditemukan.", 404);
    const query = querySchema.parse(req.query);
    const where = { [sourceField]: id, ...(query.cari ? { [targetModel]: { is: searchWhere(query.cari) } } : {}) };
    const [total, links] = await Promise.all([
      prisma.printer_model_toner_kompatibel.count({ where }),
      prisma.printer_model_toner_kompatibel.findMany({
        where, include: { [targetModel]: true }, orderBy: [{ tanggal_dibuat: "asc" }, { [targetField]: "asc" }],
        skip: (query.halaman - 1) * query.batas, take: query.batas
      })
    ]);
    return sukses(res, "Daftar kompatibilitas berhasil diambil.", { items: links.map((link) => link[targetModel]), meta: { total, halaman: query.halaman, batas: query.batas } });
  }));

  router.get(`/${side}/:id/candidates`, lihat, asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    if (!await prisma[sourceModel].count({ where: { id } })) return gagal(res, "Master tidak ditemukan.", 404);
    const query = querySchema.parse(req.query);
    if (query.cari.length < 2) return sukses(res, "Ketik minimal dua karakter.", { items: [], meta: { total: 0, halaman: query.halaman, batas: query.batas } });
    const relation = side === "model" ? "model_kompatibel" : "toner_kompatibel";
    const where = { aktif: true, ...searchWhere(query.cari), [relation]: { none: { [sourceField]: id } } };
    const [total, items] = await Promise.all([
      prisma[targetModel].count({ where }),
      prisma[targetModel].findMany({ where, orderBy: side === "model" ? { kode_toner: "asc" } : { kode_model: "asc" }, skip: (query.halaman - 1) * query.batas, take: query.batas })
    ]);
    return sukses(res, "Kandidat kompatibilitas berhasil diambil.", { items, meta: { total, halaman: query.halaman, batas: query.batas } });
  }));

  router.post(`/${side}/:id`, izin("master_data", "update", "admin"), asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const targetId = z.string().uuid().parse(req.body?.[targetParam]);
    const [source, target] = await Promise.all([
      prisma[sourceModel].findUnique({ where: { id } }),
      prisma[targetModel].findUnique({ where: { id: targetId } })
    ]);
    if (!source || !target) return gagal(res, "Model atau toner tidak ditemukan.", 404);
    if (!source.aktif || !target.aktif) return gagal(res, "Model dan toner harus aktif untuk ditautkan.", 422);
    const pair = side === "model" ? { model_id: id, toner_id: targetId } : { model_id: targetId, toner_id: id };
    const existing = await prisma.printer_model_toner_kompatibel.findUnique({ where: { model_id_toner_id: pair } });
    if (existing) return gagal(res, "Pasangan kompatibilitas sudah ada.", 409);
    const link = await prisma.printer_model_toner_kompatibel.create({ data: pair });
    return sukses(res, "Kompatibilitas ditambahkan.", link, 201);
  }));

  router.delete(`/${side}/:id/:targetId`, izin("master_data", "update", "admin"), asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const targetId = z.string().uuid().parse(req.params.targetId);
    const pair = side === "model" ? { model_id: id, toner_id: targetId } : { model_id: targetId, toner_id: id };
    const removed = await prisma.printer_model_toner_kompatibel.deleteMany({ where: pair });
    if (!removed.count) return gagal(res, "Pasangan kompatibilitas tidak ditemukan.", 404);
    return sukses(res, "Kompatibilitas dilepas.");
  }));
}

register("model", "master_printer_model", "master_toner", "model_id", "toner_id", "toner_id");
register("toner", "master_toner", "master_printer_model", "toner_id", "model_id", "model_id");

module.exports = router;
