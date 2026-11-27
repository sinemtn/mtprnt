import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const uiBase = process.env.TEST_UI_BASE || "http://localhost:5175";
const apiBase = process.env.TEST_API_BASE || "http://localhost:5001/api";
const login = await fetch(`${apiBase}/auth/masuk`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "admin", kata_sandi: process.env.TEST_PASSWORD || "Admin123" })
});
assert.equal(login.status, 200, "Login preview gagal.");
const token = (await login.json()).data.token;
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});

try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((value) => localStorage.setItem("token_multiprint", value), token);

  await page.goto(`${uiBase}/master-data/billing`);
  await page.getByRole("heading", { name: "Billing", exact: true }).waitFor();
  await page.locator(".toolbar .primary-button").click();
  await page.getByLabel("Minimum Toner / Tahun (Qty)").waitFor();
  assert.equal(await page.getByLabel("PPN", { exact: true }).isChecked(), false);
  assert.deepEqual(await page.locator(".account-check-row label").allTextContents(), ["PPN", "Aktif"]);
  await page.screenshot({ path: "dist/billing-v2-desktop.png" });

  await page.goto(`${uiBase}/master-data/customer`);
  await page.getByRole("heading", { name: "Customer", exact: true }).waitFor();
  await page.getByRole("button", { name: "Tambah Customer" }).click();
  assert.equal(await page.getByRole("button", { name: "PIC" }).isDisabled(), false);
  await page.getByRole("button", { name: "PIC" }).click();
  await page.getByLabel("Nama PIC").fill("PIC Sebelum Simpan");
  await page.getByRole("button", { name: "Tambah PIC" }).click();
  await page.getByRole("button", { name: "General" }).click();
  await page.getByRole("button", { name: /^PIC/ }).click();
  await page.getByText("PIC Sebelum Simpan").waitFor();
  await page.locator(".location-modal .modal-heading button").click();
  await page.locator(".data-panel tbody tr").first().getByRole("button", { name: "Edit customer" }).click();
  await page.getByRole("button", { name: /^PIC/ }).click();
  await page.getByLabel("Nama PIC").waitFor();
  await page.screenshot({ path: "dist/customer-pic-v2-desktop.png" });

  await page.goto(`${uiBase}/master-data/printer/model`);
  await page.getByRole("heading", { name: "Model Printer", exact: true }).waitFor();
  await page.locator(".data-panel tbody tr").first().getByRole("button", { name: /edit/i }).click();
  await page.getByRole("button", { name: "Kompatibilitas" }).click();
  await page.getByText("Toner Kompatibel").waitFor();
  assert.equal(await page.locator(".compatible-search + .compatible-list .compatible-row").count(), 0);
  await page.route("**/api/compatibility/model/*/candidates?*", async (route) => {
    const requestedPage = Number(new URL(route.request().url()).searchParams.get("halaman") || 1);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sukses: true, data: {
      items: Array.from({ length: 10 }, (_, index) => ({ id: `preview-${requestedPage}-${index}`, kode_toner: `TONER-${requestedPage}-${index}`, nama_toner: "Toner kompatibel", warna: "Hitam" })),
      meta: { total: 250, halaman: requestedPage, batas: 10 }
    } }) });
  });
  await page.locator(".compatible-search input").fill("to");
  await page.waitForTimeout(400);
  const candidateList = await page.locator(".compatible-search + .compatible-list").boundingBox();
  assert.ok(candidateList && candidateList.height <= 220, "Hasil kompatibilitas harus memiliki tinggi terbatas.");
  assert.equal(await page.locator(".compatible-search + .compatible-list .compatible-row").count(), 10);
  await page.locator(".compatible-search ~ .compatible-pager").getByRole("button", { name: "Berikutnya" }).click();
  await page.getByText("Halaman 2 dari 25").waitFor();
  await page.screenshot({ path: "dist/model-compat-v2-desktop.png" });

  await page.goto(`${uiBase}/master-data/toner`);
  await page.getByRole("heading", { name: "Master Toner", exact: true }).waitFor();
  await page.locator(".data-panel tbody tr").first().getByRole("button", { name: /edit/i }).click();
  await page.getByRole("button", { name: "Kompatibilitas" }).click();
  await page.getByText("Model Printer Kompatibel").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  const compatModal = await page.locator(".modal-panel").boundingBox();
  assert.ok(compatModal && compatModal.width <= 390 && compatModal.height <= 844);
  await page.screenshot({ path: "dist/toner-compat-v2-mobile.png" });
  await page.setViewportSize({ width: 1366, height: 768 });

  await page.goto(`${uiBase}/surat-tugas`);
  await page.getByRole("heading", { name: "Surat Tugas", exact: true }).waitFor();
  await page.locator(".st-toolbar .primary-button").click();
  await page.getByRole("heading", { name: "Buat Surat Tugas" }).waitFor();
  await page.screenshot({ path: "dist/st-v2-create-desktop.png" });
  await page.locator(".st-modal header button").click();
  await page.locator(".st-table tbody tr").filter({ hasText: "Pengiriman Kontrak" }).first().click();
  await page.locator(".st-modal nav").waitFor();
  assert.deepEqual(await page.locator(".st-modal nav button").allTextContents(), ["General", "Item"]);
  assert.ok(await page.locator(".st-result-unit select option, .st-result-unit strong").count() > 0);
  assert.equal(await page.locator(".st-unit-list").count(), 0);
  assert.equal(await page.getByRole("button", { name: /Konfirmasi (Serah|Terima)/ }).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  const modal = await page.locator(".st-modal").boundingBox();
  assert.ok(modal && modal.width <= 390 && modal.height <= 844);
  await page.screenshot({ path: "dist/st-v2-create-mobile.png" });
  await page.locator(".st-modal header button").click();
  const stResponse = await fetch(`${apiBase}/surat-tugas?batas=100`, { headers: { authorization: `Bearer ${token}` } });
  const stList = (await stResponse.json()).data.items;
  const printerOnly = stList.find((st) => st.jenis_tugas === "kirim_kontrak" && st.status === "solved" && !st.validasi_warehouse_pada);
  assert.ok(printerOnly, "ST printer-only selesai diperlukan untuk uji PDF.");
  await page.locator(".st-toolbar input").fill(printerOnly.nomor_surat_tugas);
  await page.locator(".st-toolbar input").press("Enter");
  await page.locator(".st-table tbody tr").filter({ hasText: printerOnly.nomor_surat_tugas }).first().click();
  const popupPromise = page.context().waitForEvent("page");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const popup = await popupPromise;
  await popup.locator(".sheet").waitFor();
  assert.ok((await popup.locator(".sheet").innerText()).includes("Tidak diperlukan"));
  await popup.close();
  assert.deepEqual(errors, []);
  console.log("PASS: Billing, Customer PIC, compatibility, and ST desktop/mobile UI");
} finally {
  await browser.close();
}
