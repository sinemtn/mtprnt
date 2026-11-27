const { test } = require("node:test");
const assert = require("node:assert/strict");

const base = process.env.TEST_API_BASE;

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
  const result = await request(token, path, method, body);
  assert.equal(result.status, expected, `${method} ${path}: ${result.message}`);
  return result.data;
}

async function login(username) {
  const data = await good(null, "/auth/masuk", "POST", { username, kata_sandi: process.env.TEST_PASSWORD || "Admin123" });
  return data.token;
}

test("Delivery: six ticket kinds, ST validation, print-ready and stock movement", { skip: !base && "Use a disposable API and set TEST_API_BASE." }, async (t) => {
  const [admin, salesAdmin, head, technician, warehouse] = await Promise.all([
    login("admin"), login("sales-admin"), login("kepala-teknisi"), login("teknisi"), login("warehouse")
  ]);
  const suffix = Date.now().toString(36).toUpperCase();
  const account = await good(admin, "/account", "POST", {
    kode_account: `A-${suffix}`, nama_account: "Delivery integration",
    customer_pertama: { kode_customer: `C-${suffix}`, nama_customer: "Delivery site", alamat: "Jl. Test No. 1" }
  }, 201);
  const customer = account.master_customer[0];
  const gudang = await good(admin, "/gudang", "POST", {
    kode_gudang: `G-${suffix}`, nama_gudang: "Delivery test warehouse", jenis_gudang: "utama"
  }, 201);
  const kategori = await good(admin, "/printer-kategori", "POST", {
    kode_kategori: `K-${suffix}`, nama_kategori: "Delivery test category"
  }, 201);
  const model = await good(admin, "/printer-model", "POST", {
    kategori_id: kategori.id, kode_model: `M-${suffix}`, merek: "Test", nama_model: "Delivery test model"
  }, 201);
  const toner = await good(admin, "/toner", "POST", {
    kode_toner: `T-${suffix}`, nama_toner: "Delivery test toner", warna: "Hitam", tipe: "Laser"
  }, 201);
  const users = (await good(admin, "/pengguna?batas=100")).items;
  const pic = users.find((row) => (row.role || row.peran) === "teknisi" && (row.active ?? row.aktif));
  const sales = users.find((row) => (row.role || row.peran) === "sales" && (row.active ?? row.aktif));
  assert.ok(pic && sales, "Seed users Sales and Teknisi are required.");

  await good(warehouse, "/stok/mutasi", "POST", {
    jenis_mutasi: "masuk", gudang_tujuan_id: gudang.id, langsung_posting: true,
    detail: [{ jenis_barang: "toner", toner_id: toner.id, jumlah: 10 }]
  }, 201);
  const cases = [
    ["kontrak", "kirim_kontrak", "kontrak"],
    ["trial", "kirim_trial", "trial"],
    ["stand_by", "kirim_stand_by", "stand_by"],
    ["event", "kirim_event", "event"],
    ["sell", "kirim_sell", "sold"],
    ["toner_purchase", "kirim_toner", null]
  ];
  for (const [kind, task, placement] of cases) {
    await t.test(kind, async () => {
      const unit = placement ? await good(admin, "/printer", "POST", {
        mp_no: `MP-${kind}-${suffix}`, model_id: model.id, gudang_id: gudang.id,
        alasan: "Fixture delivery integration"
      }, 201) : null;
      const dates = ["trial", "event"].includes(kind) ? { tanggal_akhir: new Date(Date.now() + 86400000).toISOString() } : {};
      const ticket = await good(salesAdmin, "/tiket", "POST", {
        kategori: "delivery", jenis: kind, account_id: account.id, customer_id: customer.id,
        sales_id: sales.id, ...(kind === "kontrak" ? { mode: "baru" } : {}), ...dates
      }, 201);
      assert.equal(ticket.status, "new");
      assert.equal((await request(warehouse, "/tiket", "POST", {
        kategori: "delivery", jenis: kind, account_id: account.id, customer_id: customer.id, sales_id: sales.id
      })).status, 403);
      const payload = {
        tiket_id: ticket.id, jenis_tugas: task, gudang_id: gudang.id,
        pic_teknisi_id: pic.id,
        printer: unit ? [{ printer_id: unit.id, mp_no: unit.mp_no }] : []
      };
      assert.equal((await request(salesAdmin, "/surat-tugas", "POST", payload)).status, 403);
      const st = await good(head, "/surat-tugas", "POST", payload, 201);
      assert.equal(st.status, "pending");
      assert.equal((await good(salesAdmin, `/tiket/${ticket.id}`)).status, "progress");
      assert.equal((await request(salesAdmin, `/tiket/${ticket.id}/resolve`, "POST", {})).status, 409);
      if (unit) assert.equal((await good(admin, `/printer/${unit.id}`)).status, "reserved");

      assert.equal((await good(head, `/surat-tugas/${st.id}/start`, "POST", {})).status, "progress");
      if (kind === "toner_purchase") {
        await good(technician, `/surat-tugas/${st.id}/pemakaian`, "POST", {
          gudang_id: gudang.id, jenis_barang: "toner", toner_id: toner.id, jumlah_pakai: 2
        }, 201);
        const shortage = await request(technician, `/surat-tugas/${st.id}/pemakaian`, "POST", {
          gudang_id: gudang.id, jenis_barang: "toner", toner_id: toner.id, jumlah_pakai: 20
        });
        assert.equal(shortage.status, 422);
        assert.match(shortage.message, /Delivery test toner.*Delivery test warehouse.*Diminta 20, dapat dialokasikan 8/);
      }
      assert.equal((await good(technician, `/surat-tugas/${st.id}/ready-to-print`, "POST", {})).status, "ready_to_print");
      const printable = await good(head, `/surat-tugas/${st.id}`);
      assert.equal(printable.status, "ready_to_print");
      assert.equal(printable.konfirmasi_serah_pada, null);
      assert.equal(printable.validasi_warehouse_pada, null);
      assert.equal((await request(warehouse, `/surat-tugas/${st.id}/keluar`, "POST", {})).status, 409);
      await good(technician, `/surat-tugas/${st.id}/serah`, "POST", {});
      for (const line of printable.surat_tugas_printer) {
        await good(technician, `/surat-tugas/${st.id}/printer/${line.id}/hasil`, "PUT", { hasil: "Diserahkan" });
      }
      assert.equal((await request(technician, `/surat-tugas/${st.id}/selesai`, "POST", {})).status, 409);
      await good(technician, `/surat-tugas/${st.id}/mulai-kerja`, "POST", {});
      assert.equal((await good(technician, `/surat-tugas/${st.id}/selesai`, "POST", {})).status, "technician_completed");
      assert.equal((await request(head, `/surat-tugas/${st.id}/resolve`, "POST", {})).status, 409);
      assert.equal((await good(warehouse, `/surat-tugas/${st.id}/keluar`, "POST", {})).status, "warehouse_validated");
      assert.equal((await request(warehouse, `/surat-tugas/${st.id}/keluar`, "POST", {})).status, 409);
      assert.equal((await good(head, `/surat-tugas/${st.id}/resolve`, "POST", {})).status, "solved");
      if (kind === "trial") await good(salesAdmin, `/tiket/${ticket.id}`, "PUT", { hasil: "berhasil" });
      assert.equal((await good(salesAdmin, `/tiket/${ticket.id}/resolve`, "POST", {})).status, "solved");
      const finalSt = await good(admin, `/surat-tugas/${st.id}`);
      assert.ok(finalSt.validasi_warehouse_pada && finalSt.validasi_kepala_teknisi_pada);
      if (unit) {
        const placed = await good(admin, `/printer/${unit.id}`);
        assert.equal(placed.penempatan, placement);
        assert.equal(placed.lokasi_jenis, "customer");
      }
    });
  }
  const stock = await good(admin, "/stok");
  const balance = stock.toner.find((row) => row.master_toner?.id === toner.id && row.master_gudang?.id === gudang.id);
  assert.ok(balance, "Saldo toner di gudang uji harus tersedia.");
  assert.equal(Number(balance.jumlah_tersedia), 8);
  assert.equal(Number(balance.jumlah_dicadangkan), 0);
});
