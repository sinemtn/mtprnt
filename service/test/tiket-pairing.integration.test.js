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
  return { status: response.status, data: payload.data, message: payload.pesan, detail: payload.detail };
}

async function good(token, path, method = "GET", body, expected = 200) {
  const result = await request(token, path, method, body);
  assert.equal(result.status, expected, `${method} ${path}: ${result.message} ${JSON.stringify(result.detail || "")}`);
  return result.data;
}

test("all ticket kinds create only their matching work orders", { skip: !enabled && "Set TEST_API_BASE and TEST_DISPOSABLE_DB=1 for a disposable database." }, async (t) => {
  const tokens = {};
  for (const name of ["admin", "sales-admin", "kepala-teknisi", "teknisi", "warehouse"]) {
    tokens[name] = (await good(null, "/auth/masuk", "POST", { username: name, kata_sandi: process.env.TEST_PASSWORD || "Admin123" })).token;
  }
  const admin = tokens.admin;
  const [accounts, customers, users, warehouses, models, printers, contracts] = await Promise.all([
    good(admin, "/account?batas=100"), good(admin, "/account/lokasi-customer?batas=100"),
    good(admin, "/pengguna?batas=100"), good(admin, "/gudang?batas=100"),
    good(admin, "/printer-model?batas=100"), good(admin, "/printer?cari=DEMO-M404-TERPASANG"),
    good(admin, "/kontrak?batas=100")
  ]);
  const account = accounts.items.find((row) => row.kode_account === "DEMO-ACCOUNT");
  const customer = customers.items.find((row) => row.kode_customer === "DEMO-JAKARTA");
  const gudang = warehouses.items.find((row) => row.kode_gudang === "DEMO-GDG-UTAMA");
  const model = models.items.find((row) => row.kode_model === "DEMO-M404");
  const installed = printers.items.find((row) => row.mp_no === "DEMO-M404-TERPASANG");
  const contract = contracts.items.find((row) => row.nomor_kontrak === "DEMO-KONTRAK-001");
  const sales = users.items.find((row) => (row.role || row.peran) === "sales" && (row.active ?? row.aktif));
  const technician = users.items.find((row) => (row.role || row.peran) === "teknisi" && (row.active ?? row.aktif));
  const warehouse = users.items.find((row) => (row.role || row.peran) === "warehouse" && (row.active ?? row.aktif));
  assert.ok(account && customer && gudang && model && installed && contract && sales && technician && warehouse,
    `Seed demo is required: ${JSON.stringify({ account: !!account, customer: !!customer, gudang: !!gudang, model: !!model, installed: !!installed, contract: !!contract, sales: !!sales, technician: !!technician, warehouse: !!warehouse })}`);

  const suffix = Date.now().toString(36).toUpperCase();
  let serial = 0;
  async function newUnit() {
    serial += 1;
    return good(admin, "/printer", "POST", {
      mp_no: `PAIR-${suffix}-${serial}`, model_id: model.id, gudang_id: gudang.id,
      alasan: "Fixture uji pasangan tiket dan ST"
    }, 201);
  }
  const line = (unit, peran = "utama") => ({ printer_id: unit.id, mp_no: unit.mp_no, peran });
  const customerFields = { account_id: account.id, customer_id: customer.id };
  const salesFields = { ...customerFields, sales_id: sales.id };
  const due = new Date(Date.now() + 7 * 86400000).toISOString();

  const cases = [
    { kategori: "delivery", jenis: "kontrak", tasks: ["kirim_kontrak"], ticket: { ...salesFields, mode: "baru" }, outbound: true },
    { kategori: "delivery", jenis: "trial", tasks: ["kirim_trial"], ticket: { ...salesFields, tanggal_akhir: due }, outbound: true },
    { kategori: "delivery", jenis: "stand_by", tasks: ["kirim_stand_by"], ticket: salesFields, outbound: true },
    { kategori: "delivery", jenis: "event", tasks: ["kirim_event"], ticket: { ...salesFields, tanggal_akhir: due }, outbound: true },
    { kategori: "delivery", jenis: "sell", tasks: ["kirim_sell"], ticket: salesFields, outbound: true },
    { kategori: "delivery", jenis: "toner_purchase", tasks: ["kirim_toner"], ticket: salesFields },
    { kategori: "komplain", jenis: "on_site_service", tasks: ["on_site_service"], ticket: { ...salesFields, printer: [line(installed)] }, installed: true },
    { kategori: "komplain", jenis: "back_up", tasks: ["kirim_back_up", "terima_unit_rusak"], ticket: { ...salesFields, mode: "sementara", printer: [line(installed)] }, outbound: true },
    { kategori: "internal", jenis: "repair", tasks: ["repair"], warehouseUnit: true },
    { kategori: "internal", jenis: "qc", tasks: ["qc"], warehouseUnit: true },
    { kategori: "internal", jenis: "internal_use", tasks: ["internal_use"], warehouseUnit: true, outbound: true, location: "Divisi Uji" },
    { kategori: "inbound", jenis: "return", tasks: ["terima_return"], ticket: { ...customerFields, alasan: "Akhir pemakaian", printer: [line(installed)] }, installed: true },
    { kategori: "inbound", jenis: "penerimaan_printer", tasks: ["terima_printer_baru"], incoming: true },
    { kategori: "maintenance", jenis: "maintenance", tasks: ["maintenance"], ticket: { ...customerFields, printer: [line(installed)] }, installed: true }
  ];

  let activeComplaintTicket = null;
  for (const scenario of cases) {
    await t.test(`${scenario.kategori} / ${scenario.jenis}`, async () => {
      const unit = scenario.outbound || scenario.warehouseUnit ? await newUnit() : null;
      const incoming = scenario.incoming ? [1, 2].map((n) => ({
        mp_no: `PAIR-IN-${suffix}-${n}`, model_id: model.id, sumber: "Pemasok uji"
      })) : null;
      const owner = { delivery: "sales-admin", komplain: "sales-admin", internal: "kepala-teknisi", inbound: "warehouse", maintenance: "kepala-teknisi" }[scenario.kategori];
      const ticketBody = {
        kategori: scenario.kategori, jenis: scenario.jenis,
        ...(scenario.ticket || {}),
        ...(scenario.warehouseUnit ? { printer: [line(unit)] } : {}),
        ...(scenario.location ? { lokasi_internal: scenario.location } : {}),
        ...(incoming ? { printer: incoming } : {})
      };
      if (scenario.jenis === "return") {
        const separateReturn = await request(tokens.warehouse, "/tiket", "POST", ticketBody);
        assert.equal(separateReturn.status, 409, "Return terpisah harus ditolak saat Komplain aktif.");
        const linkedReturn = await good(tokens.warehouse, "/surat-tugas", "POST", {
          tiket_id: activeComplaintTicket.id, jenis_tugas: "terima_return", gudang_id: gudang.id,
          pic_warehouse_id: warehouse.id, printer: [line(installed)]
        }, 201);
        assert.equal(linkedReturn.tiket_id, activeComplaintTicket.id);
        return;
      }
      const ticket = await good(tokens[owner], "/tiket", "POST", ticketBody, 201);
      if (scenario.jenis === "on_site_service") activeComplaintTicket = ticket;
      assert.equal(ticket.status, "new");
      const wrong = await request(tokens["kepala-teknisi"], "/surat-tugas", "POST", {
        tiket_id: ticket.id, jenis_tugas: scenario.jenis === "event" ? "kirim_trial" : "kirim_event", gudang_id: gudang.id,
        pic_teknisi_id: technician.id, printer: [line(unit || installed)]
      });
      assert.equal(wrong.status, 422, `Wrong ST accepted for ${scenario.jenis}: ${wrong.message}`);

      for (const task of scenario.tasks) {
        const inbound = task.startsWith("terima_");
        const taskUnit = task === "terima_unit_rusak" ? installed : scenario.installed ? installed : unit;
        const printerLines = incoming || (task === "kirim_toner" ? [] : [line(taskUnit, task === "kirim_back_up" ? "pengganti" : "utama")]);
        const st = await good(tokens[inbound ? "warehouse" : "kepala-teknisi"], "/surat-tugas", "POST", {
          tiket_id: ticket.id, jenis_tugas: task,
          ...(task === "kirim_toner" || scenario.outbound || inbound ? { gudang_id: gudang.id } : {}),
          ...(inbound ? { pic_warehouse_id: warehouse.id } : { pic_teknisi_id: technician.id }),
          printer: printerLines
        }, 201);
        assert.equal(st.jenis_tugas, task);
        assert.equal(st.tiket_id, ticket.id);
        assert.equal(st.status, "pending");
        assert.equal(st.surat_tugas_printer.length, printerLines.length);
        if (scenario.incoming) {
          assert.equal((await good(tokens.warehouse, `/surat-tugas/${st.id}/start`, "POST", {})).status, "progress");
          const first = await good(tokens.warehouse, `/surat-tugas/${st.id}/terima`, "POST", { printer_line_id: st.surat_tugas_printer[0].id });
          assert.equal(first.status, "progress", "Penerimaan sebagian belum memvalidasi seluruh ST.");
          assert.equal((await request(tokens.warehouse, `/surat-tugas/${st.id}/terima`, "POST", { printer_line_id: st.surat_tugas_printer[0].id })).status, 409);
          assert.equal((await good(tokens.warehouse, `/surat-tugas/${st.id}/terima`, "POST", { printer_line_id: st.surat_tugas_printer[1].id })).status, "warehouse_validated");
          assert.equal((await good(tokens.warehouse, `/surat-tugas/${st.id}/selesai`, "POST", {})).status, "solved");
          assert.equal((await good(tokens.warehouse, `/tiket/${ticket.id}/resolve`, "POST", {})).status, "solved");
          for (const printer of incoming) {
            const result = await good(admin, `/printer?cari=${printer.mp_no}`);
            assert.equal(result.items[0]?.kondisi, "checking");
          }
        }
        if (scenario.jenis === "repair") {
          await good(tokens["kepala-teknisi"], `/surat-tugas/${st.id}/start`, "POST", {});
          const beforeWork = await good(admin, `/printer?cari=${unit.mp_no}`);
          assert.equal(beforeWork.items[0].kondisi, "ready", "Buka ST belum mengubah kondisi aset.");
          await good(tokens.teknisi, `/surat-tugas/${st.id}/mulai-kerja`, "POST", {});
          const duringWork = await good(admin, `/printer?cari=${unit.mp_no}`);
          assert.equal(duringWork.items[0].kondisi, "in_repair");
          const lineId = st.surat_tugas_printer[0].id;
          await good(tokens.teknisi, `/surat-tugas/${st.id}/printer/${lineId}/hasil`, "PUT", { hasil: "tertunda", alasan: "Menunggu komponen" });
          await good(tokens.teknisi, `/surat-tugas/${st.id}/ready-to-print`, "POST", {});
          assert.equal((await request(tokens.teknisi, `/surat-tugas/${st.id}/selesai`, "POST", {})).status, 409);
          assert.equal((await request(tokens.teknisi, `/surat-tugas/${st.id}/printer/${lineId}/hasil`, "PUT", { hasil: "selesai", kondisi_hasil: "ready" })).status, 422);
          await good(tokens.teknisi, `/surat-tugas/${st.id}/printer/${lineId}/hasil`, "PUT", { hasil: "selesai" });
          await good(tokens.teknisi, `/surat-tugas/${st.id}/selesai`, "POST", {});
          await good(tokens["kepala-teknisi"], `/surat-tugas/${st.id}/resolve`, "POST", {});
          assert.equal((await good(admin, `/printer/${unit.id}`)).kondisi, "checking", "Repair menunggu QC sebelum READY.");
          const reviewed = await good(tokens["kepala-teknisi"], `/tiket/${ticket.id}`);
          assert.notEqual(reviewed.status, "solved", "Tiket menunggu review setelah ST selesai.");
          assert.equal(reviewed.siap_review, true);
          await good(tokens["kepala-teknisi"], `/tiket/${ticket.id}/resolve`, "POST", {});
        }
        if (["on_site_service", "maintenance"].includes(scenario.jenis)) {
          await good(tokens["kepala-teknisi"], `/surat-tugas/${st.id}/start`, "POST", {});
          await good(tokens.teknisi, `/surat-tugas/${st.id}/ready-to-print`, "POST", {});
          await good(tokens.teknisi, `/surat-tugas/${st.id}/mulai-kerja`, "POST", {});
          await good(tokens.teknisi, `/surat-tugas/${st.id}/printer/${st.surat_tugas_printer[0].id}/hasil`, "PUT", { hasil: "Selesai tanpa perpindahan" });
          await good(tokens.teknisi, `/surat-tugas/${st.id}/selesai`, "POST", {});
          await good(tokens["kepala-teknisi"], `/surat-tugas/${st.id}/resolve`, "POST", {});
          assert.equal((await good(admin, `/printer/${installed.id}`)).lokasi_jenis, "customer");
          const event = scenario.jenis === "maintenance" ? "maintenance_hasil" : "service_hasil";
          const history = await good(admin, `/audit-barang?jenis_barang=printer&barang_id=${installed.id}&event=${event}`);
          assert.ok(history.items.some((row) => row.referensi?.id === st.id || row.keterangan?.includes(installed.mp_no)));
        }
      }
      const detail = await good(tokens[owner], `/tiket/${ticket.id}`);
      assert.deepEqual(detail.surat_tugas.map((row) => row.jenis_tugas).sort(), [...scenario.tasks].sort());
    });
  }

  let installedForBackup = null;
  await t.test("multi-unit delivery confirms each physical handover", async () => {
    const units = [await newUnit(), await newUnit()];
    const ticket = await good(tokens["sales-admin"], "/tiket", "POST", {
      kategori: "delivery", jenis: "kontrak", mode: "baru", ...salesFields
    }, 201);
    const st = await good(tokens["kepala-teknisi"], "/surat-tugas", "POST", {
      tiket_id: ticket.id, jenis_tugas: "kirim_kontrak", gudang_id: gudang.id,
      pic_teknisi_id: technician.id, printer: units.map((unit) => line(unit))
    }, 201);
    await good(tokens["kepala-teknisi"], `/surat-tugas/${st.id}/start`, "POST", {});
    await good(tokens.teknisi, `/surat-tugas/${st.id}/ready-to-print`, "POST", {});
    assert.equal((await request(tokens.teknisi, `/surat-tugas/${st.id}/serah`, "POST", {})).status, 422);
    const first = await good(tokens.teknisi, `/surat-tugas/${st.id}/serah`, "POST", { printer_line_id: st.surat_tugas_printer[0].id });
    assert.equal(first.konfirmasi_serah_pada, null);
    assert.equal((await request(tokens.teknisi, `/surat-tugas/${st.id}/serah`, "POST", { printer_line_id: st.surat_tugas_printer[0].id })).status, 409);
    assert.equal((await good(admin, `/printer/${units[0].id}`)).lokasi_jenis, "gudang");
    const second = await good(tokens.teknisi, `/surat-tugas/${st.id}/serah`, "POST", { printer_line_id: st.surat_tugas_printer[1].id });
    assert.ok(second.konfirmasi_serah_pada);
    await good(tokens.teknisi, `/surat-tugas/${st.id}/mulai-kerja`, "POST", {});
    for (const row of st.surat_tugas_printer) {
      await good(tokens.teknisi, `/surat-tugas/${st.id}/printer/${row.id}/hasil`, "PUT", { hasil: "Diserahkan" });
    }
    await good(tokens.teknisi, `/surat-tugas/${st.id}/selesai`, "POST", {});
    await good(tokens.warehouse, `/surat-tugas/${st.id}/keluar`, "POST", {});
    await good(tokens["kepala-teknisi"], `/surat-tugas/${st.id}/resolve`, "POST", {});
    assert.equal((await good(admin, `/printer/${units[0].id}`)).lokasi_jenis, "customer");
    assert.equal((await good(admin, `/tiket/${ticket.id}`)).status, "progress");
    await good(tokens["sales-admin"], `/tiket/${ticket.id}/resolve`, "POST", {});
    installedForBackup = units[0];
  });

  await t.test("BACK-UP reminder follows physical receipt, not assumed warehouse location", async () => {
    const replacement = await newUnit();
    const ticket = await good(tokens["sales-admin"], "/tiket", "POST", {
      kategori: "komplain", jenis: "back_up", mode: "sementara", ...salesFields,
      printer: [line(installedForBackup)]
    }, 201);
    const outbound = await good(tokens["kepala-teknisi"], "/surat-tugas", "POST", {
      tiket_id: ticket.id, jenis_tugas: "kirim_back_up", gudang_id: gudang.id,
      pic_teknisi_id: technician.id, printer: [line(replacement, "pengganti")]
    }, 201);
    await good(tokens["kepala-teknisi"], `/surat-tugas/${outbound.id}/start`, "POST", {});
    await good(tokens.teknisi, `/surat-tugas/${outbound.id}/ready-to-print`, "POST", {});
    await good(tokens.teknisi, `/surat-tugas/${outbound.id}/serah`, "POST", {
      tanggal_aktual: new Date(Date.now() - 4 * 86400000).toISOString()
    });
    const reminders = await good(admin, "/surat-tugas/reminder-backup");
    assert.ok(reminders.some((item) => item.nomor_surat_tugas === outbound.id));
    assert.equal((await good(admin, `/printer/${installedForBackup.id}`)).lokasi_jenis, "customer");
    const inbound = await good(tokens.warehouse, "/surat-tugas", "POST", {
      tiket_id: ticket.id, jenis_tugas: "terima_unit_rusak", gudang_id: gudang.id,
      pic_warehouse_id: warehouse.id, printer: [line(installedForBackup)]
    }, 201);
    await good(tokens.warehouse, `/surat-tugas/${inbound.id}/start`, "POST", {});
    await good(tokens.warehouse, `/surat-tugas/${inbound.id}/terima`, "POST", {});
    assert.equal((await good(admin, `/printer/${installedForBackup.id}`)).lokasi_jenis, "gudang");
    assert.ok(!(await good(admin, "/surat-tugas/reminder-backup")).some((item) => item.nomor_surat_tugas === outbound.id));
  });

  await t.test("kontrak tukar requires separate outbound and inbound ST", async () => {
    const replacement = await newUnit();
    const ticket = await good(tokens["sales-admin"], "/tiket", "POST", {
      kategori: "delivery", jenis: "kontrak", mode: "tukar", ...salesFields, kontrak_id: contract.id
    }, 201);
    for (const [task, unit, roleName, peran] of [
      ["kirim_kontrak", replacement, "kepala-teknisi", "utama"],
      ["terima_tukar", installed, "warehouse", "unit_lama"]
    ]) {
      const st = await good(tokens[roleName], "/surat-tugas", "POST", {
        tiket_id: ticket.id, jenis_tugas: task, gudang_id: gudang.id,
        unit_asal_id: installed.id,
        ...(roleName === "warehouse" ? { pic_warehouse_id: warehouse.id } : { pic_teknisi_id: technician.id }),
        printer: [line(unit, peran)]
      }, 201);
      assert.equal(st.jenis_tugas, task);
    }
  });
});
