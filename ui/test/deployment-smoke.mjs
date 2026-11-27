import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const uiBase = process.env.TEST_UI_BASE || "http://localhost:5173";
const apiBase = process.env.TEST_API_BASE || "http://localhost:5000/api";
const password = process.env.TEST_PASSWORD;
assert.ok(password, "Set TEST_PASSWORD for the seeded admin account.");

const login = await fetch(`${apiBase}/auth/masuk`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "admin", kata_sandi: password })
});
assert.equal(login.status, 200, "Seeded admin login failed.");
const token = (await login.json()).data.token;

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});

try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((value) => localStorage.setItem("token_multiprint", value), token);

    for (const [path, title] of [
      ["/dashboard", "Ringkasan Aplikasi"],
      ["/tiket", "Tiket"],
      ["/surat-tugas", "Surat Tugas"],
      ["/master-data/billing", "Billing"],
      ["/master-data/customer", "Customer"]
    ]) {
      await page.goto(`${uiBase}${path}`);
      await page.getByRole("heading", { name: title, exact: true }).first().waitFor();
      assert.ok(!((await page.locator("body").textContent()) || "").includes("Terjadi kesalahan pada server."), `${path} failed to load`);
    }

    assert.deepEqual(errors, [], `Browser errors at ${viewport.width}px`);
    await context.close();
  }
  console.log("PASS: latest UI, API, and seeded login at desktop/mobile widths");
} finally {
  await browser.close();
}
