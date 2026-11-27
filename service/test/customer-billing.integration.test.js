const { test } = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");

const base = process.env.TEST_API_BASE || "http://localhost:5001/api";

test("Billing standalone and Customer with self Billing", async () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const billingCode = `UAT-BILL-${suffix}`;
  const selfCode = `UAT-CUS-${suffix}`;
  const login = await fetch(`${base}/auth/masuk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", kata_sandi: process.env.TEST_PASSWORD || "Admin123" })
  });
  assert.equal(login.status, 200);
  const token = (await login.json()).data.token;
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const created = [];

  async function request(path, method = "GET", body) {
    const response = await fetch(`${base}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, payload: await response.json() };
  }

  try {
    const billing = await request("/account", "POST", { kode_account: billingCode, nama_account: "Billing UAT", aktif: true });
    assert.equal(billing.status, 201, billing.payload.pesan);
    created.push(billing.payload.data.id);
    assert.equal(billing.payload.data.master_customer.length, 0);

    const child = await request(`/account/${billing.payload.data.id}/customer`, "POST", {
      kode_customer: `${selfCode}-CHILD`, nama_customer: "Customer Cabang", alamat: "Bandung", aktif: true
    });
    assert.equal(child.status, 201, child.payload.pesan);

    const self = await request("/account", "POST", {
      kode_account: selfCode, nama_account: "Customer Sendiri", alamat_penagihan: "Jakarta",
      aktif: true,
      customer_pertama: { kode_customer: selfCode, nama_customer: "Customer Sendiri", alamat: "Jakarta", nama_pic: "PIC UAT", aktif: true }
    });
    assert.equal(self.status, 201, self.payload.pesan);
    created.push(self.payload.data.id);
    assert.equal(self.payload.data.master_customer.length, 1);

    const accountSearch = await request("/account?cari=Customer%20Sendiri");
    assert.equal(accountSearch.status, 200);
    assert.ok(accountSearch.payload.data.items.some((item) => item.kode_account === selfCode));
    const customerSearch = await request("/account/lokasi-customer?cari=PIC%20UAT");
    assert.equal(customerSearch.status, 200);
    assert.ok(customerSearch.payload.data.items.some((item) => item.kode_customer === selfCode));

    const format = await request("/master-import/account/format");
    assert.equal(format.status, 200);
    assert.equal(format.payload.data.title, "Billing");
    assert.equal(format.payload.data.columns.find((column) => column.key === "kode_customer").required, false);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data");
    const columns = format.payload.data.columns.map((column) => column.key);
    sheet.addRow(columns);
    sheet.addRow(columns.map((key) => ({ kode_account: `${billingCode}-IMPORT`, nama_account: "Billing Excel" })[key] || null));
    const preview = await fetch(`${base}/master-import/account/preview`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: Buffer.from(await workbook.xlsx.writeBuffer())
    });
    const previewPayload = await preview.json();
    assert.equal(preview.status, 200, previewPayload.pesan);
    assert.deepEqual(previewPayload.data.errors, []);
    assert.equal(previewPayload.data.valid, 1);
  } finally {
    for (const id of created.reverse()) {
      const removed = await request(`/account/${id}/permanent`, "DELETE");
      assert.equal(removed.status, 200, removed.payload.pesan);
    }
  }
});
