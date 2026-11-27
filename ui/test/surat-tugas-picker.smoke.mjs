import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const uiBase = process.env.TEST_UI_BASE || "http://localhost:5175";
const apiBase = process.env.TEST_API_BASE || "http://localhost:5001/api";
const login = await fetch(`${apiBase}/auth/masuk`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "admin", kata_sandi: process.env.TEST_PASSWORD || "Admin123" })
});
assert.equal(login.status, 200);
const token = (await login.json()).data.token;
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});

try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.addInitScript((value) => localStorage.setItem("token_multiprint", value), token);
  const sent = [];
  await page.route("**/api/surat-tugas", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    sent.push(route.request().postDataJSON());
    const invalid = sent.length === 1;
    await route.fulfill({
      status: invalid ? 422 : 201,
      contentType: "application/json",
      body: JSON.stringify(invalid
        ? { pesan: "Validasi gagal.", detail: { fieldErrors: { printer: ["Contoh field bermasalah"] } } }
        : { pesan: "Surat tugas dibuat.", data: {} })
    });
  });
  await page.goto(`${uiBase}/surat-tugas`);
  await page.waitForFunction(() => !document.querySelector(".st-toolbar .primary-button")?.disabled);
  await page.locator(".st-toolbar .primary-button").click();
  await page.getByLabel("Tiket (opsional)").selectOption("TKT-20261122-6WENOE");
  const gudang = page.locator("#st-create label").filter({ hasText: /^Gudang/ }).locator("select");
  await gudang.selectOption({ label: "Gudang Demo Utama" });
  await page.getByLabel("PIC Teknisi").selectOption({ index: 1 });
  const search = page.getByLabel("Cari MP No / serial");
  assert.equal(await page.locator(".st-picker-results").count(), 0, "Hasil tidak boleh muncul sebelum pencarian.");
  assert.equal(await page.locator(".st-form input[type=checkbox]").count(), 0);

  await search.fill("DEMO-M479-001");
  await page.locator(".st-picker-results .st-picker-row").first().waitFor();
  assert.equal(await page.locator(".st-picker-results .st-picker-row").count(), 1);
  await page.locator(".st-picker-results .st-picker-row").getByRole("button", { name: "Pilih" }).click();
  assert.match(await page.locator(".st-picker-selected").innerText(), /DEMO-M479-001/);

  await search.fill("SN-DEMO-M404-002");
  await page.locator(".st-picker-results .st-picker-row").first().waitFor();
  assert.match(await page.locator(".st-picker-results").innerText(), /DEMO-M404-002/);
  assert.match(await page.locator(".st-picker-selected").innerText(), /DEMO-M479-001/);
  await page.locator(".st-picker-results .st-picker-row").getByRole("button", { name: "Pilih" }).click();
  assert.equal(await page.locator(".st-picker-selected .st-picker-row").count(), 2);
  await page.locator(".st-picker-selected").getByRole("button", { name: "Hapus DEMO-M479-001" }).click();
  assert.equal(await page.locator(".st-picker-selected .st-picker-row").count(), 1);

  await gudang.selectOption({ label: "Gudang Demo Cabang" });
  assert.equal(await page.locator(".st-picker-selected .st-picker-row").count(), 0);
  assert.equal(await search.inputValue(), "");
  await search.fill("DEMO-M404-002");
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".st-picker-results .st-picker-row").count(), 0, "Gudang lain tidak boleh menampilkan unit ini.");
  await gudang.selectOption({ label: "Gudang Demo Utama" });
  await search.fill("SN-DEMO-M404-002");
  await page.locator(".st-picker-results .st-picker-row").first().waitFor();
  await page.locator(".st-picker-results .st-picker-row").getByRole("button", { name: "Pilih" }).click();
  await search.fill("DEMO-M479-002");
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".st-picker-results .st-picker-row").count(), 0, "Unit terreservasi tidak boleh ditawarkan.");
  await search.fill("DEMO-M479-001");
  await page.locator(".st-picker-results .st-picker-row").first().waitFor();
  await page.locator(".st-picker-results .st-picker-row").getByRole("button", { name: "Pilih" }).click();
  assert.equal(await page.locator(".st-picker-selected .st-picker-row").count(), 2);

  await page.locator(".st-modal footer").getByRole("button", { name: "Simpan" }).click();
  await page.locator(".st-modal [role=alert]").getByText(/printer: Contoh field bermasalah/).waitFor();
  await page.locator(".st-modal footer").getByRole("button", { name: "Simpan" }).click();
  await page.locator(".st-modal").waitFor({ state: "hidden", timeout: 15000 });
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].printer.map((unit) => unit.mp_no).sort(), ["DEMO-M404-002", "DEMO-M479-001"]);
  assert.ok(sent[0].printer.every((unit) => !("tanggal_pembelian" in unit)), "Unit lama tidak boleh mengirim timestamp pembelian.");

  let oldCustomerId = "";
  await page.route("**/api/printer?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("lokasi") !== "customer") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [{ id: "dfe4eff4-a8ab-4aeb-a0ab-1204d8f99465", mp_no: "OLD-UNIT-001", serial_number: "SERIAL-OLD-001", lokasi_jenis: "customer", customer_id: oldCustomerId, master_printer_model: { nama_model: "Model Demo" } }] } })
    });
  });
  await page.locator(".st-toolbar .primary-button").click();
  await page.getByLabel("Jenis ST").selectOption("kirim_back_up");
  await page.locator("#st-create label").filter({ hasText: /^Account/ }).locator("select").selectOption({ label: "CV Mandiri Demo" });
  const customer = page.locator("#st-create label").filter({ hasText: /^Customer/ }).locator("select");
  await customer.selectOption({ label: "Mandiri - Surabaya" });
  oldCustomerId = await customer.inputValue();
  await page.locator("#st-create label").filter({ hasText: /^Mode/ }).locator("select").selectOption("sementara");
  const oldSearch = page.getByLabel("Cari Unit Lama (MP No / serial)");
  assert.equal(await page.locator(".st-picker-results").count(), 0);
  await oldSearch.fill("SERIAL-OLD-001");
  await page.locator(".st-picker-results .st-picker-row").first().waitFor();
  await page.locator(".st-picker-results").getByRole("button", { name: "Pilih" }).click();
  await oldSearch.fill("tidak-ada");
  assert.match(await page.locator(".st-picker-selected").innerText(), /OLD-UNIT-001/);
  await page.getByRole("button", { name: "Hapus OLD-UNIT-001" }).click();
  assert.equal(await page.locator(".st-picker-selected").count(), 0);
  await page.locator(".st-modal header").getByRole("button", { name: "Tutup" }).click();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 });
  await mobile.addInitScript((value) => localStorage.setItem("token_multiprint", value), token);
  await mobile.goto(`${uiBase}/surat-tugas`);
  await mobile.waitForFunction(() => !document.querySelector(".st-toolbar .primary-button")?.disabled);
  await mobile.locator(".st-toolbar .primary-button").click();
  await mobile.getByLabel("Tiket (opsional)").selectOption("TKT-20261122-6WENOE");
  await mobile.locator("#st-create label").filter({ hasText: /^Gudang/ }).locator("select").selectOption({ label: "Gudang Demo Utama" });
  await mobile.getByLabel("Cari MP No / serial").fill("DEMO-M479-001");
  await mobile.locator(".st-picker-results .st-picker-row").first().waitFor();
  assert.ok(await mobile.locator(".st-modal").evaluate((el) => el.getBoundingClientRect().width <= window.innerWidth));
  assert.ok(await mobile.locator(".st-picker-results .st-picker-row").first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  console.log("PASS: pencarian, pilihan multi-unit, gudang, payload ST, dan modal mobile");
} finally {
  await browser.close();
}
