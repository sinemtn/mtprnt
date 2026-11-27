const { PrismaClient } = require("@prisma/client");

const databaseUrl = process.env.DATABASE_URL || "";
const databaseName = (() => {
  try { return decodeURIComponent(new URL(databaseUrl).pathname.slice(1)); }
  catch { return ""; }
})();

if (!/^multiprint_new_service_test(?:_|$)/.test(databaseName)) {
  console.error("Seed demo hanya boleh dijalankan pada database preview multiprint_new_service_test.");
  process.exit(1);
}

const prisma = new PrismaClient();
const today = new Date();

async function createIfMissing(tx, model, key, value, data) {
  const existing = await tx[model].findUnique({ where: { [key]: value } });
  return existing || tx[model].create({ data: { [key]: value, ...data } });
}

async function main() {
  await prisma.$transaction(async (tx) => {
    await createIfMissing(tx, "master_account", "kode_account", "DEMO-ACCOUNT", {
      nama_account: "PT Nusantara Demo",
      alamat_penagihan: "Jl. Sudirman No. 10, Jakarta",
      telepon: "021-5550100",
      minimum_toner_tahunan: 120,
      kena_ppn: true
    });
    await createIfMissing(tx, "master_account", "kode_account", "DEMO-MANDIRI", {
      nama_account: "CV Mandiri Demo",
      alamat_penagihan: "Jl. Merdeka No. 5, Surabaya",
      minimum_toner_tahunan: 0
    });
    for (const customer of [
      { kode_customer: "DEMO-JAKARTA", account_id: "DEMO-ACCOUNT", nama_customer: "Nusantara - Jakarta", alamat: "Jl. Sudirman No. 10, Jakarta" },
      { kode_customer: "DEMO-BANDUNG", account_id: "DEMO-ACCOUNT", nama_customer: "Nusantara - Bandung", alamat: "Jl. Asia Afrika No. 20, Bandung" },
      { kode_customer: "DEMO-SURABAYA", account_id: "DEMO-MANDIRI", nama_customer: "Mandiri - Surabaya", alamat: "Jl. Merdeka No. 5, Surabaya" }
    ]) {
      await createIfMissing(tx, "master_customer", "kode_customer", customer.kode_customer, customer);
    }

    await createIfMissing(tx, "master_gudang", "kode_gudang", "DEMO-GDG-UTAMA", {
      nama_gudang: "Gudang Demo Utama", jenis_gudang: "utama", alamat: "Jakarta"
    });
    await createIfMissing(tx, "master_gudang", "kode_gudang", "DEMO-GDG-CABANG", {
      nama_gudang: "Gudang Demo Cabang", jenis_gudang: "cabang", alamat: "Bandung"
    });

    await createIfMissing(tx, "master_printer_kategori", "kode_kategori", "DEMO-MONO", { nama_kategori: "Monokrom Demo" });
    await createIfMissing(tx, "master_printer_kategori", "kode_kategori", "DEMO-WARNA", { nama_kategori: "Warna Demo" });
    await createIfMissing(tx, "master_printer_model", "kode_model", "DEMO-M404", {
      kategori_id: "DEMO-MONO", merek: "HP", nama_model: "LaserJet Pro M404 Demo"
    });
    await createIfMissing(tx, "master_printer_model", "kode_model", "DEMO-M479", {
      kategori_id: "DEMO-WARNA", merek: "HP", nama_model: "Color LaserJet Pro M479 Demo"
    });

    for (const [mp_no, model_id, gudang_id] of [
      ["DEMO-M404-001", "DEMO-M404", "DEMO-GDG-UTAMA"],
      ["DEMO-M404-002", "DEMO-M404", "DEMO-GDG-UTAMA"],
      ["DEMO-M404-003", "DEMO-M404", "DEMO-GDG-CABANG"],
      ["DEMO-M479-001", "DEMO-M479", "DEMO-GDG-UTAMA"],
      ["DEMO-M479-002", "DEMO-M479", "DEMO-GDG-CABANG"]
    ]) {
      await createIfMissing(tx, "master_printer", "mp_no", mp_no, {
        serial_number: `SN-${mp_no}`,
        model_id, gudang_id, status: "available", lokasi_jenis: "gudang",
        penempatan: "none", kondisi: "ready", tanggal_pembelian: today,
        keterangan: "Data demo untuk alur Tiket dan Surat Tugas"
      });
    }

    await createIfMissing(tx, "master_kontrak", "nomor_kontrak", "DEMO-KONTRAK-001", {
      customer_id: "DEMO-JAKARTA", tanggal_mulai: today,
      jenis_layanan: "Sewa printer demo", status: "aktif"
    });
    await createIfMissing(tx, "master_printer", "mp_no", "DEMO-M404-TERPASANG", {
      serial_number: "SN-DEMO-M404-TERPASANG", model_id: "DEMO-M404",
      account_id: "DEMO-ACCOUNT", customer_id: "DEMO-JAKARTA",
      kontrak_id: "DEMO-KONTRAK-001", status: "installed", lokasi_jenis: "customer",
      penempatan: "kontrak", kondisi: "ready", tanggal_pembelian: today,
      tanggal_instalasi: today,
      keterangan: "Data demo unit terpasang untuk servis, back-up, dan return"
    });

    await createIfMissing(tx, "master_toner", "kode_toner", "DEMO-TONER-404", {
      nama_toner: "Toner HP 404 Demo", warna: "Black", tipe: "Laser"
    });
    await createIfMissing(tx, "master_toner", "kode_toner", "DEMO-TONER-479", {
      nama_toner: "Toner HP 479 Demo", warna: "Cyan", tipe: "Laser"
    });
    await createIfMissing(tx, "master_suku_cadang", "kode_suku_cadang", "DEMO-FUSER-404", {
      nama_suku_cadang: "Fuser HP M404 Demo"
    });
    for (const [toner_id, jumlah_tersedia] of [["DEMO-TONER-404", 20], ["DEMO-TONER-479", 12]]) {
      const existing = await tx.stok_toner.findFirst({ where: { gudang_id: "DEMO-GDG-UTAMA", toner_id } });
      if (!existing) await tx.stok_toner.create({ data: { gudang_id: "DEMO-GDG-UTAMA", toner_id, jumlah_tersedia } });
    }
    const spare = await tx.stok_suku_cadang.findFirst({ where: { gudang_id: "DEMO-GDG-UTAMA", suku_cadang_id: "DEMO-FUSER-404" } });
    if (!spare) await tx.stok_suku_cadang.create({ data: { gudang_id: "DEMO-GDG-UTAMA", suku_cadang_id: "DEMO-FUSER-404", jumlah_tersedia: 8 } });
  });
  console.log(`Data demo tersedia di ${databaseName}; data lama tidak diubah.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
