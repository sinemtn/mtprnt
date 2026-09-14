const { z } = require("zod");
const { buatCrudRouter } = require("./crud");
const prisma = require("../config/prisma");

const boolOpsional = z.boolean().optional();
const teksOpsional = z.string().optional().nullable();
const hardDeletePelanggan = {
  hardDelete: true,
  relationChecks: [
    { model: "master_lokasi_pelanggan", field: "pelanggan_id", label: "Lokasi" },
    { model: "master_printer_terpasang", field: "pelanggan_id", label: "Printer Terpasang" },
    { model: "pengaduan", field: "pelanggan_id", label: "Komplain" },
    { model: "surat_tugas", field: "pelanggan_id", label: "Surat Tugas" }
  ]
};
const hardDeleteLokasi = {
  hardDelete: true,
  relationChecks: [
    { model: "master_kontrak", field: "lokasi_pelanggan_id", label: "Kontrak" },
    { model: "master_printer_terpasang", field: "lokasi_pelanggan_id", label: "Printer Terpasang" },
    { model: "pengaduan", field: "lokasi_pelanggan_id", label: "Komplain" },
    { model: "surat_tugas", field: "lokasi_pelanggan_id", label: "Surat Tugas" }
  ]
};
const hardDeletePrinter = {
  hardDelete: true,
  relationChecks: [
    { model: "master_printer_terpasang", field: "printer_id", label: "Printer Terpasang" },
    { model: "stok_printer", field: "printer_id", label: "Stok Printer" },
    { model: "detail_mutasi_stok", field: "printer_id", label: "Mutasi Stok" },
    { model: "pemakaian_barang_surat_tugas", field: "printer_id", label: "Item Surat Tugas" }
  ]
};
const hardDeleteToner = {
  hardDelete: true,
  relationChecks: [
    { model: "stok_toner", field: "toner_id", label: "Stok Toner" },
    { model: "detail_mutasi_stok", field: "toner_id", label: "Mutasi Stok" },
    { model: "pemakaian_barang_surat_tugas", field: "toner_id", label: "Item Surat Tugas" }
  ]
};
const hardDeleteSukuCadang = {
  hardDelete: true,
  relationChecks: [
    { model: "stok_suku_cadang", field: "suku_cadang_id", label: "Stok Sparepart" },
    { model: "detail_mutasi_stok", field: "suku_cadang_id", label: "Mutasi Stok" },
    { model: "pemakaian_barang_surat_tugas", field: "suku_cadang_id", label: "Item Surat Tugas" }
  ]
};
const hardDeleteGudang = {
  hardDelete: true,
  relationChecks: [
    { model: "stok_printer", field: "gudang_id", label: "Stok Printer" },
    { model: "stok_toner", field: "gudang_id", label: "Stok Toner" },
    { model: "stok_suku_cadang", field: "gudang_id", label: "Stok Sparepart" },
    { model: "mutasi_stok", field: "gudang_asal_id", label: "Mutasi Stok" },
    { model: "mutasi_stok", field: "gudang_tujuan_id", label: "Mutasi Stok" },
    { model: "pemakaian_barang_surat_tugas", field: "gudang_id", label: "Item Surat Tugas" }
  ]
};

function pastikanAlamatSingle(data) {
  if (data.jenis_pelanggan === "single" && !String(data.alamat || "").trim()) {
    throw Object.assign(new Error("Alamat wajib diisi untuk pelanggan single site."), { statusCode: 422 });
  }
}

async function pastikanSingleTanpaLokasiAktif(data, existing) {
  if (data.jenis_pelanggan !== "single") return;
  const totalLokasi = await prisma.master_lokasi_pelanggan.count({
    where: {
      pelanggan_id: existing.id,
      aktif: true
    }
  });
  if (totalLokasi > 0) {
    throw Object.assign(new Error("Pelanggan dengan lokasi aktif tidak bisa diubah menjadi single site."), { statusCode: 422 });
  }
}

