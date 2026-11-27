import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const uiBase = process.env.TEST_UI_BASE || "http://localhost:5175";
const apiBase = process.env.TEST_API_BASE || "http://localhost:5001/api";
const login = await fetch(`${apiBase}/auth/masuk`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "admin", kata_sandi: process.env.TEST_PASSWORD || "Admin123" })
});
assert.equal(login.status, 200, "Login admin preview gagal.");
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

  for (const [path, title, data] of [
    ["/stok/printer", "Stok Printer", "DEMO-M404-001"],
    ["/stok/toner", "Stok Toner", "Toner HP 404 Demo"],
    ["/stok/sparepart", "Stok Sparepart", "Fuser HP M404 Demo"],
    ["/master-data/billing", "Billing", "PT Nusantara Demo"],
    ["/master-data/customer", "Customer", "Nusantara - Jakarta"],
    ["/master-data/gudang", "Master Gudang", "Gudang Demo Utama"],
    ["/master-data/printer/kategori", "Kategori Printer", "Monokrom Demo"],
    ["/master-data/printer/model", "Model Printer", "LaserJet Pro M404 Demo"],
    ["/master-data/toner", "Master Toner", "Toner HP 404 Demo"],
    ["/master-data/sparepart", "Master Sparepart", "Fuser HP M404 Demo"],
    ["/master-data/user", "Master Akun / User", "Admin Multiprint"],
    ["/audit", "Audit Trail"],
    ["/audit-barang", "Audit Barang"],
    ["/pengaturan/role-permission", "Role Permission"]
  ]) {
    const response = await page.goto(`${uiBase}${path}`);
    assert.equal(response.status(), 200, `Direct URL ${path} gagal.`);
    await page.getByRole("heading", { name: title, exact: true }).first().waitFor();
    assert.equal(new URL(page.url()).pathname, path);
    if (path === "/stok/printer") {
      await page.getByPlaceholder("Cari MP No / Serial").fill("DEMO-M404-001");
      await page.getByPlaceholder("Cari MP No / Serial").press("Enter");
    }
    if (data) await page.getByText(data, { exact: false }).first().waitFor();
  }

  await page.goto(`${uiBase}/dashboard`);
  await page.getByRole("button", { name: "Stok Barang" }).click();
  await page.getByRole("button", { name: "Stok Toner" }).click();
  await page.waitForURL("**/stok/toner");
  await page.goBack();
  await page.getByRole("heading", { name: "Ringkasan Aplikasi", exact: true }).first().waitFor();
  assert.equal(new URL(page.url()).pathname, "/dashboard");
  await page.getByRole("button", { name: "Master Data" }).click();
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Billing", exact: true }).click();
  await page.waitForURL("**/master-data/billing");

  await page.goto(`${uiBase}/tiket`);
  await page.waitForFunction(() => !document.querySelector(".tkt-toolbar .primary-button")?.disabled);
  await page.locator(".tkt-toolbar .primary-button").click();
  await page.locator(".tkt-modal").waitFor();
  await page.locator(".tkt-form select").first().waitFor();
  assert.ok(await page.locator(".tkt-search").evaluate((element) => {
    const search = element.getBoundingClientRect();
    const filter = document.querySelector(".tkt-toolbar select").getBoundingClientRect();
    return search.width <= 260 && search.height <= 40 && Math.abs(search.top - filter.top) <= 2;
  }));
  assert.ok(await page.locator(".tkt-form").getByText("PT Nusantara Demo").count());

  await page.goto(`${uiBase}/surat-tugas`);
  await page.waitForFunction(() => !document.querySelector(".st-toolbar .primary-button")?.disabled);
  await page.locator(".st-toolbar .primary-button").click();
  await page.locator(".st-modal").waitFor();
  await page.getByLabel("Jenis ST").selectOption("kirim_trial");
  assert.ok(await page.locator(".st-form").getByText("Gudang Demo Utama").count());
  assert.ok(await page.getByLabel("PIC Teknisi").locator("option").count() > 1);
  assert.deepEqual(errors, []);
  console.log("PASS: direct routes, sidebar/back navigation, demo data, and ticket search width");
} finally {
  await browser.close();
}
