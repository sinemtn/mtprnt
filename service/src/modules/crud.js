const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const asyncHandler = require("../utils/async-handler");
const { sukses, gagal } = require("../utils/response");
const { autentikasi, izin, otorisasi } = require("../middlewares/auth");

const querySchema = z.object({
  halaman: z.coerce.number().int().min(1).default(1),
  batas: z.coerce.number().int().min(1).max(100).default(20),
  cari: z.string().optional()
});

async function relasiTerpakai(relationChecks = [], id) {
  for (const check of relationChecks) {
    const total = await prisma[check.model].count({
      where: {
        [check.field]: id
      }
    });
    if (total > 0) return check.label || check.model;
  }
  return null;
}

async function tandaiHapusPermanen(items, options) {
  if (!options.hardDelete) return items;
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      boleh_hapus_permanen: !(await relasiTerpakai(options.relationChecks, item.id))
    }))
  );
}

function buatCrudRouter(options) {
  const router = express.Router();
  const model = prisma[options.model];
  const skemaBuat = options.skemaBuat || z.object({}).passthrough();
  const skemaUbah = options.skemaUbah || skemaBuat.partial();
  const kolomCari = options.kolomCari || [];
  const softDelete = options.softDelete !== false;
  const roleTulis = options.roleTulis || ["admin"];
  const modulKey = options.modulKey || "master_data";
  const roleLihat = options.roleLihat || ["admin", ...roleTulis];
  const middlewareLihat = options.staticRoleView ? otorisasi(...roleLihat) : izin(modulKey, "view", ...roleLihat);

  router.use(autentikasi);

  router.get("/", middlewareLihat, asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const where = {};

    if (query.cari && kolomCari.length) {
      where.OR = kolomCari.map((kolom) => ({
        [kolom]: { contains: query.cari, mode: "insensitive" }
      }));
    }

    const [total, items] = await Promise.all([
      model.count({ where }),
      model.findMany({
        where,
        skip: (query.halaman - 1) * query.batas,
        take: query.batas,
        orderBy: options.orderBy || { tanggal_dibuat: "desc" }
      })
    ]);
    const itemsDenganAkses = await tandaiHapusPermanen(items, options);

    return sukses(res, "Data berhasil diambil.", {
      items: itemsDenganAkses,
      meta: {
        halaman: query.halaman,
        batas: query.batas,
        total
      }
    });
  }));

  router.get("/:id", middlewareLihat, asyncHandler(async (req, res) => {
    const item = await model.findUnique({ where: { id: req.params.id } });
    if (!item) return gagal(res, "Data tidak ditemukan.", 404);
    return sukses(res, "Data berhasil diambil.", item);
  }));

  router.post("/", izin(modulKey, "create", ...roleTulis), asyncHandler(async (req, res) => {
    const data = skemaBuat.parse(req.body);
    if (options.beforeCreate) await options.beforeCreate(data, req);
    const item = await model.create({ data });
    return sukses(res, "Data berhasil dibuat.", item, 201);
  }));

  router.put("/:id", izin(modulKey, "update", ...roleTulis), asyncHandler(async (req, res) => {
    const data = skemaUbah.parse(req.body);
    if (options.beforeUpdate) {
      const existing = await model.findUnique({ where: { id: req.params.id } });
      if (!existing) return gagal(res, "Data tidak ditemukan.", 404);
      await options.beforeUpdate(data, req, existing);
    }
    const item = await model.update({
      where: { id: req.params.id },
      data
    });
    return sukses(res, "Data berhasil diperbarui.", item);
  }));

  router.delete("/:id/permanent", izin(modulKey, "delete", ...roleTulis), asyncHandler(async (req, res) => {
    if (!options.hardDelete) {
      return gagal(res, "Hapus permanen tidak tersedia untuk modul ini.", 405);
    }

    const item = await model.findUnique({ where: { id: req.params.id } });
    if (!item) return gagal(res, "Data tidak ditemukan.", 404);

    const relasi = await relasiTerpakai(options.relationChecks, req.params.id);
    if (relasi) {
      return gagal(res, `Data tidak bisa dihapus permanen karena sudah dipakai di ${relasi}.`, 409);
    }

    await model.delete({ where: { id: req.params.id } });
    return sukses(res, "Data berhasil dihapus permanen.");
  }));

  router.delete("/:id", izin(modulKey, "delete", ...roleTulis), asyncHandler(async (req, res) => {
    if (!softDelete) {
      await model.delete({ where: { id: req.params.id } });
      return sukses(res, "Data berhasil dihapus.");
    }

    const item = await model.update({
      where: { id: req.params.id },
      data: { aktif: false }
    });
    return sukses(res, "Data berhasil dinonaktifkan.", item);
  }));

  return router;
}

module.exports = { buatCrudRouter };
