const express = require("express");
const { z } = require("zod");
const prisma = require("../config/prisma");
const asyncHandler = require("../utils/async-handler");
const { sukses } = require("../utils/response");
const { autentikasi, izin } = require("../middlewares/auth");

const router = express.Router();

router.use(autentikasi);

const querySchema = z.object({
  tanggal_mulai: z.string().optional(),
  tanggal_selesai: z.string().optional(),
  user: z.string().optional(),
  nomor_pengaduan: z.string().optional(),
  nomor_surat_tugas: z.string().optional(),
  batas: z.coerce.number().int().min(1).max(200).default(100)
});

const eventWorkflow = [
  { kode: "A01", dokumen: "pengaduan", aksi: "buat", nama: "Komplain Baru Dibuat" },
  { kode: "A02", dokumen: "pengaduan", aksi: "ubah", nama: "Komplain Diperbarui" },
  { kode: "A03", dokumen: "pengaduan", aksi: "ubah_status", nama: "Status Komplain Berubah" },
  { kode: "A04", dokumen: "pengaduan", aksi: "resolve", nama: "Komplain Diselesaikan" },
  { kode: "A05", dokumen: "pengaduan", aksi: "batalkan", nama: "Komplain Dibatalkan" },
  { kode: "B01", dokumen: "surat_tugas", aksi: "buat", nama: "Surat Tugas Baru Dibuat" },
  { kode: "B02", dokumen: "surat_tugas", aksi: "assign_teknisi", nama: "Teknisi Ditugaskan" },
  { kode: "B03", dokumen: "surat_tugas", aksi: "start", nama: "Surat Tugas Dimulai" },
  { kode: "B04", dokumen: "surat_tugas", aksi: "tambah_item", nama: "Item Surat Tugas Ditambahkan" },
  { kode: "B05", dokumen: "surat_tugas", aksi: "hapus_item", nama: "Item Surat Tugas Dihapus" },
  { kode: "B06", dokumen: "surat_tugas", aksi: "ready_to_print", nama: "Surat Tugas Siap Print" },
  { kode: "B07", dokumen: "surat_tugas", aksi: "selesai_teknisi", nama: "Pekerjaan Teknisi Selesai" },
  { kode: "B08", dokumen: "surat_tugas", aksi: "validasi_warehouse", nama: "Validasi Warehouse" },
  { kode: "B09", dokumen: "surat_tugas", aksi: "resolve", nama: "Validasi Kepala Teknisi" },
  { kode: "B10", dokumen: "surat_tugas", aksi: "batalkan", nama: "Surat Tugas Dibatalkan" }
];

function eventDariAudit(item) {
  const event = eventWorkflow.find((row) => row.dokumen === item.jenis_dokumen && row.aksi === item.aksi);
  return event || {
    kode: "Z99",
    nama: item.aksi || "Event Lain"
  };
}

function formatAudit(item) {
  const event = eventDariAudit(item);
  const statusText = item.status_sesudah && item.status_sebelum
    ? ` (${item.status_sebelum} -> ${item.status_sesudah})`
    : item.status_sesudah
      ? ` (${item.status_sesudah})`
      : "";
  return {
    ...item,
    event_kode: event.kode,
    event_nama: event.nama,
    event_label: event.nama,
    tabel_keterangan: `${item.jenis_dokumen} ${item.nomor_dokumen}: ${item.keterangan || event.nama}${statusText}`
  };
}

router.get("/", izin("audit_trail", "view", "sales-admin", "kepala-teknisi", "warehouse"), asyncHandler(async (req, res) => {
  const query = querySchema.parse(req.query);
  const where = {};
  const OR = [];

  const adaTanggal = Boolean(query.tanggal_mulai || query.tanggal_selesai);
  const adaTarget = Boolean(query.user || query.nomor_pengaduan || query.nomor_surat_tugas);
  if (!adaTanggal || !adaTarget) {
    return sukses(res, "Lengkapi filter tanggal dan user/surat tugas/komplain untuk menampilkan audit.", []);
  }

  if (query.tanggal_mulai || query.tanggal_selesai) {
    where.tanggal_audit = {};
    if (query.tanggal_mulai) where.tanggal_audit.gte = new Date(`${query.tanggal_mulai}T00:00:00`);
    if (query.tanggal_selesai) where.tanggal_audit.lte = new Date(`${query.tanggal_selesai}T23:59:59.999`);
  }

  if (query.nomor_pengaduan) {
    OR.push({
      jenis_dokumen: "pengaduan",
      nomor_dokumen: { contains: query.nomor_pengaduan, mode: "insensitive" }
    });
  }

  if (query.nomor_surat_tugas) {
    OR.push({
      jenis_dokumen: "surat_tugas",
      nomor_dokumen: { contains: query.nomor_surat_tugas, mode: "insensitive" }
    });
  }

  if (OR.length) where.OR = OR;
  if (query.user) {
    where.nama_pengguna = { contains: query.user, mode: "insensitive" };
  }

  const items = await prisma.riwayat_audit.findMany({
    where,
    orderBy: { tanggal_audit: "desc" },
    take: query.batas
  });

  return sukses(res, "Riwayat audit berhasil diambil.", items.map(formatAudit));
}));

router.get("/pengaduan/:nomor_pengaduan", izin("audit_trail", "view", "sales-admin", "kepala-teknisi", "warehouse"), asyncHandler(async (req, res) => {
  const items = await prisma.riwayat_audit.findMany({
    where: {
      jenis_dokumen: "pengaduan",
      nomor_dokumen: req.params.nomor_pengaduan
    },
    orderBy: { tanggal_audit: "asc" }
  });

  return sukses(res, "Riwayat audit pengaduan berhasil diambil.", items.map(formatAudit));
}));

router.get("/surat-tugas/:nomor_surat_tugas", izin("audit_trail", "view", "sales-admin", "kepala-teknisi", "warehouse"), asyncHandler(async (req, res) => {
  const items = await prisma.riwayat_audit.findMany({
    where: {
      jenis_dokumen: "surat_tugas",
      nomor_dokumen: req.params.nomor_surat_tugas
    },
    orderBy: { tanggal_audit: "asc" }
  });

  return sukses(res, "Riwayat audit surat tugas berhasil diambil.", items.map(formatAudit));
}));

module.exports = router;
