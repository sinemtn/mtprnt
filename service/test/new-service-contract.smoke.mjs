import assert from "node:assert/strict";

const base = process.env.SMOKE_API_URL || "http://localhost:5002/api";
const tag = `SMK${Date.now().toString(36).toUpperCase()}`;

async function call(path, token, method = "GET", body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(json)}`);
  return json.data;
}

async function login(username) {
  return call("/auth/masuk", null, "POST", { username, kata_sandi: "Admin123" });
}

const [admin, sales, salesAdmin, head, tech, warehouse] = await Promise.all([
  login("admin"), login("sales"), login("sales-admin"), login("kepala-teknisi"), login("teknisi"), login("warehouse")
]);

const account = await call("/account", admin.token, "POST", {
  kode_account: tag, nama_account: `Smoke ${tag}`, minimum_toner_tahunan: 120,
  customer_pertama: { kode_customer: `${tag}C`, nama_customer: `Site ${tag}`, alamat: "Jakarta" }
});
assert.equal(Number(account.minimum_toner_tahunan), 120);
const customer = account.master_customer[0];
const category = await call("/printer-kategori", admin.token, "POST", { kode_kategori: tag, nama_kategori: tag });
const model = await call("/printer-model", admin.token, "POST", { kategori_id: category.id, kode_model: tag, merek: "Test", nama_model: tag });
const depot = await call("/gudang", admin.token, "POST", { kode_gudang: tag, nama_gudang: tag, jenis_gudang: "utama" });
const unit = await call("/printer", admin.token, "POST", { mp_no: tag, model_id: model.id, gudang_id: depot.id, alasan: "Fixture smoke test" });
assert.equal(unit.mp_no, tag);
const now = new Date();
const ticket = await call("/tiket", salesAdmin.token, "POST", {
  kategori: "delivery", jenis: "trial", account_id: account.id, customer_id: customer.id,
  sales_id: sales.pengguna.id, tanggal_transaksi: now.toISOString(),
  tanggal_akhir: new Date(now.getTime() + 86400000).toISOString(), printer: []
});
assert.equal(ticket.account_id, account.id);
const st = await call("/surat-tugas", head.token, "POST", {
  tiket_id: ticket.id, jenis_tugas: "kirim_trial", account_id: account.id, customer_id: customer.id,
  gudang_id: depot.id, pic_teknisi_id: tech.pengguna.id,
  printer: [{ printer_id: unit.id, mp_no: unit.mp_no, peran: "utama" }]
});
assert.equal(st.surat_tugas_printer.length, 1);
const id = encodeURIComponent(st.id);
await call(`/surat-tugas/${id}/mulai-kerja`, tech.token, "POST");
await call(`/surat-tugas/${id}/serah`, tech.token, "POST");
await call(`/surat-tugas/${id}/printer/${st.surat_tugas_printer[0].id}/hasil`, tech.token, "PUT", { hasil: "Terkirim" });
await call(`/surat-tugas/${id}/selesai`, tech.token, "POST", { hasil: "Terkirim" });
let current = await call(`/printer/${unit.id}`, admin.token);
assert.equal(current.lokasi_jenis, "gudang");
await call(`/surat-tugas/${id}/keluar`, warehouse.token, "POST");
current = await call(`/printer/${unit.id}`, admin.token);
assert.equal(current.lokasi_jenis, "transit");
await call(`/surat-tugas/${id}/resolve`, head.token, "POST");
current = await call(`/printer/${unit.id}`, admin.token);
assert.equal(current.lokasi_jenis, "customer");
assert.equal(current.customer_id, customer.id);
const found = await call(`/surat-tugas?cari=${encodeURIComponent(tag)}`, head.token);
assert.ok(found.some((row) => row.id === st.id));

const serviceTicket = await call("/tiket", salesAdmin.token, "POST", {
  kategori: "komplain", jenis: "on_site_service", account_id: account.id, customer_id: customer.id,
  sales_id: sales.pengguna.id, mp_no: unit.mp_no, printer: []
});
const serviceSt = await call("/surat-tugas", head.token, "POST", {
  tiket_id: serviceTicket.id, jenis_tugas: "on_site_service", account_id: account.id, customer_id: customer.id,
  pic_teknisi_id: tech.pengguna.id,
  printer: [{ printer_id: unit.id, mp_no: unit.mp_no, peran: "utama" }]
});
const sid = encodeURIComponent(serviceSt.id);
await call(`/surat-tugas/${sid}/mulai-kerja`, tech.token, "POST");
await call(`/surat-tugas/${sid}/printer/${serviceSt.surat_tugas_printer[0].id}/hasil`, tech.token, "PUT", { hasil: "Selesai" });
await call(`/surat-tugas/${sid}/selesai`, tech.token, "POST");
await call(`/surat-tugas/${sid}/resolve`, head.token, "POST");
const serviceResult = await call(`/surat-tugas/${sid}`, head.token);
assert.equal(serviceResult.validasi_warehouse_pada, null);
assert.equal((await call(`/printer/${unit.id}`, admin.token)).lokasi_jenis, "customer");

const toner = await call("/toner", admin.token, "POST", { kode_toner: tag, nama_toner: tag, warna: "Hitam", tipe: "Original" });
await call("/mutasi-stok", warehouse.token, "POST", {
  jenis_mutasi: "masuk", gudang_tujuan_id: depot.id, langsung_posting: true,
  detail: [{ jenis_barang: "toner", toner_id: toner.id, jumlah: 10 }]
});
const tonerTicket = await call("/tiket", salesAdmin.token, "POST", {
  kategori: "delivery", jenis: "toner_purchase", account_id: account.id, customer_id: customer.id,
  sales_id: sales.pengguna.id, printer: []
});
const tonerSt = await call("/surat-tugas", head.token, "POST", {
  tiket_id: tonerTicket.id, jenis_tugas: "kirim_toner", account_id: account.id, customer_id: customer.id,
  gudang_id: depot.id, pic_teknisi_id: tech.pengguna.id, printer: []
});
const tid = encodeURIComponent(tonerSt.id);
await call(`/surat-tugas/${tid}/pemakaian`, tech.token, "POST", {
  gudang_id: depot.id, jenis_barang: "toner", toner_id: toner.id, jumlah_pakai: 3
});
let stock = await call("/stok", warehouse.token);
let tonerBalance = stock.toner.find((row) => row.toner_id === toner.kode_toner);
assert.equal(Number(tonerBalance.jumlah_tersedia), 10);
assert.equal(Number(tonerBalance.jumlah_dicadangkan), 3);
await call(`/surat-tugas/${tid}/mulai-kerja`, tech.token, "POST");
await call(`/surat-tugas/${tid}/serah`, tech.token, "POST");
await call(`/surat-tugas/${tid}/selesai`, tech.token, "POST");
await call(`/surat-tugas/${tid}/tolak-warehouse`, warehouse.token, "POST", { alasan: "Jumlah perlu dicek ulang" });
stock = await call("/stok", warehouse.token);
tonerBalance = stock.toner.find((row) => row.toner_id === toner.kode_toner);
assert.equal(Number(tonerBalance.jumlah_tersedia), 10);
await call(`/surat-tugas/${tid}/selesai`, tech.token, "POST");
await call(`/surat-tugas/${tid}/keluar`, warehouse.token, "POST");
stock = await call("/stok", warehouse.token);
tonerBalance = stock.toner.find((row) => row.toner_id === toner.kode_toner);
assert.equal(Number(tonerBalance.jumlah_tersedia), 7);
assert.equal(Number(tonerBalance.jumlah_dicadangkan), 0);
await call(`/surat-tugas/${tid}/resolve`, head.token, "POST");

const inboundTicket = await call("/tiket", warehouse.token, "POST", {
  kategori: "inbound", jenis: "penerimaan_printer", printer: []
});
const inboundSt = await call("/surat-tugas", warehouse.token, "POST", {
  tiket_id: inboundTicket.id, jenis_tugas: "terima_printer_baru", gudang_id: depot.id,
  pic_warehouse_id: warehouse.pengguna.id, sumber: "Vendor",
  printer: [{ mp_no: `${tag}N`, model_id: model.id, sumber: "Vendor", peran: "utama" }]
});
const iid = encodeURIComponent(inboundSt.id);
await call(`/surat-tugas/${iid}/mulai-kerja`, warehouse.token, "POST");
await call(`/surat-tugas/${iid}/terima`, warehouse.token, "POST");
await call(`/surat-tugas/${iid}/selesai`, warehouse.token, "POST");
await call(`/surat-tugas/${iid}/resolve`, warehouse.token, "POST");
const received = (await call(`/printer?cari=${tag}N`, admin.token)).items.find((row) => row.mp_no === `${tag}N`);
assert.equal(received.kondisi, "checking");

const qcSt = await call("/surat-tugas", head.token, "POST", {
  jenis_tugas: "qc", pic_teknisi_id: tech.pengguna.id,
  printer: [{ printer_id: received.id, mp_no: received.mp_no, peran: "utama" }]
});
const qid = encodeURIComponent(qcSt.id);
await call(`/surat-tugas/${qid}/mulai-kerja`, tech.token, "POST");
await call(`/surat-tugas/${qid}/printer/${qcSt.surat_tugas_printer[0].id}/hasil`, tech.token, "PUT", { hasil: "Lulus QC", kondisi_hasil: "ready" });
await call(`/surat-tugas/${qid}/selesai`, tech.token, "POST");
await call(`/surat-tugas/${qid}/resolve`, head.token, "POST");
assert.equal((await call(`/printer/${received.id}`, admin.token)).kondisi, "ready");
console.log(`PASS: ${tag} Account, Tiket, ST, MP search, validation, toner, inbound and QC`);
