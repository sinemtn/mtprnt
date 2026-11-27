import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${process.env.TEST_UI_BASE || "http://127.0.0.1:5174"}/login`);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto(`${process.env.TEST_UI_BASE || "http://127.0.0.1:5174"}/tiket`);
  await page.locator(".tkt-toolbar .primary-button").click();
  await page.getByLabel("Kategori").selectOption("delivery");
  await page.getByLabel("Jenis").selectOption("trial");
  const account = page.locator(".tkt-form label").filter({ hasText: "Account" }).locator("select").first();
  await account.locator("option").nth(1).waitFor({ state: "attached", timeout: 15000 });
  await account.selectOption({ index: 1 });
  const customer = page.getByLabel("Customer / Site");
  await customer.locator("option").nth(1).waitFor({ state: "attached" });
  await customer.selectOption({ index: 1 });
  await page.getByLabel("Sales").selectOption({ index: 1 });
  const end = new Date(Date.now() + 86400000);
  const local = new Date(end.getTime() - end.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.getByLabel("Tanggal Akhir").fill(local);
  const [ticketResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/tiket") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Simpan", exact: true }).click()
  ]);
  assert.equal(ticketResponse.status(), 201);
  const ticketNo = (await ticketResponse.json()).data.id;
  await page.locator(".tkt-modal").waitFor({ state: "hidden" });
  await page.locator(".tkt-table .tkt-row").filter({ hasText: ticketNo }).click();
  await page.getByRole("button", { name: /Surat Tugas \(0\)/ }).click();
  await page.getByRole("button", { name: "Buat Surat Tugas" }).click();
  await page.locator(".st-modal").waitFor();
  await page.getByLabel("Gudang").selectOption({ index: 1 });
  await page.getByLabel("PIC Teknisi").selectOption({ index: 1 });
  const unit = page.locator(".st-check input").first();
  await unit.waitFor();
  await unit.check();
  await page.locator(".st-modal footer").getByRole("button", { name: "Simpan" }).click();
  await page.locator(".st-modal").waitFor({ state: "hidden" });
  await page.locator(".st-table tbody tr").filter({ hasText: "Pengiriman Trial" }).first().waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: browser Ticket to ST form");
} finally {
  await browser.close();
}
