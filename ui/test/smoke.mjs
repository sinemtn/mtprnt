import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.TEST_UI_BASE || "http://localhost:5175";
const browserPath = process.env.BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const screenshots = resolve("dist", "smoke-screenshots");
await mkdir(screenshots, { recursive: true });

const browser = await chromium.launch({ executablePath: browserPath, headless: true });
try {
  for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/tiket`);
    await page.getByRole("button", { name: "Login" }).click();
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 12000 });
    } catch (error) {
      await page.screenshot({ path: resolve(screenshots, `login-failed-${name}.png`) });
      throw new Error(`${name}: login failed at ${page.url()}: ${await page.locator(".alert-error").allTextContents()} | ${errors.join("; ")} | ${(await page.locator("body").textContent()).slice(0, 250)}`, { cause: error });
    }
    await page.goto(`${base}/tiket`);
    await page.locator(".tkt-toolbar .primary-button").waitFor();
    await page.screenshot({ path: resolve(screenshots, `tiket-${name}.png`), fullPage: true });
    if (process.env.TEST_ARCHIVE === "1") {
      await page.locator(".tkt-table .tkt-row").filter({ hasText: "PGD-" }).first().click();
      await page.getByRole("button", { name: "Buka Komplain Arsip" }).waitFor();
      await page.getByRole("button", { name: /Surat Tugas \(1\)/ }).click();
      assert.match(await page.locator(".tkt-modal-body").textContent(), /ST-[A-Z0-9-]+/);
      await page.getByRole("button", { name: "Tutup", exact: true }).click();
    }
    await page.locator(".tkt-toolbar .primary-button").click();
    await page.locator(".tkt-modal .tkt-form select").nth(0).selectOption("internal");
    await page.locator(".tkt-modal .tkt-form select").nth(1).selectOption("internal_use");
    await page.getByLabel("Divisi / Lokasi Internal").waitFor();
    const modal = await page.locator(".tkt-modal").boundingBox();
    assert.ok(modal && modal.height <= viewport.height && modal.width <= viewport.width, `${name}: modal exceeds viewport`);
    await page.screenshot({ path: resolve(screenshots, `tiket-form-${name}.png`) });
    await page.locator(".tkt-modal .tkt-form select").nth(0).selectOption("delivery");
    await page.locator(".tkt-modal .tkt-form select").nth(1).selectOption("kontrak");
    assert.equal(await page.getByText("Dari Trial (opsional)").count(), 0);
    await page.getByText("Jenis Kontrak").waitFor();
    await page.getByRole("button", { name: "Tutup", exact: true }).click();
    await page.goto(`${base}/surat-tugas`);
    await page.locator(".st-table").waitFor();
    await page.locator(".user-menu-name").filter({ hasText: "Admin Multiprint" }).first().waitFor({ state: "attached" });
    try {
      await page.locator(".st-table tbody tr").filter({ hasText: "ST-" }).first().waitFor({ timeout: 15000 });
    } catch (error) {
      const details = await page.locator(".st-error, .st-table tbody").allTextContents();
      throw new Error(`${name}: Surat Tugas list did not load: ${details.join(" | ")}`, { cause: error });
    }
    await page.screenshot({ path: resolve(screenshots, `surat-tugas-${name}.png`), fullPage: true });
    const linkedSt = page.locator(".st-table tbody tr").filter({ hasText: "Pengiriman Kontrak" }).first();
    if (await linkedSt.count()) {
      await linkedSt.click();
      assert.match(await page.locator(".st-facts").textContent(), /Tiket: TKT-/);
      assert.deepEqual(await page.locator(".st-timeline .st-step-label").allTextContents(), ["Dibuat", "Dibuka", "Siap Cetak", "Pekerjaan Selesai", "Validasi Gudang", "Disetujui"]);
      assert.ok(await page.locator(".st-timeline-scroll").evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth));
      await page.screenshot({ path: resolve(screenshots, `surat-tugas-detail-${name}.png`) });
      await page.getByRole("button", { name: "Tutup", exact: true }).click();
      if (name === "desktop") {
        const stId = (await linkedSt.locator("td").first().textContent()).trim();
        let detailOverride;
        await page.route(`**/api/surat-tugas/${stId}`, async (route) => {
          const response = await route.fetch();
          const payload = await response.json();
          payload.data = { ...payload.data, ...detailOverride };
          await route.fulfill({ response, json: payload });
        });
        for (const scenario of [
          { data: { jenis_tugas: "terima_return", status: "progress" }, labels: ["Dibuat", "Dibuka", "Unit diterima", "Selesai"] },
          { data: { status: "cancelled" }, state: "cancelled" },
          { data: { status: "ready_to_print", alasan_penolakan_warehouse: "Selisih barang" }, state: "rejected" },
          { data: { tiket: null, tiket_id: null }, ticket: "Tiket: Mandiri" }
        ]) {
          detailOverride = scenario.data;
          await linkedSt.click();
          await page.locator(".st-modal").waitFor();
          if (scenario.labels) await page.getByText("Unit diterima", { exact: true }).waitFor();
          if (scenario.state) await page.locator(`.st-step-${scenario.state}`).waitFor();
          if (scenario.ticket) await page.getByText("Tiket: Mandiri").waitFor();
          if (scenario.labels) assert.deepEqual(await page.locator(".st-timeline .st-step-label").allTextContents(), scenario.labels);
          if (scenario.state) assert.equal(await page.locator(`.st-step-${scenario.state}`).count(), 1);
          if (scenario.ticket) assert.match(await page.locator(".st-facts").textContent(), /Tiket: Mandiri/);
          await page.getByRole("button", { name: "Tutup", exact: true }).click();
        }
        await page.unroute(`**/api/surat-tugas/${stId}`);
        await page.route("**/api/surat-tugas/*/pemakaian", async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ pesan: "Stok Toner Demo di Gudang Demo tidak mencukupi. Diminta 99, dapat dialokasikan 2." }) });
        });
        await linkedSt.click();
        await page.locator(".st-modal").waitFor();
        await page.getByRole("button", { name: "Item", exact: true }).click();
        await page.locator(".st-item-form select").nth(1).selectOption({ index: 1 });
        await page.locator(".st-item-form select").nth(2).selectOption({ index: 1 });
        await page.locator(".st-item-form input[type=number]").fill("99");
        await page.getByRole("button", { name: "Tambah Item" }).click();
        await page.getByRole("alert").filter({ hasText: "Diminta 99, dapat dialokasikan 2" }).waitFor();
        await page.getByRole("button", { name: "General", exact: true }).click();
        assert.equal(await page.getByText("Diminta 99, dapat dialokasikan 2").count(), 0);
        await page.getByRole("button", { name: "Tutup", exact: true }).click();
        await linkedSt.click();
        await page.locator(".st-modal").waitFor();
        assert.equal(await page.getByText("Diminta 99, dapat dialokasikan 2").count(), 0);
        await page.getByRole("button", { name: "Tutup", exact: true }).click();
        await page.unroute("**/api/surat-tugas/*/pemakaian");
      }
    }
    if (process.env.TEST_SEARCH_MP_NO) {
      const search = page.locator(".st-toolbar input");
      await search.fill(process.env.TEST_SEARCH_MP_NO);
      const [result] = await Promise.all([
        page.waitForResponse((response) => response.url().includes("/api/surat-tugas?cari=") && response.status() === 200),
        search.press("Enter")
      ]);
      assert.ok((await result.json()).data.items.some((row) => row.nomor_surat_tugas === process.env.TEST_SEARCH_ST_NO));
      await page.locator(".st-table tbody tr").filter({ hasText: process.env.TEST_SEARCH_ST_NO }).waitFor();
      await search.fill("");
      await page.locator(".st-table tbody tr").filter({ hasText: "(arsip)" }).first().waitFor();
    }
    if (process.env.TEST_ARCHIVE === "1") {
      await page.locator(".st-table tbody tr").filter({ hasText: "(arsip)" }).first().click();
      await page.getByText("Surat Tugas Arsip", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Tutup", exact: true }).click();
    }
    if (name === "desktop" && process.env.TEST_PDF !== "skip") {
      await page.locator(".st-table tbody tr").filter({ hasText: process.env.TEST_PDF_KIND || "Penerimaan Printer" }).first().click();
      const pdf = page.getByRole("button", { name: "PDF", exact: true });
      await pdf.waitFor();
      const [popup] = await Promise.all([page.waitForEvent("popup"), pdf.click()]);
      await popup.locator(".sheet").waitFor();
      assert.match(await popup.locator(".company h1").textContent(), /MULTI PRIMA MANDIRI SUKSES/);
      assert.match(await popup.locator(".meta").textContent(), new RegExp(process.env.TEST_PDF_REQUEST_BY || "Warehouse Multiprint"));
      assert.match(await popup.locator(".items tbody").textContent(), /[A-Z0-9-]+/);
      assert.match(await popup.locator(".signatures").textContent(), /Authorized by/);
      await popup.screenshot({ path: resolve(screenshots, "surat-tugas-pdf.png"), fullPage: true });
      await popup.close();
    }
    await page.goto(`${base}/dashboard`);
    await page.locator(".summary-card").first().waitFor();
    assert.equal(await page.locator(".summary-card").count(), 3);
    assert.match(await page.locator(".summary-grid").textContent(), /Jumlah Tiket/);
    assert.match(await page.locator(".summary-grid").textContent(), /Jumlah Surat Tugas/);
    assert.match(await page.locator(".summary-grid").textContent(), /Jumlah Printer Terpasang/);
    if (name === "desktop" && process.env.TEST_ACCOUNT_MINIMUM === "1") {
      await page.locator(".sidebar").getByRole("button", { name: "Master Data", exact: true }).click();
      await page.locator(".sidebar").getByRole("button", { name: "Account", exact: true }).click();
      await page.getByRole("columnheader", { name: "Minimum Pembelian / Tahun" }).waitFor();
      assert.match(await page.locator(".data-panel tbody").textContent(), /Rp 0/);
      await page.locator(".toolbar").getByRole("button", { name: "Tambah" }).click();
      const minimum = page.getByLabel("Minimum Pembelian / Tahun (Rp)");
      await minimum.waitFor();
      assert.equal(await minimum.getAttribute("min"), "0");
      await page.getByRole("button", { name: "Batal", exact: true }).click();
    }
    assert.deepEqual(errors, [], `${name}: browser errors`);
    await context.close();
  }
} finally {
  await browser.close();
}