async function pastikanLokasiUntukMultisite(data) {
  if (!data.pelanggan_id) return;
  const pelanggan = await prisma.master_pelanggan.findUnique({
    where: { id: data.pelanggan_id }
  });
  if (!pelanggan) {
    throw Object.assign(new Error("Pelanggan tidak ditemukan."), { statusCode: 404 });
  }
  if (pelanggan.jenis_pelanggan === "single") {
    throw Object.assign(new Error("Lokasi/cabang hanya boleh dibuat untuk pelanggan multisite."), { statusCode: 422 });
  }
}

async function pastikanPrinterTerpasangCustomer(data) {
  if (!data.pelanggan_id && !data.lokasi_pelanggan_id) {
    throw Object.assign(new Error("Customer wajib diisi untuk printer terpasang."), { statusCode: 422 });
  }

  if (data.lokasi_pelanggan_id) {
    const lokasi = await prisma.master_lokasi_pelanggan.findUnique({
      where: { id: data.lokasi_pelanggan_id },
      include: { master_pelanggan: true }
    });
    if (!lokasi) {
      throw Object.assign(new Error("Cabang customer tidak ditemukan."), { statusCode: 404 });
    }
    if (data.pelanggan_id && lokasi.pelanggan_id !== data.pelanggan_id) {
      throw Object.assign(new Error("Cabang customer tidak sesuai dengan customer yang dipilih."), { statusCode: 422 });
    }
    data.pelanggan_id = lokasi.pelanggan_id;
  }

  const pelanggan = await prisma.master_pelanggan.findUnique({
    where: { id: data.pelanggan_id }
  });
  if (!pelanggan) {
    throw Object.assign(new Error("Customer tidak ditemukan."), { statusCode: 404 });
  }
  if (pelanggan.jenis_pelanggan === "multisite" && !data.lokasi_pelanggan_id) {
    throw Object.assign(new Error("Cabang customer wajib diisi untuk customer multisite."), { statusCode: 422 });
  }
  if (pelanggan.jenis_pelanggan === "single") {
    data.lokasi_pelanggan_id = null;
  }
}

const pelanggan = buatCrudRouter({
  model: "master_pelanggan",
  ...hardDeletePelanggan,
  roleLihat: ["admin", "sales", "sales-admin", "kepala-teknisi", "teknisi", "warehouse"],
  staticRoleView: true,
  kolomCari: ["kode_pelanggan", "nama_pelanggan", "email", "telepon"],
  skemaBuat: z.object({
    kode_pelanggan: z.string().min(1),
    nama_pelanggan: z.string().min(1),
    jenis_pelanggan: z.enum(["single", "multisite"]).default("single"),
    npwp: teksOpsional,
    telepon: teksOpsional,
    email: teksOpsional,
    alamat: teksOpsional,
    aktif: boolOpsional
  }),
  beforeCreate: pastikanAlamatSingle,
  beforeUpdate: async (data, req, existing) => {
    const nextData = {
      ...existing,
      ...data
    };
    pastikanAlamatSingle(nextData);
    await pastikanSingleTanpaLokasiAktif(nextData, existing);
  }
});

const lokasiPelanggan = buatCrudRouter({
  model: "master_lokasi_pelanggan",
  ...hardDeleteLokasi,
  roleLihat: ["admin", "sales", "sales-admin", "kepala-teknisi", "teknisi", "warehouse"],
  staticRoleView: true,
  kolomCari: ["kode_lokasi", "nama_lokasi", "alamat", "kota", "nama_pic"],
  skemaBuat: z.object({
    pelanggan_id: z.string().uuid(),
    kode_lokasi: z.string().min(1),
    nama_lokasi: z.string().min(1),
    alamat: z.string().min(1),
    kota: teksOpsional,
    nama_pic: teksOpsional,
    telepon_pic: teksOpsional,
    email_pic: teksOpsional,
    lokasi_default: boolOpsional,
    aktif: boolOpsional
  }),
  beforeCreate: pastikanLokasiUntukMultisite,
  beforeUpdate: async (data, req, existing) => {
    await pastikanLokasiUntukMultisite({
      ...existing,
      ...data
    });
  }
});

