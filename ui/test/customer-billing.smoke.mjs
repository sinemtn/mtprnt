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
  await page.goto(`${uiBase}/dashboard`);
  await page.getByRole("button", { name: "Master Data" }).click();
  await page.getByRole("button", { name: "Account" }).click();
  assert.equal(await page.getByText("SLA Pending Komplain").count(), 0);

  await page.getByRole("button", { name: "Billing", exact: true }).click();
  await page.getByRole("heading", { name: "Billing" }).waitFor();
  assert.ok(await page.locator(".search-box").evaluate((element) => element.getBoundingClientRect().width <= 300));
  const postedAccounts = [];
  await page.route("**/api/account", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const payload = route.request().postDataJSON();
    postedAccounts.push(payload);
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ sukses: true, data: { id: "smoke" } }) });
  });
  await page.locator(".toolbar .primary-button").click();
  assert.equal(await page.getByText("Customer pertama").count(), 0);
  await page.getByLabel("Kode Account").fill("SMOKE-BILLING");
  await page.getByLabel("Nama Account").fill("Billing Smoke");
  await page.locator(".modal-panel .modal-actions .primary-button").click();
  await page.locator(".modal-panel").waitFor({ state: "hidden" });
  assert.equal(postedAccounts[0].customer_pertama, undefined);

  await page.getByRole("button", { name: "Customer", exact: true }).click();
  await page.getByRole("heading", { name: "Customer" }).waitFor();
  await page.getByRole("button", { name: "Tambah Customer" }).click();
  await page.getByLabel("Billing sendiri").check();
  assert.equal(await page.getByText("Cari Billing").count(), 0);
  await page.getByLabel("Kode Customer").fill("SMOKE-CUSTOMER");
  await page.getByLabel("Nama Customer").fill("Customer Smoke");
  await page.getByLabel("Alamat").fill("Jakarta");
  await page.getByRole("button", { name: "Simpan" }).click();
  await page.locator(".location-modal").waitFor({ state: "hidden" });
  assert.equal(postedAccounts[1].kode_account, "SMOKE-CUSTOMER");
  assert.equal(postedAccounts[1].nama_account, "Customer Smoke");
  assert.equal(postedAccounts[1].alamat_penagihan, "Jakarta");
  assert.equal(postedAccounts[1].customer_pertama.kode_customer, "SMOKE-CUSTOMER");

  await page.route("**/api/account?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("cari") || "";
    const items = query === "Missing" ? [] : query === "BILL-060" ? [{ id: "mock-account", kode_account: "BILL-060", nama_account: "Billing 60", aktif: true }]
      : Array.from({ length: 50 }, (_, index) => ({ id: `billing-${index + 1}`, kode_account: `BILL-${String(index + 1).padStart(3, "0")}`, nama_account: `Billing ${index + 1}`, aktif: true }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sukses: true, data: { items, meta: { total: items.length } } }) });
  });
  let customerPayload;
  await page.route("**/api/account/mock-account/customer", async (route) => {
    customerPayload = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ sukses: true, data: { id: "mock-customer" } }) });
  });
  await page.getByRole("button", { name: "Tambah Customer" }).click();
  await page.getByRole("combobox", { name: "Cari Billing" }).fill("BILL-060");
  await page.getByRole("option", { name: /Billing 60/ }).click();
  await page.getByRole("combobox", { name: "Cari Billing" }).fill("Missing");
  await page.waitForTimeout(350);
  assert.equal(await page.locator(".billing-choice").textContent().then((value) => value.includes("Billing 60")), true);
  await page.getByText("Billing tidak ditemukan.").waitFor();
  assert.equal(await page.locator(".location-modal select").count(), 0);
  await page.screenshot({ path: "dist/customer-billing-desktop.png" });
  await page.getByLabel("Kode Customer").fill("SMOKE-CHILD");
  await page.getByLabel("Nama Customer").fill("Customer Child");
  await page.getByLabel("Alamat").fill("Bandung");
  await page.getByRole("button", { name: "Simpan" }).click();
  await page.locator(".location-modal").waitFor({ state: "hidden" });
  assert.equal(customerPayload.kode_customer, "SMOKE-CHILD");

  await page.route("**/api/account/lokasi-customer?**", async (route) => {
    const row = { id: "mock-child", account_id: "mock-account", kode_customer: "SMOKE-CHILD", nama_customer: "Customer Child", alamat: "Bandung", aktif: true, master_account: { id: "mock-account", kode_account: "BILL-060", nama_account: "Billing 60" } };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sukses: true, data: { items: [row], meta: { total: 1 } } }) });
  });
  await page.reload();
  await page.getByText("SMOKE-CHILD", { exact: true }).waitFor();
  await page.locator(".data-panel tbody tr").filter({ hasText: "SMOKE-CHILD" }).getByRole("button", { name: "Edit customer" }).click();
  assert.match(await page.locator(".billing-readonly").textContent(), /BILL-060 - Billing 60/);
  await page.getByRole("button", { name: "Tutup" }).click();

  const searchRequest = page.waitForRequest((request) => request.url().includes("/api/account/lokasi-customer?") && request.url().includes("SMOKE-QUERY"));
  await page.getByRole("searchbox", { name: "Cari customer" }).fill("SMOKE-QUERY");
  await page.getByRole("searchbox", { name: "Cari customer" }).press("Enter");
  await searchRequest;
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator(".toolbar").evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth));
  await page.getByRole("button", { name: "Tambah Customer" }).click();
  const mobileModal = await page.locator(".location-modal").boundingBox();
  assert.ok(mobileModal && mobileModal.width <= 390 && mobileModal.height <= 844);
  await page.screenshot({ path: "dist/customer-billing-mobile.png" });
  assert.deepEqual(errors, []);
  console.log("PASS: Billing/Customer navigation, both create paths, search, and mobile layout");
} finally {
  await browser.close();
}
