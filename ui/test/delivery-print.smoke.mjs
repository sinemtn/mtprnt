import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const apiBase = process.env.TEST_API_BASE;
const uiBase = process.env.TEST_UI_BASE;
if (!apiBase || !uiBase) throw new Error("Use a disposable API and set TEST_API_BASE and TEST_UI_BASE.");

async function api(token, path, method = "GET", body) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${payload.pesan}`);
  return payload.data;
}

const login = async (username) => (await api(null, "/auth/masuk", "POST", {
  username, kata_sandi: process.env.TEST_PASSWORD || "Admin123"
})).token;
const [admin, salesAdmin, head, technician] = await Promise.all([
  login("admin"), login("sales-admin"), login("kepala-teknisi"), login("teknisi")
]);
const [users, stock] = await Promise.all([api(admin, "/pengguna?batas=100"), api(admin, "/stok")]);
const tag = `PDF${Date.now().toString(36).toUpperCase()}`;
const account = await api(admin, "/account", "POST", {
  kode_account: tag, nama_account: `PDF ${tag}`,
  customer_pertama: { kode_customer: `${tag}C`, nama_customer: "Site PDF", alamat: "Jakarta" }
});
const customer = account.master_customer[0];
const sales = users.items.find((row) => (row.role || row.peran) === "sales" && (row.active ?? row.aktif));
const tech = users.items.find((row) => row.user_id === "teknisi" && (row.active ?? row.aktif));
const balance = stock.toner.find((row) => Number(row.jumlah_tersedia) - Number(row.jumlah_dicadangkan) >= 1);
assert.ok(account && customer && sales && tech && balance, "Delivery fixture with stock is required.");

const ticket = await api(salesAdmin, "/tiket", "POST", {
  kategori: "delivery", jenis: "toner_purchase", account_id: account.id,
  customer_id: customer.id, sales_id: sales.id
});
const st = await api(head, "/surat-tugas", "POST", {
  tiket_id: ticket.id, jenis_tugas: "kirim_toner", gudang_id: balance.master_gudang.id,
  pic_teknisi_id: tech.id, printer: []
});
await api(technician, `/surat-tugas/${st.id}/pemakaian`, "POST", {
  gudang_id: balance.master_gudang.id, jenis_barang: "toner",
  toner_id: balance.master_toner.id, jumlah_pakai: 1
});
const beforePrint = await api(admin, `/surat-tugas/${st.id}`);
assert.equal(beforePrint.status, "progress");
assert.equal(beforePrint.mulai_kunjungan, null);
assert.equal(beforePrint.konfirmasi_serah_pada, null);
assert.equal(beforePrint.validasi_warehouse_pada, null);

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((token) => localStorage.setItem("token_multiprint", token), admin);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${uiBase}/surat-tugas`);
  await page.locator(".st-table tbody tr").filter({ hasText: st.id }).first().click();
  await page.getByRole("button", { name: "PDF", exact: true }).waitFor();
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const popup = await popupPromise;
  await popup.locator(".sheet").waitFor();
  const documentText = await popup.locator(".sheet").innerText();
  assert.ok(documentText.includes(st.nomor_surat_tugas));
  assert.ok(documentText.includes(balance.master_toner.nama_toner));
  assert.ok(documentText.includes("PT. MULTI PRIMA MANDIRI SUKSES"));
  assert.deepEqual(errors, []);
  console.log(`PASS: PDF available before ST use (${st.nomor_surat_tugas})`);
} finally {
  await browser.close();
}