const kontrak = buatCrudRouter({
  model: "master_kontrak",
  kolomCari: ["nomor_kontrak", "jenis_layanan", "status"],
  skemaBuat: z.object({
    lokasi_pelanggan_id: z.string().uuid(),
    nomor_kontrak: z.string().min(1),
    tanggal_mulai: z.string().min(1),
    tanggal_selesai: z.string().min(1),
    jenis_layanan: z.string().min(1),
    sla_respon_jam: z.number().int().min(0).optional(),
    sla_penyelesaian_jam: z.number().int().min(0).optional(),
    status: z.string().optional(),
    keterangan: teksOpsional
  })
});

const toner = buatCrudRouter({
  model: "master_toner",
  ...hardDeleteToner,
  roleLihat: ["admin", "kepala-teknisi", "teknisi", "warehouse"],
  staticRoleView: true,
  kolomCari: ["kode_toner", "nama_toner", "warna", "merek"],
  skemaBuat: z.object({
    kode_toner: z.string().min(1),
    nama_toner: z.string().min(1),
    warna: teksOpsional,
    merek: teksOpsional,
    model_printer_kompatibel: teksOpsional,
    satuan: z.string().optional(),
    aktif: boolOpsional
  })
});

const printer = buatCrudRouter({
  model: "master_printer",
  ...hardDeletePrinter,
  roleLihat: ["admin", "kepala-teknisi", "teknisi", "warehouse"],
  staticRoleView: true,
  kolomCari: ["kode_printer", "merek", "model", "jenis_printer"],
  skemaBuat: z.object({
    kode_printer: z.string().min(1),
    merek: z.string().min(1),
    model: z.string().min(1),
    jenis_printer: teksOpsional,
    keterangan: teksOpsional,
    aktif: boolOpsional
  })
});

const sukuCadang = buatCrudRouter({
  model: "master_suku_cadang",
  ...hardDeleteSukuCadang,
  roleLihat: ["admin", "kepala-teknisi", "teknisi", "warehouse"],
  staticRoleView: true,
  kolomCari: ["kode_suku_cadang", "nama_suku_cadang", "kategori", "merek"],
  skemaBuat: z.object({
    kode_suku_cadang: z.string().min(1),
    nama_suku_cadang: z.string().min(1),
    kategori: teksOpsional,
    merek: teksOpsional,
    model_printer_kompatibel: teksOpsional,
    satuan: z.string().optional(),
    aktif: boolOpsional
  })
});

const printerTerpasang = buatCrudRouter({
  model: "master_printer_terpasang",
  kolomCari: ["nomor_seri", "lokasi_detail"],
  skemaBuat: z.object({
    pelanggan_id: z.string().uuid().optional().nullable(),
    lokasi_pelanggan_id: z.string().uuid().optional().nullable(),
    printer_id: z.string().uuid(),
    nomor_seri: z.string().min(1),
    lokasi_detail: teksOpsional,
    tanggal_instalasi: z.string().optional().nullable(),
    meter_hitam_putih: z.number().int().min(0).optional(),
    meter_warna: z.number().int().min(0).optional(),
    status: z.enum(["aktif", "nonaktif", "dipindahkan", "dikembalikan"]).optional()
  }),
  beforeCreate: pastikanPrinterTerpasangCustomer,
  beforeUpdate: async (data, req, existing) => {
    const nextData = {
      ...existing,
      ...data
    };
    await pastikanPrinterTerpasangCustomer(nextData);
    data.pelanggan_id = nextData.pelanggan_id;
    data.lokasi_pelanggan_id = nextData.lokasi_pelanggan_id;
  }
});

const gudang = buatCrudRouter({
  model: "master_gudang",
  ...hardDeleteGudang,
  kolomCari: ["kode_gudang", "nama_gudang", "alamat"],
  roleLihat: ["admin", "kepala-teknisi", "teknisi", "warehouse"],
  staticRoleView: true,
  roleTulis: ["admin", "warehouse"],
  skemaBuat: z.object({
    kode_gudang: z.string().min(1),
    nama_gudang: z.string().min(1),
    jenis_gudang: z.enum(["utama", "cabang", "teknisi"]),
    teknisi_id: z.string().uuid().optional().nullable(),
    alamat: teksOpsional,
    aktif: boolOpsional
  })
});

module.exports = {
  pelanggan,
  lokasiPelanggan,
  kontrak,
  toner,
  printer,
  sukuCadang,
  printerTerpasang,
  gudang
};
