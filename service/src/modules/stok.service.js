const { Prisma } = require("@prisma/client");

const tabelStok = {
  toner: {
    tabel: "stok_toner",
    kolomItem: "toner_id"
  },
  printer: {
    tabel: "stok_printer",
    kolomItem: "printer_id"
  },
  suku_cadang: {
    tabel: "stok_suku_cadang",
    kolomItem: "suku_cadang_id"
  }
};

function ambilItemId(line) {
  if (line.jenis_barang === "toner") return line.toner_id;
  if (line.jenis_barang === "printer") return line.printer_id;
  return line.suku_cadang_id;
}

async function tambahStok(tx, jenis_barang, gudang_id, item_id, jumlah) {
  const cfg = tabelStok[jenis_barang];
  await tx.$executeRawUnsafe(
    `INSERT INTO ${cfg.tabel} (gudang_id, ${cfg.kolomItem}, jumlah_tersedia)
     VALUES ($1::uuid, $2::uuid, $3::numeric)
     ON CONFLICT (gudang_id, ${cfg.kolomItem})
     DO UPDATE SET
       jumlah_tersedia = ${cfg.tabel}.jumlah_tersedia + EXCLUDED.jumlah_tersedia,
       tanggal_diperbarui = now()`,
    gudang_id,
    item_id,
    new Prisma.Decimal(jumlah)
  );
}

async function kurangiStok(tx, jenis_barang, gudang_id, item_id, jumlah) {
  const cfg = tabelStok[jenis_barang];
  const hasil = await tx.$queryRawUnsafe(
    `UPDATE ${cfg.tabel}
     SET jumlah_tersedia = jumlah_tersedia - $3::numeric,
         tanggal_diperbarui = now()
     WHERE gudang_id = $1::uuid
       AND ${cfg.kolomItem} = $2::uuid
       AND jumlah_tersedia >= $3::numeric
     RETURNING id`,
    gudang_id,
    item_id,
    new Prisma.Decimal(jumlah)
  );

  if (!hasil.length) {
    throw Object.assign(new Error("Stok tidak cukup."), { statusCode: 409 });
  }
}

async function terapkanMutasi(tx, mutasi, lines) {
  for (const line of lines) {
    const itemId = ambilItemId(line);
    if (mutasi.jenis_mutasi === "masuk") {
      await tambahStok(tx, line.jenis_barang, mutasi.gudang_tujuan_id, itemId, line.jumlah);
    }

    if (mutasi.jenis_mutasi === "keluar" || mutasi.jenis_mutasi === "pemakaian") {
      await kurangiStok(tx, line.jenis_barang, mutasi.gudang_asal_id, itemId, line.jumlah);
    }

    if (mutasi.jenis_mutasi === "transfer") {
      await kurangiStok(tx, line.jenis_barang, mutasi.gudang_asal_id, itemId, line.jumlah);
      await tambahStok(tx, line.jenis_barang, mutasi.gudang_tujuan_id, itemId, line.jumlah);
    }

    if (mutasi.jenis_mutasi === "penyesuaian") {
      if (Number(line.jumlah) >= 0) {
        await tambahStok(tx, line.jenis_barang, mutasi.gudang_tujuan_id || mutasi.gudang_asal_id, itemId, line.jumlah);
      } else {
        await kurangiStok(tx, line.jenis_barang, mutasi.gudang_asal_id || mutasi.gudang_tujuan_id, itemId, Math.abs(Number(line.jumlah)));
      }
    }
  }
}

module.exports = { ambilItemId, tambahStok, kurangiStok, terapkanMutasi };
