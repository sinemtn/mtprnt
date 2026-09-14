const prisma = require("../config/prisma");

async function ambilSlaPendingJam() {
  const setting = await prisma.app_pengaturan.findUnique({ where: { kunci: "sla_pending_komplain" } });
  return Number(setting?.nilai?.pending_setelah_jam || 24);
}

async function terapkanSlaPendingKomplain() {
  const jam = await ambilSlaPendingJam();
  const batas = new Date(Date.now() - jam * 60 * 60 * 1000);
  return prisma.pengaduan.updateMany({
    where: {
      status: "new",
      tanggal_pengaduan: { lte: batas }
    },
    data: { status: "pending" }
  });
}

module.exports = { ambilSlaPendingJam, terapkanSlaPendingKomplain };
