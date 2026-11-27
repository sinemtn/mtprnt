const { test } = require("node:test");
const assert = require("node:assert/strict");

const base = process.env.TEST_API_BASE;
const enabled = base && process.env.TEST_DISPOSABLE_DB === "1";

async function request(token, path, method = "GET", body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json();
  return { status: response.status, data: payload.data, message: payload.pesan };
}

async function good(token, path, method = "GET", body, expected = 200) {
  const response = await request(token, path, method, body);
  assert.equal(response.status, expected, `${method} ${path}: ${response.message}`);
  return response.data;
}

test("WO validates customer, physical units, exceptions, and QC", { skip: !enabled && "Use a disposable database." }, async () => {
  const tokens = {};
  for (const role of ["admin", "sales-admin", "kepala-teknisi", "teknisi", "warehouse", "sales"]) {
    tokens[role] = (await good(null, "/auth/masuk", "POST", { username: role, kata_sandi: process.env.TEST_PASSWORD || "Admin123" })).token;
  }
  const { admin, "sales-admin": salesAdmin, "kepala-teknisi": head, teknisi: tech, warehouse, sales: viewer } = tokens;
  const suffix = Date.now().toString(36).toUpperCase();
  const account = await good(admin, "/account", "POST", {
    kode_account: `WO-A-${suffix}`, nama_account: "WO validation",
    customer_pertama: { kode_customer: `WO-C-${suffix}`, nama_customer: "WO site", alamat: "Jl. Uji 1" }
  }, 201);
  const other = await good(admin, "/account", "POST", {
    kode_account: `WO-B-${suffix}`, nama_account: "Other account",
    customer_pertama: { kode_customer: `WO-D-${suffix}`, nama_customer: "Other site", alamat: "Jl. Uji 2" }
  }, 201);
  const customer = account.master_customer[0];
  const otherCustomer = other.master_customer[0];
  const gudang = await good(admin, "/gudang", "POST", {
    kode_gudang: `WO-G-${suffix}`, nama_gudang: "WO test warehouse", jenis_gudang: "utama"
  }, 201);
  const kategori = await good(admin, "/printer-kategori", "POST", {
    kode_kategori: `WO-K-${suffix}`, nama_kategori: "WO test category"
  }, 201);
  const model = await good(admin, "/printer-model", "POST", {
    kategori_id: kategori.id, kode_model: `WO-M-${suffix}`, merek: "Test", nama_model: "WO test model"
  }, 201);
  const users = (await good(admin, "/pengguna?batas=100")).items;
  const pic = users.find((row) => (row.role || row.peran) === "teknisi" && (row.active ?? row.aktif));
  const storePic = users.find((row) => (row.role || row.peran) === "warehouse" && (row.active ?? row.aktif));
  const salesPic = users.find((row) => (row.role || row.peran) === "sales" && (row.active ?? row.aktif));
  assert.ok(pic && storePic && salesPic);
  const makeUnit = (number) => good(admin, "/printer", "POST", {
    mp_no: `WO-${suffix}-${number}`, model_id: model.id, gudang_id: gudang.id, alasan: "Fixture validasi WO"
  }, 201);
  const [delivered, alsoDelivered, excluded] = await Promise.all([makeUnit(1), makeUnit(2), makeUnit(3)]);
  const line = (unit) => ({ printer_id: unit.id, mp_no: unit.mp_no });

  const ticket = await good(salesAdmin, "/tiket", "POST", {
    kategori: "delivery", jenis: "kontrak", mode: "baru", account_id: account.id, customer_id: customer.id, sales_id: salesPic.id
  }, 201);
  const st = await good(head, "/surat-tugas", "POST", {
    tiket_id: ticket.id, jenis_tugas: "kirim_kontrak", gudang_id: gudang.id, pic_teknisi_id: pic.id,
    printer: [line(delivered), line(alsoDelivered), line(excluded)]
  }, 201);
  const deliveredLine = st.surat_tugas_printer.find((row) => row.mp_no === delivered.mp_no);
  const alsoDeliveredLine = st.surat_tugas_printer.find((row) => row.mp_no === alsoDelivered.mp_no);
  const excludedLine = st.surat_tugas_printer.find((row) => row.mp_no === excluded.mp_no);
  await good(head, `/surat-tugas/${st.id}/start`, "POST", {});
  assert.equal((await request(viewer, `/surat-tugas/${st.id}/printer/${excludedLine.id}/pengecualian`, "POST", { alasan: "Tidak dikirim" })).status, 403);
  await good(tech, `/surat-tugas/${st.id}/printer/${excludedLine.id}/pengecualian`, "POST", { alasan: "Unit tidak jadi dikirim" });
  assert.equal((await request(tech, `/surat-tugas/${st.id}/printer/${excludedLine.id}/pengecualian/setujui`, "POST", {})).status, 403);
  assert.equal((await request(tech, `/surat-tugas/${st.id}/selesai`, "POST", {})).status, 409);
  await good(head, `/surat-tugas/${st.id}/printer/${excludedLine.id}/pengecualian/setujui`, "POST", {});
  assert.equal((await request(head, `/surat-tugas/${st.id}/printer/${excludedLine.id}/pengecualian/setujui`, "POST", {})).status, 409);
  const stillStored = await good(admin, `/printer/${excluded.id}`);
  assert.equal(stillStored.lokasi_jenis, "gudang");
  assert.equal(stillStored.status, "available");
  const approvedLine = (await good(admin, `/surat-tugas/${st.id}`)).surat_tugas_printer.find((row) => row.id === excludedLine.id);
  assert.ok(approvedLine.pengecualian_diminta_oleh && approvedLine.pengecualian_disetujui_oleh && approvedLine.alasan_pengecualian);
  assert.equal(approvedLine.konfirmasi_keluar_pada, null);
  const history = await good(admin, `/audit-barang?jenis_barang=printer&barang_id=${excluded.id}&event=pengecualian_disetujui`);
  assert.ok(history.items.length > 0);

  await good(tech, `/surat-tugas/${st.id}/ready-to-print`, "POST", {});
  await good(tech, `/surat-tugas/${st.id}/mulai-kerja`, "POST", {});
  await good(tech, `/surat-tugas/${st.id}/serah`, "POST", { printer_line_id: deliveredLine.id });
  await good(tech, `/surat-tugas/${st.id}/serah`, "POST", { printer_line_id: alsoDeliveredLine.id });
  await good(tech, `/surat-tugas/${st.id}/printer/${deliveredLine.id}/hasil`, "PUT", { hasil: "Diserahkan" });
  await good(tech, `/surat-tugas/${st.id}/printer/${alsoDeliveredLine.id}/hasil`, "PUT", { hasil: "Diserahkan" });
  await good(tech, `/surat-tugas/${st.id}/selesai`, "POST", {});
  await good(warehouse, `/surat-tugas/${st.id}/keluar`, "POST", {});
  await good(head, `/surat-tugas/${st.id}/resolve`, "POST", {});
  assert.equal((await good(admin, `/printer/${excluded.id}`)).lokasi_jenis, "gudang");
  assert.equal((await good(admin, `/printer/${delivered.id}`)).lokasi_jenis, "customer");
  assert.equal((await good(admin, `/printer/${alsoDelivered.id}`)).lokasi_jenis, "customer");
  assert.equal((await good(salesAdmin, `/tiket/${ticket.id}`)).siap_review, true);
  await good(salesAdmin, `/tiket/${ticket.id}/resolve`, "POST", {});

  const serviceTicket = await good(salesAdmin, "/tiket", "POST", {
    kategori: "komplain", jenis: "on_site_service", account_id: account.id,
    customer_id: customer.id, sales_id: salesPic.id, printer: [line(delivered)]
  }, 201);
  assert.equal((await request(head, "/surat-tugas", "POST", {
    tiket_id: serviceTicket.id, jenis_tugas: "on_site_service", pic_teknisi_id: pic.id,
    printer: [line(alsoDelivered)]
  })).status, 422);
  const maintenanceTicket = await good(head, "/tiket", "POST", {
    kategori: "maintenance", jenis: "maintenance", account_id: account.id,
    customer_id: customer.id, printer: [line(delivered)]
  }, 201);
  assert.equal((await request(head, "/surat-tugas", "POST", {
    tiket_id: maintenanceTicket.id, jenis_tugas: "maintenance", pic_teknisi_id: pic.id,
    printer: [line(alsoDelivered)]
  })).status, 422);
  for (const [workTicket, jenis] of [[serviceTicket, "on_site_service"], [maintenanceTicket, "maintenance"]]) {
    const task = await good(head, "/surat-tugas", "POST", {
      tiket_id: workTicket.id, jenis_tugas: jenis, pic_teknisi_id: pic.id, printer: [line(delivered)]
    }, 201);
    await good(head, `/surat-tugas/${task.id}/start`, "POST", {});
    await good(tech, `/surat-tugas/${task.id}/ready-to-print`, "POST", {});
    await good(tech, `/surat-tugas/${task.id}/mulai-kerja`, "POST", {});
    await good(tech, `/surat-tugas/${task.id}/printer/${task.surat_tugas_printer[0].id}/hasil`, "PUT", { hasil: "Selesai" });
    await good(tech, `/surat-tugas/${task.id}/selesai`, "POST", {});
    await good(head, `/surat-tugas/${task.id}/resolve`, "POST", {});
    await good(jenis === "maintenance" ? head : salesAdmin, `/tiket/${workTicket.id}/resolve`, "POST", {});
    const stillInstalled = await good(admin, `/printer/${delivered.id}`);
    assert.equal(stillInstalled.lokasi_jenis, "customer");
    assert.equal(stillInstalled.penempatan, "kontrak");
    const audit = await good(admin, `/audit-barang?jenis_barang=printer&barang_id=${delivered.id}&event=${jenis === "maintenance" ? "maintenance_hasil" : "service_hasil"}`);
    assert.ok(audit.items.length > 0);
  }

  for (const jenis of ["on_site_service", "back_up", "maintenance"]) {
    assert.equal((await request(salesAdmin, "/tiket", "POST", {
      kategori: jenis === "maintenance" ? "maintenance" : "komplain", jenis,
      ...(jenis === "back_up" ? { mode: "sementara" } : {}),
      account_id: other.id, customer_id: otherCustomer.id,
      ...(jenis === "maintenance" ? {} : { sales_id: salesPic.id }), printer: [line(delivered)]
    })).status, jenis === "maintenance" ? 403 : 422);
  }
  assert.equal((await request(head, "/tiket", "POST", {
    kategori: "maintenance", jenis: "maintenance", account_id: other.id,
    customer_id: otherCustomer.id, printer: [line(delivered)]
  })).status, 422);

  const makeReturn = () => good(warehouse, "/tiket", "POST", {
    kategori: "inbound", jenis: "return", alasan: "Selesai kontrak", account_id: account.id,
    customer_id: customer.id, printer: [line(delivered)]
  }, 201);
  const makeReturnSt = (returnTicket) => good(warehouse, "/surat-tugas", "POST", {
    tiket_id: returnTicket.id, jenis_tugas: "terima_return", gudang_id: gudang.id,
    pic_warehouse_id: storePic.id, printer: [line(delivered)]
  }, 201);
  const excludedReturn = await makeReturn();
  const excludedInbound = await makeReturnSt(excludedReturn);
  await good(warehouse, `/surat-tugas/${excludedInbound.id}/start`, "POST", {});
  const inboundLine = excludedInbound.surat_tugas_printer[0];
  await good(warehouse, `/surat-tugas/${excludedInbound.id}/printer/${inboundLine.id}/pengecualian`, "POST", { alasan: "Unit belum tiba" });
  await good(head, `/surat-tugas/${excludedInbound.id}/printer/${inboundLine.id}/pengecualian/setujui`, "POST", {});
  assert.equal((await good(admin, `/printer/${delivered.id}`)).lokasi_jenis, "customer");
  await good(warehouse, `/surat-tugas/${excludedInbound.id}/selesai`, "POST", {});
  assert.equal((await good(warehouse, `/tiket/${excludedReturn.id}`)).siap_review, true);
  await good(warehouse, `/tiket/${excludedReturn.id}/resolve`, "POST", {});
  assert.equal((await good(admin, `/printer/${delivered.id}`)).lokasi_jenis, "customer");

  const returned = await makeReturn();
  const returnSt = await makeReturnSt(returned);
  await good(warehouse, `/surat-tugas/${returnSt.id}/start`, "POST", {});
  await good(warehouse, `/surat-tugas/${returnSt.id}/terima`, "POST", {});
  await good(warehouse, `/surat-tugas/${returnSt.id}/selesai`, "POST", {});
  await good(warehouse, `/tiket/${returned.id}/resolve`, "POST", {});
  assert.equal((await good(admin, `/printer/${delivered.id}`)).kondisi, "checking");

  const repairTicket = await good(head, "/tiket", "POST", { kategori: "internal", jenis: "repair", printer: [line(delivered)] }, 201);
  const repair = await good(head, "/surat-tugas", "POST", {
    tiket_id: repairTicket.id, jenis_tugas: "repair", pic_teknisi_id: pic.id, printer: [line(delivered)]
  }, 201);
  await good(head, `/surat-tugas/${repair.id}/start`, "POST", {});
  await good(tech, `/surat-tugas/${repair.id}/mulai-kerja`, "POST", {});
  await good(tech, `/surat-tugas/${repair.id}/ready-to-print`, "POST", {});
  assert.equal((await request(tech, `/surat-tugas/${repair.id}/printer/${repair.surat_tugas_printer[0].id}/hasil`, "PUT", { hasil: "Diperbaiki", kondisi_hasil: "ready" })).status, 422);
  await good(tech, `/surat-tugas/${repair.id}/printer/${repair.surat_tugas_printer[0].id}/hasil`, "PUT", { hasil: "Diperbaiki" });
  await good(tech, `/surat-tugas/${repair.id}/selesai`, "POST", {});
  await good(head, `/surat-tugas/${repair.id}/resolve`, "POST", {});
  await good(head, `/tiket/${repairTicket.id}/resolve`, "POST", {});
  assert.equal((await good(admin, `/printer/${delivered.id}`)).kondisi, "checking");

  const qcTicket = await good(head, "/tiket", "POST", { kategori: "internal", jenis: "qc", printer: [line(delivered)] }, 201);
  const qc = await good(head, "/surat-tugas", "POST", {
    tiket_id: qcTicket.id, jenis_tugas: "qc", pic_teknisi_id: pic.id, printer: [line(delivered)]
  }, 201);
  await good(head, `/surat-tugas/${qc.id}/start`, "POST", {});
  await good(tech, `/surat-tugas/${qc.id}/mulai-kerja`, "POST", {});
  await good(tech, `/surat-tugas/${qc.id}/ready-to-print`, "POST", {});
  await good(tech, `/surat-tugas/${qc.id}/printer/${qc.surat_tugas_printer[0].id}/hasil`, "PUT", { hasil: "Lulus", kondisi_hasil: "ready" });
  await good(tech, `/surat-tugas/${qc.id}/selesai`, "POST", {});
  await good(head, `/surat-tugas/${qc.id}/resolve`, "POST", {});
  await good(head, `/tiket/${qcTicket.id}/resolve`, "POST", {});
  assert.equal((await good(admin, `/printer/${delivered.id}`)).kondisi, "ready");
});
