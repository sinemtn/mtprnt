const { test } = require("node:test");
const assert = require("node:assert/strict");

const base = process.env.TEST_API_BASE;

async function request(token, path, method = "GET", body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, payload: await response.json() };
}

async function good(token, path, method = "GET", body, expected = 200) {
  const result = await request(token, path, method, body);
  assert.equal(result.status, expected, `${method} ${path}: ${result.payload.pesan}`);
  return result.payload.data;
}

async function login(name) {
  const result = await good(null, "/auth/masuk", "POST", { username: name, kata_sandi: process.env.TEST_PASSWORD || "Admin123" });
  return result.token;
}

test("Billing qty, PIC Customer, toner compatibility, and ST v2", { skip: !base && "Set TEST_API_BASE to a disposable API." }, async () => {
  const [admin, head, tech, warehouse] = await Promise.all([login("admin"), login("kepala-teknisi"), login("teknisi"), login("warehouse")]);
  const tag = Date.now().toString(36).toUpperCase();
  const account = await good(admin, "/account", "POST", {
    kode_account: `V2-A-${tag}`, nama_account: "Billing V2", minimum_toner_tahunan: 24,
    nama_pic_billing: "Ani", telepon_pic_billing: "081111", email_pic_billing: "ani@example.com", kena_ppn: true,
    customer_pertama: { kode_customer: `V2-C-${tag}`, nama_customer: "Site V2", alamat: "Jl. Uji", pics: [{ nama_pic: "PIC Awal", email_pic: "awal@example.com" }] }
  }, 201);
  const customer = account.master_customer[0];
  assert.equal(Number((await good(admin, `/account/${account.id}`)).minimum_toner_tahunan), 24);
  assert.equal((await good(admin, `/account/${account.id}`)).kena_ppn, true);
  assert.ok((await good(admin, "/account?cari=Ani")).items.some((row) => row.id === account.id));
  const invalid = await request(admin, `/account/${account.id}`, "PUT", { minimum_toner_tahunan: -1 });
  assert.equal(invalid.status, 422);
  const picPath = `/account/${account.id}/customer/${customer.id}/pic`;
  assert.equal((await good(admin, picPath)).items[0].nama_pic, "PIC Awal");
  const secondCustomer = await good(admin, `/account/${account.id}/customer`, "POST", {
    kode_customer: `V2-C2-${tag}`, nama_customer: "Site Kedua", alamat: "Jl. Kedua",
    pics: [{ nama_pic: "PIC Satu" }, { nama_pic: "PIC Dua", telepon_pic: "08000" }]
  }, 201);
  assert.equal((await good(admin, `/account/${account.id}/customer/${secondCustomer.id}/pic`)).items.length, 2);
  assert.equal((await request(admin, `/account/${account.id}/customer`, "POST", {
    kode_customer: `V2-BAD-${tag}`, nama_customer: "Site Gagal", alamat: "Jl. Gagal", pics: [{ nama_pic: "" }]
  })).status, 422);
  assert.equal((await good(admin, `/account/${account.id}/customer`)).items.some((row) => row.kode_customer === `V2-BAD-${tag}`), false);
  const pic = await good(admin, picPath, "POST", { nama_pic: "Budi", telepon_pic: "082222", email_pic: "budi@example.com" }, 201);
  await good(admin, picPath, "POST", { nama_pic: "Sari" }, 201);
  assert.equal((await good(admin, picPath)).items.length, 3);
  await good(admin, `${picPath}/${pic.id}`, "PUT", { nama_pic: "Budi Baru", telepon_pic: "083333" });
  assert.ok((await good(admin, picPath)).items.some((row) => row.nama_pic === "Budi Baru"));
  await good(admin, `${picPath}/${pic.id}`, "DELETE");
  assert.equal((await good(admin, picPath)).items.length, 2);

  const category = await good(admin, "/printer-kategori", "POST", { kode_kategori: `V2-K-${tag}`, nama_kategori: "Kategori V2" }, 201);
  const model = await good(admin, "/printer-model", "POST", { kategori_id: category.id, kode_model: `V2-M-${tag}`, merek: "V2", nama_model: "Model Uji" }, 201);
  const toner = await good(admin, "/toner", "POST", { kode_toner: `V2-T-${tag}`, nama_toner: "Toner V2", warna: "Hitam", tipe: "Laser" }, 201);
  assert.equal((await good(admin, `/compatibility/model/${model.id}/candidates?cari=V2-T-${tag}`)).items[0].id, toner.id);
  await good(admin, `/compatibility/model/${model.id}`, "POST", { toner_id: toner.id }, 201);
  assert.equal((await good(admin, `/compatibility/model/${model.id}?batas=1`)).meta.total, 1);
  assert.equal((await good(admin, `/compatibility/model/${model.id}/candidates?cari=V2-T-${tag}`)).meta.total, 0);
  assert.equal((await good(admin, `/compatibility/toner/${toner.id}`)).items[0].id, model.id);
  assert.equal((await request(admin, `/compatibility/toner/${toner.id}`, "POST", { model_id: model.id })).status, 409);
  await good(admin, `/compatibility/toner/${toner.id}/${model.id}`, "DELETE");
  assert.equal((await good(admin, `/compatibility/model/${model.id}`)).items.length, 0);
  const pageToners = await Promise.all(Array.from({ length: 12 }, (_, index) => good(admin, "/toner", "POST", {
    kode_toner: `V2-PAGE-${tag}-${index}`, nama_toner: `Toner Halaman ${index}`, warna: "Hitam", tipe: "Laser"
  }, 201)));
  for (const item of pageToners) await good(admin, `/compatibility/model/${model.id}`, "POST", { toner_id: item.id }, 201);
  const firstPage = await good(admin, `/compatibility/model/${model.id}?batas=5&halaman=1`);
  const secondPage = await good(admin, `/compatibility/model/${model.id}?batas=5&halaman=2`);
  assert.equal(firstPage.meta.total, 12);
  assert.equal(firstPage.items.length, 5);
  assert.equal(secondPage.items.length, 5);
  assert.notEqual(firstPage.items[0].id, secondPage.items[0].id);
  assert.equal((await good(admin, `/compatibility/model/${model.id}?cari=V2-PAGE-${tag}-0`)).meta.total, 1);
  assert.equal((await good(admin, `/compatibility/toner/${toner.id}/candidates?cari=V2-M-${tag}`)).items[0].id, model.id);

  const depot = await good(admin, "/gudang", "POST", { kode_gudang: `V2-G-${tag}`, nama_gudang: "Gudang V2", jenis_gudang: "utama" }, 201);
  const unit = await good(admin, "/printer", "POST", { mp_no: `V2-P-${tag}`, model_id: model.id, gudang_id: depot.id, alasan: "Fixture ST v2" }, 201);
  const secondUnit = await good(admin, "/printer", "POST", { mp_no: `V2-P2-${tag}`, model_id: model.id, gudang_id: depot.id, alasan: "Fixture ST v2" }, 201);
  const excludedUnit = await good(admin, "/printer", "POST", { mp_no: `V2-P3-${tag}`, model_id: model.id, gudang_id: depot.id, alasan: "Fixture ST v2" }, 201);
  const users = (await good(admin, "/pengguna?batas=100")).items;
  const technician = users.find((row) => row.user_id === "teknisi" && (row.active ?? row.aktif));
  const store = users.find((row) => row.user_id === "warehouse" && (row.active ?? row.aktif));
  assert.ok(technician && store);

  const emptyStockSt = await good(head, "/surat-tugas", "POST", {
    jenis_tugas: "kirim_toner", account_id: account.id, customer_id: customer.id,
    gudang_id: depot.id, pic_teknisi_id: technician.id, printer: []
  }, 201);
  const noStock = await request(tech, `/surat-tugas/${emptyStockSt.id}/pemakaian`, "POST", {
    jenis_barang: "toner", toner_id: toner.id, gudang_id: depot.id, jumlah_pakai: 1
  });
  assert.equal(noStock.status, 422);
  assert.match(noStock.payload.pesan, /Stok Toner V2.*Gudang V2.*Diminta 1.*dapat dialokasikan 0/);
  await good(head, `/surat-tugas/${emptyStockSt.id}/cancel`, "POST", {});

  const outbound = await good(head, "/surat-tugas", "POST", {
    jenis_tugas: "kirim_kontrak", mode: "baru", account_id: account.id, customer_id: customer.id,
    gudang_id: depot.id, pic_teknisi_id: technician.id, printer: [{ printer_id: unit.id, mp_no: unit.mp_no }, { printer_id: secondUnit.id, mp_no: secondUnit.mp_no }]
  }, 201);
  assert.equal(outbound.status, "progress");
  assert.equal(outbound.alur_st_baru, true);
  const line = outbound.surat_tugas_printer[0];
  assert.equal((await request(tech, `/surat-tugas/${outbound.id}/printer/${line.id}/hasil`, "PUT", { hasil: "Diterima" })).status, 409);
  assert.equal((await request(tech, `/surat-tugas/${outbound.id}/ready-to-print`, "POST", {})).status, 422);
  await good(tech, `/surat-tugas/${outbound.id}/mulai-kerja`, "POST", {});
  await good(tech, `/surat-tugas/${outbound.id}/printer/${line.id}/hasil`, "PUT", { hasil: "Pekerjaan lain" });
  assert.equal((await good(admin, `/surat-tugas/${outbound.id}`)).surat_tugas_printer.find((row) => row.id === line.id).konfirmasi_serah_pada, null);
  await good(tech, `/surat-tugas/${outbound.id}/printer/${line.id}/hasil`, "PUT", { hasil: "Diserahkan", alasan: "Unit pertama" });
  const partialOutbound = await good(admin, `/surat-tugas/${outbound.id}`);
  assert.equal(partialOutbound.surat_tugas_printer.filter((row) => row.konfirmasi_serah_pada).length, 1);
  assert.equal(partialOutbound.konfirmasi_serah_pada, null);
  assert.equal((await request(tech, `/surat-tugas/${outbound.id}/selesai`, "POST", {})).status, 409);
  const otherLine = outbound.surat_tugas_printer.find((row) => row.id !== line.id);
  await good(tech, `/surat-tugas/${outbound.id}/printer/${otherLine.id}/hasil`, "PUT", { hasil: "Diserahkan" });
  assert.equal((await request(tech, `/surat-tugas/${outbound.id}/printer/${line.id}/hasil`, "PUT", { hasil: "Lainnya" })).status, 409);
  assert.equal((await good(tech, `/surat-tugas/${outbound.id}/selesai`, "POST", { hasil: "Terkirim" })).status, "technician_completed");
  assert.equal((await request(tech, `/surat-tugas/${outbound.id}/printer/${line.id}/hasil`, "PUT", { hasil: "Diubah" })).status, 409);
  const finished = await good(admin, `/surat-tugas/${outbound.id}`);
  assert.ok(finished.konfirmasi_keluar_pada && finished.surat_tugas_printer.every((row) => row.konfirmasi_keluar_pada));
  assert.equal(finished.validasi_warehouse_pada, null);
  assert.equal((await good(admin, `/printer/${unit.id}`)).lokasi_jenis, "transit");
  assert.equal((await good(admin, `/printer/${secondUnit.id}`)).lokasi_jenis, "transit");
  assert.ok((await good(admin, `/audit-barang?jenis_barang=printer&barang_id=${unit.id}&event=keluar_gudang_otomatis`)).items.length > 0);
  assert.equal((await request(tech, `/surat-tugas/${outbound.id}/selesai`, "POST", {})).status, 409);
  assert.equal((await request(warehouse, `/surat-tugas/${outbound.id}/keluar`, "POST", {})).status, 409);
  await good(head, `/surat-tugas/${outbound.id}/resolve`, "POST", {});
  assert.equal((await good(admin, `/printer/${unit.id}`)).lokasi_jenis, "customer");
  assert.equal((await good(admin, `/printer/${secondUnit.id}`)).lokasi_jenis, "customer");

  await good(warehouse, "/stok/mutasi", "POST", {
    jenis_mutasi: "masuk", gudang_tujuan_id: depot.id, langsung_posting: true,
    detail: [{ jenis_barang: "toner", toner_id: toner.id, jumlah: 3 }]
  }, 201);
  const tonerSt = await good(head, "/surat-tugas", "POST", {
    jenis_tugas: "kirim_toner", account_id: account.id, customer_id: customer.id,
    gudang_id: depot.id, pic_teknisi_id: technician.id, printer: []
  }, 201);
  await good(tech, `/surat-tugas/${tonerSt.id}/pemakaian`, "POST", {
    gudang_id: depot.id, jenis_barang: "toner", toner_id: toner.id, jumlah_pakai: 2
  }, 201);
  await good(tech, `/surat-tugas/${tonerSt.id}/mulai-kerja`, "POST", {});
  await good(tech, `/surat-tugas/${tonerSt.id}`, "PUT", { hasil: "Diserahkan", keterangan: "Diterima pelanggan" });
  assert.ok((await good(admin, `/surat-tugas/${tonerSt.id}`)).konfirmasi_serah_pada);
  assert.equal((await good(tech, `/surat-tugas/${tonerSt.id}/selesai`, "POST", { hasil: "Diserahkan" })).status, "technician_completed");
  assert.equal((await good(admin, `/surat-tugas/${tonerSt.id}`)).tindakan, "Diterima pelanggan");
  assert.equal((await request(head, `/surat-tugas/${tonerSt.id}/resolve`, "POST", {})).status, 409);
  assert.equal((await good(warehouse, `/surat-tugas/${tonerSt.id}/keluar`, "POST", {})).status, "warehouse_validated");
  assert.equal((await request(warehouse, `/surat-tugas/${tonerSt.id}/keluar`, "POST", {})).status, 409);
  await good(head, `/surat-tugas/${tonerSt.id}/resolve`, "POST", {});
  const stock = await good(admin, "/stok");
  const tonerBalance = stock.toner.find((row) => row.master_toner?.id === toner.id && row.master_gudang?.id === depot.id);
  assert.equal(Number(tonerBalance.jumlah_tersedia), 1);
  assert.equal(Number(tonerBalance.jumlah_dicadangkan), 0);

  const inbound = await good(warehouse, "/surat-tugas", "POST", {
    jenis_tugas: "terima_return", account_id: account.id, customer_id: customer.id,
    gudang_id: depot.id, pic_warehouse_id: store.id, printer: [{ printer_id: unit.id, mp_no: unit.mp_no }, { printer_id: secondUnit.id, mp_no: secondUnit.mp_no }]
  }, 201);
  assert.equal(inbound.status, "progress");
  assert.equal((await request(warehouse, `/surat-tugas/${inbound.id}/terima`, "POST", {})).status, 409);
  await good(warehouse, `/surat-tugas/${inbound.id}/mulai-kerja`, "POST", {});
  await good(warehouse, `/surat-tugas/${inbound.id}/printer/${inbound.surat_tugas_printer[0].id}/hasil`, "PUT", { hasil: "Diterima", alasan: "Penerimaan pertama" });
  const partialInbound = await good(admin, `/surat-tugas/${inbound.id}`);
  assert.equal(partialInbound.surat_tugas_printer.filter((row) => row.konfirmasi_terima_pada).length, 1);
  assert.equal(partialInbound.konfirmasi_terima_pada, null);
  assert.equal((await request(warehouse, `/surat-tugas/${inbound.id}/selesai`, "POST", {})).status, 409);
  await good(warehouse, `/surat-tugas/${inbound.id}/printer/${inbound.surat_tugas_printer[1].id}/hasil`, "PUT", { hasil: "Diterima" });
  assert.equal((await good(warehouse, `/surat-tugas/${inbound.id}/selesai`, "POST", {})).status, "technician_completed");
  assert.equal((await request(head, `/surat-tugas/${inbound.id}/resolve`, "POST", {})).status, 403);
  assert.equal((await good(warehouse, `/surat-tugas/${inbound.id}/resolve`, "POST", {})).status, "solved");
  assert.equal((await good(admin, `/printer/${unit.id}`)).kondisi, "checking");
  assert.equal((await good(admin, `/printer/${secondUnit.id}`)).kondisi, "checking");
  assert.ok((await good(admin, `/audit-barang?jenis_barang=printer&barang_id=${unit.id}&event=terima_gudang`)).items.length > 0);

  const qc = await good(head, "/surat-tugas", "POST", {
    jenis_tugas: "qc", pic_teknisi_id: technician.id,
    printer: [{ printer_id: unit.id, mp_no: unit.mp_no }, { printer_id: secondUnit.id, mp_no: secondUnit.mp_no }]
  }, 201);
  await good(tech, `/surat-tugas/${qc.id}/mulai-kerja`, "POST", {});
  await good(tech, `/surat-tugas/${qc.id}/printer/${qc.surat_tugas_printer[0].id}/hasil`, "PUT", { hasil: "Lulus QC", kondisi_hasil: "ready" });
  assert.equal((await request(tech, `/surat-tugas/${qc.id}/selesai`, "POST", {})).status, 409);
  await good(tech, `/surat-tugas/${qc.id}/printer/${qc.surat_tugas_printer[1].id}/hasil`, "PUT", { hasil: "Perlu repair", kondisi_hasil: "need_repair", alasan: "Roller aus" });
  await good(tech, `/surat-tugas/${qc.id}/selesai`, "POST", {});
  await good(head, `/surat-tugas/${qc.id}/resolve`, "POST", {});
  assert.equal((await good(admin, `/printer/${unit.id}`)).kondisi, "ready");
  assert.equal((await good(admin, `/printer/${secondUnit.id}`)).kondisi, "need_repair");

  const repair = await good(head, "/surat-tugas", "POST", {
    jenis_tugas: "repair", pic_teknisi_id: technician.id, printer: [{ printer_id: secondUnit.id, mp_no: secondUnit.mp_no }]
  }, 201);
  await good(tech, `/surat-tugas/${repair.id}/mulai-kerja`, "POST", {});
  await good(tech, `/surat-tugas/${repair.id}/printer/${repair.surat_tugas_printer[0].id}/hasil`, "PUT", { hasil: "Perlu perbaikan lanjutan", kondisi_hasil: "need_repair", alasan: "Roller aus" });
  await good(tech, `/surat-tugas/${repair.id}/printer/${repair.surat_tugas_printer[0].id}/hasil`, "PUT", { hasil: "Selesai diperbaiki", kondisi_hasil: null, alasan: "Roller diganti" });
  assert.equal((await good(admin, `/surat-tugas/${repair.id}`)).surat_tugas_printer[0].kondisi_hasil, null);
  await good(tech, `/surat-tugas/${repair.id}/selesai`, "POST", {});
  await good(head, `/surat-tugas/${repair.id}/resolve`, "POST", {});
  assert.equal((await good(admin, `/printer/${secondUnit.id}`)).kondisi, "checking");

  const exceptionSt = await good(head, "/surat-tugas", "POST", {
    jenis_tugas: "kirim_event", account_id: account.id, customer_id: customer.id,
    gudang_id: depot.id, pic_teknisi_id: technician.id, printer: [{ printer_id: excludedUnit.id, mp_no: excludedUnit.mp_no }]
  }, 201);
  await good(tech, `/surat-tugas/${exceptionSt.id}/mulai-kerja`, "POST", {});
  await good(tech, `/surat-tugas/${exceptionSt.id}/printer/${exceptionSt.surat_tugas_printer[0].id}/hasil`, "PUT", { hasil: "Tertunda", alasan: "Lokasi tujuan belum siap" });
  assert.equal((await request(tech, `/surat-tugas/${exceptionSt.id}/selesai`, "POST", {})).status, 409);
  assert.equal((await good(admin, `/printer/${excludedUnit.id}`)).lokasi_jenis, "gudang");
  await good(head, `/surat-tugas/${exceptionSt.id}/printer/${exceptionSt.surat_tugas_printer[0].id}/pengecualian/setujui`, "POST", {});
  await good(tech, `/surat-tugas/${exceptionSt.id}/selesai`, "POST", {});
  await good(head, `/surat-tugas/${exceptionSt.id}/resolve`, "POST", {});
  assert.equal((await good(admin, `/printer/${excludedUnit.id}`)).lokasi_jenis, "gudang");
  assert.equal((await good(admin, `/surat-tugas/${exceptionSt.id}`)).surat_tugas_printer[0].konfirmasi_serah_pada, null);
});
