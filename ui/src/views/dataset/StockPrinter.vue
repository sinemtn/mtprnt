<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { ArrowRightLeft, History, Plus, Search, Undo2, X } from "lucide-vue-next";
import api from "../../services/api";

defineOptions({ inheritAttrs: false });
defineProps({ canManageStock: { type: Boolean, default: false }, isAdmin: { type: Boolean, default: false }, canViewAuditBarang: { type: Boolean, default: false } });
const emit = defineEmits(["open-history"]);
const rows = ref([]);
const categories = ref([]);
const models = ref([]);
const warehouses = ref([]);
const summary = reactive({ gudang: 0, available: 0, reserved: 0, issued: 0, installed: 0 });
const filters = reactive({ cari: "", kategori_id: "", model_id: "", gudang_id: "", lokasi: "stok", status: "", kondisi: "", halaman: 1, batas: 10 });
const activeMetric = ref("");
const total = ref(0);
const busy = ref(false);
const error = ref("");
const modal = ref(null);
const createOpen = ref(false);
const action = reactive({ gudang_id: "", alasan: "" });
const newUnit = reactive({ mp_no: "", serial_number: "", model_id: "", gudang_id: "", tanggal_pembelian: "", interval_maintenance_bulan: "", keterangan: "", alasan: "" });
const filteredModels = computed(() => models.value.filter((item) => !filters.kategori_id || item.kategori_id === filters.kategori_id));
const pages = computed(() => Math.max(1, Math.ceil(total.value / filters.batas)));
const first = computed(() => total.value ? (filters.halaman - 1) * filters.batas + 1 : 0);
const last = computed(() => Math.min(total.value, filters.halaman * filters.batas));

async function load() {
  busy.value = true;
  error.value = "";
  try {
    const [list, counts] = await Promise.all([
      api.get("/printer", { params: Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "")) }),
      api.get("/printer/summary")
    ]);
    rows.value = list.data.data.items;
    total.value = list.data.data.meta.total;
    Object.assign(summary, counts.data.data);
  } catch (caught) {
    error.value = caught.response?.data?.pesan || "Stok printer gagal dimuat.";
  } finally {
    busy.value = false;
  }
}

async function loadOptions() {
  try {
    const [kategori, model, gudang] = await Promise.all([
      api.get("/printer-kategori", { params: { batas: 100 } }),
      api.get("/printer-model", { params: { batas: 100 } }),
      api.get("/gudang", { params: { batas: 100 } })
    ]);
    categories.value = kategori.data.data.items;
    models.value = model.data.data.items;
    warehouses.value = gudang.data.data.items;
  } catch (caught) {
    error.value = caught.response?.data?.pesan || "Filter printer gagal dimuat.";
  }
}

function filterChanged() {
  filters.halaman = 1;
  load();
}

function locationChanged() {
  if (filters.lokasi !== "gudang") filters.gudang_id = "";
  filters.status = "";
  filters.kondisi = "";
  activeMetric.value = "";
  filterChanged();
}

function selectMetric(key) {
  activeMetric.value = activeMetric.value === key ? "" : key;
  const selected = {
    available: ["gudang", "available", "ready"],
    reserved: ["gudang", "reserved", ""],
    issued: ["transit", "", ""],
    installed: ["customer", "", ""]
  }[activeMetric.value] || ["stok", "", ""];
  [filters.lokasi, filters.status, filters.kondisi] = selected;
  filters.gudang_id = "";
  filterChanged();
}

function locationLabel(row) {
  if (row.status === "installed") return `Customer: ${row.master_account?.nama_account || "-"} / ${row.master_customer?.nama_customer || "-"}`;
  if (row.status === "issued") return "Dalam proses surat tugas";
  return `Gudang: ${row.master_gudang?.nama_gudang || "-"}`;
}

function statusLabel(status) {
  return { available: "Tersedia", reserved: "Direservasi", issued: "Keluar gudang", installed: "Di customer" }[status] || status;
}

function open(row, kind) {
  modal.value = { row, kind };
  action.gudang_id = "";
  action.alasan = "";
  error.value = "";
}

function openCreate() {
  Object.assign(newUnit, { mp_no: "", serial_number: "", model_id: "", gudang_id: "", tanggal_pembelian: "", interval_maintenance_bulan: "", keterangan: "", alasan: "" });
  error.value = "";
  createOpen.value = true;
}

async function saveCreate() {
  busy.value = true;
  error.value = "";
  try {
    await api.post("/printer", {
      mp_no: newUnit.mp_no.trim(), serial_number: newUnit.serial_number.trim() || null,
      model_id: newUnit.model_id, gudang_id: newUnit.gudang_id,
      tanggal_pembelian: newUnit.tanggal_pembelian || null,
      interval_maintenance_bulan: newUnit.interval_maintenance_bulan ? Number(newUnit.interval_maintenance_bulan) : null,
      keterangan: newUnit.keterangan.trim() || null, alasan: newUnit.alasan.trim()
    });
    createOpen.value = false;
    Object.assign(filters, { cari: "", kategori_id: "", model_id: "", gudang_id: "", lokasi: "stok", status: "", kondisi: "", halaman: 1 });
    activeMetric.value = "";
    await load();
  } catch (caught) {
    error.value = caught.response?.data?.pesan || "Unit printer gagal ditambahkan.";
  } finally {
    busy.value = false;
  }
}

async function save() {
  if (!modal.value) return;
  busy.value = true;
  error.value = "";
  try {
    await api.post(`/printer/${modal.value.row.id}/${modal.value.kind}`, {
      ...(modal.value.kind === "withdraw" ? {} : { gudang_id: action.gudang_id }),
      alasan: action.alasan.trim()
    });
    modal.value = null;
    await load();
  } catch (caught) {
    error.value = caught.response?.data?.pesan || "Aksi printer gagal disimpan.";
  } finally {
    busy.value = false;
  }
}

function changePage(delta) {
  filters.halaman += delta;
  load();
}

onMounted(() => { loadOptions(); load(); });
</script>

<template>
  <section class="printer-stock">
    <div class="printer-metrics" aria-label="Ringkasan stok printer">
      <button class="printer-metric ready" :class="{ active: activeMetric === 'available' }" type="button" :aria-pressed="activeMetric === 'available'" @click="selectMetric('available')"><span>Siap Kirim</span><strong>{{ summary.available }}</strong></button>
      <button class="printer-metric reserved" :class="{ active: activeMetric === 'reserved' }" type="button" :aria-pressed="activeMetric === 'reserved'" @click="selectMetric('reserved')"><span>Direservasi</span><strong>{{ summary.reserved }}</strong></button>
      <button class="printer-metric transit" :class="{ active: activeMetric === 'issued' }" type="button" :aria-pressed="activeMetric === 'issued'" @click="selectMetric('issued')"><span>Dalam Pengiriman</span><strong>{{ summary.issued }}</strong></button>
      <button class="printer-metric customer" :class="{ active: activeMetric === 'installed' }" type="button" :aria-pressed="activeMetric === 'installed'" @click="selectMetric('installed')"><span>Di Customer</span><strong>{{ summary.installed }}</strong></button>
    </div>
    <div class="toolbar">
      <label class="search-box">
        <Search :size="17" />
        <input v-model="filters.cari" type="search" placeholder="Cari MP No / Serial" @keyup.enter="filterChanged" />
      </label>
      <button v-if="isAdmin" class="primary-button" type="button" @click="openCreate"><Plus :size="16" />Tambah Unit</button>
    </div>
    <div class="printer-filters">
      <select v-model="filters.kategori_id" aria-label="Kategori" @change="filters.model_id = ''; filterChanged()"><option value="">Semua kategori</option><option v-for="row in categories" :key="row.id" :value="row.id">{{ row.nama_kategori }}</option></select>
      <select v-model="filters.model_id" aria-label="Model" @change="filterChanged"><option value="">Semua model</option><option v-for="row in filteredModels" :key="row.id" :value="row.id">{{ row.merek }} {{ row.nama_model }}</option></select>
      <select v-model="filters.lokasi" aria-label="Lokasi printer" @change="locationChanged"><option value="stok">Semua lokasi</option><option value="gudang">Di gudang</option><option value="customer">Di customer</option><option value="transit">Dalam surat tugas</option></select>
      <select v-if="filters.lokasi === 'gudang'" v-model="filters.gudang_id" aria-label="Gudang" @change="filterChanged"><option value="">Semua gudang</option><option v-for="row in warehouses" :key="row.id" :value="row.id">{{ row.nama_gudang }}</option></select>
    </div>
    <p v-if="error && !modal && !createOpen" class="printer-error" role="alert">{{ error }}</p>
    <section class="data-panel">
      <div class="section-heading"><h2>Unit Printer</h2><span>{{ summary.gudang }} di gudang, {{ summary.installed }} di customer</span></div>
      <div class="table-wrap"><table><thead><tr><th>MP No</th><th>Serial</th><th>Kategori</th><th>Model</th><th>Lokasi</th><th>Status</th><th v-if="canManageStock || canViewAuditBarang">Aksi</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
          <td>{{ row.mp_no }}</td><td>{{ row.serial_number || "-" }}</td><td>{{ row.master_printer_model?.master_printer_kategori?.nama_kategori || "-" }}</td><td>{{ row.master_printer_model?.merek }} {{ row.master_printer_model?.nama_model }}</td><td>{{ locationLabel(row) }}</td><td>{{ row.status_operasional || statusLabel(row.status) }}</td>
            <td v-if="canManageStock || canViewAuditBarang"><div class="row-actions">
              <button v-if="canViewAuditBarang" class="icon-action" type="button" title="Riwayat unit" aria-label="Riwayat unit" @click="emit('open-history', row)"><History :size="16" /></button>
              <button v-if="canManageStock && row.status === 'available' && row.lokasi_jenis === 'gudang' && !row.surat_tugas_aktif_id" class="icon-action" type="button" title="Pindah gudang" aria-label="Pindah gudang" @click="open(row, 'transfer')"><ArrowRightLeft :size="16" /></button>
              <button v-if="isAdmin && row.status === 'available' && row.lokasi_jenis === 'gudang' && !row.surat_tugas_aktif_id" class="text-action" type="button" @click="open(row, 'withdraw')">Kurangi Stok</button>
              <button v-if="canManageStock && row.status === 'issued'" class="icon-action" type="button" title="Kembalikan ke gudang" aria-label="Kembalikan ke gudang" @click="open(row, 'return')"><Undo2 :size="16" /></button>
            </div></td>
          </tr>
          <tr v-if="!rows.length"><td :colspan="canManageStock || canViewAuditBarang ? 7 : 6" class="empty-cell">{{ busy ? "Memuat data..." : "Belum ada unit." }}</td></tr>
        </tbody></table></div>
      <div class="pagination-bar"><div class="pagination-size"><select v-model.number="filters.batas" aria-label="Baris per halaman" @change="filterChanged"><option :value="10">10</option><option :value="25">25</option><option :value="50">50</option></select><span>Baris per halaman</span></div><span class="pagination-range">{{ first }}-{{ last }} dari {{ total }} unit</span><div class="pagination-actions"><strong>Halaman {{ filters.halaman }} dari {{ pages }}</strong><button class="secondary-button" type="button" :disabled="filters.halaman <= 1" @click="changePage(-1)">&lsaquo;</button><button class="secondary-button" type="button" :disabled="filters.halaman >= pages" @click="changePage(1)">&rsaquo;</button></div></div>
    </section>
    <div v-if="createOpen" class="modal-backdrop">
      <section class="modal-panel printer-create-modal" role="dialog" aria-modal="true" aria-labelledby="printer-create-title">
        <div class="modal-heading"><div><p class="eyebrow">KOREKSI ADMIN</p><h2 id="printer-create-title">Tambah Unit Printer</h2></div><button class="icon-action" type="button" title="Tutup" aria-label="Tutup" @click="createOpen = false"><X :size="18" /></button></div>
        <form class="printer-create-form" @submit.prevent="saveCreate">
          <p v-if="!models.some((item) => item.aktif && item.master_printer_kategori?.aktif) || !warehouses.some((item) => item.aktif)" class="printer-warning">Lengkapi Model Printer dan Master Gudang aktif sebelum menambah unit.</p>
          <div class="printer-create-grid">
            <label>MP No <span class="required">*</span><input v-model="newUnit.mp_no" maxlength="150" required /></label>
            <label>Serial Number<input v-model="newUnit.serial_number" maxlength="150" /></label>
            <label>Model <span class="required">*</span><select v-model="newUnit.model_id" required><option value="">Pilih model</option><option v-for="row in models.filter((item) => item.aktif && item.master_printer_kategori?.aktif)" :key="row.id" :value="row.id">{{ row.merek }} {{ row.nama_model }}</option></select></label>
            <label>Gudang Awal <span class="required">*</span><select v-model="newUnit.gudang_id" required><option value="">Pilih gudang</option><option v-for="row in warehouses.filter((item) => item.aktif)" :key="row.id" :value="row.id">{{ row.nama_gudang }}</option></select></label>
            <label>Tanggal Pembelian<input v-model="newUnit.tanggal_pembelian" type="date" /></label>
            <label>Interval Maintenance (Bulan)<input v-model="newUnit.interval_maintenance_bulan" type="number" min="1" max="120" step="1" /></label>
            <label class="wide">Keterangan<textarea v-model="newUnit.keterangan" rows="2" /></label>
            <label class="wide">Alasan Penambahan <span class="required">*</span><textarea v-model="newUnit.alasan" rows="2" minlength="3" maxlength="500" required /></label>
          </div>
          <p v-if="error" class="printer-error" role="alert">{{ error }}</p>
          <div class="modal-actions"><button class="secondary-button" type="button" @click="createOpen = false">Batal</button><button class="primary-button" type="submit" :disabled="busy">Simpan</button></div>
        </form>
      </section>
    </div>
    <div v-if="modal" class="modal-backdrop"><section class="modal-panel printer-action-modal" role="dialog" aria-modal="true"><div class="modal-heading"><div><p class="eyebrow">{{ modal.row.mp_no }}</p><h2>{{ modal.kind === 'transfer' ? 'Pindah Gudang' : modal.kind === 'return' ? 'Kembalikan Unit' : 'Kurangi Stok' }}</h2></div><button class="icon-action" type="button" title="Tutup" @click="modal = null"><X :size="18" /></button></div><form class="data-form" @submit.prevent="save"><label v-if="modal.kind !== 'withdraw'"><span>Gudang Tujuan</span><select v-model="action.gudang_id" required><option value="">Pilih gudang</option><option v-for="row in warehouses.filter((item) => item.aktif && item.id !== modal.row.gudang_id)" :key="row.id" :value="row.id">{{ row.nama_gudang }}</option></select></label><p v-if="modal.kind === 'withdraw'" class="printer-warning">Unit akan dikeluarkan dari stok dan dinonaktifkan.</p><label><span>Alasan</span><textarea v-model="action.alasan" rows="3" :minlength="modal.kind === 'withdraw' ? 3 : 1" required /></label><p v-if="error" class="printer-error" role="alert">{{ error }}</p><div class="modal-actions"><button class="secondary-button" type="button" @click="modal = null">Batal</button><button class="primary-button" type="submit" :disabled="busy">{{ modal.kind === 'withdraw' ? 'Kurangi Stok' : 'Simpan' }}</button></div></form></section></div>
  </section>
</template>

<style scoped>
.printer-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
.printer-metric { min-width: 0; min-height: 86px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 7px; padding: 12px 16px; border: 1px solid #29364d; border-radius: 6px; color: #e5edf8; background: #0d1628; text-align: left; cursor: pointer; }
.printer-metric span { color: #a8b8ce; font-size: 12px; }
.printer-metric strong { font-size: 22px; line-height: 1; }
.printer-metric.ready strong { color: #41d7a5; }
.printer-metric.reserved strong { color: #8bbcff; }
.printer-metric.transit strong { color: #f4bf73; }
.printer-metric.customer strong { color: #b1d1ec; }
.printer-metric:hover, .printer-metric.active, .printer-metric:focus-visible { border-color: #48a4ce; outline: none; }
.printer-stock .search-box { width: 100%; max-width: none; flex: 1 1 280px; }
.printer-filters { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 16px; }
.printer-filters select { min-width: 150px; max-width: 240px; flex: 1 1 150px; min-height: 40px; padding: 0 12px; color: #f8fafc; background: #0d1628; border: 1px solid #29364d; border-radius: 6px; }
.printer-action-modal { max-width: 480px; height: auto; max-height: 82vh; }
.printer-action-modal .data-form { grid-template-columns: 1fr; }
.printer-create-modal { width: min(100%, 620px); height: min(80vh, 690px); }
.printer-create-modal .modal-heading h2 { font-size: 20px; }
.printer-create-form { min-height: 0; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; padding: 16px 18px; }
.printer-create-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.printer-create-grid label { min-width: 0; color: #cbd5e1; font-size: 12px; font-weight: 600; }
.printer-create-grid .wide { grid-column: 1 / -1; }
.printer-create-grid input, .printer-create-grid select, .printer-create-grid textarea { display: block; width: 100%; min-height: 38px; margin-top: 6px; padding: 8px 10px; border: 1px solid #334155; border-radius: 6px; color: #f8fafc; background: #0e192b; font: inherit; font-size: 13px; }
.printer-create-grid textarea { min-height: 58px; resize: vertical; }
.printer-create-grid input:focus, .printer-create-grid select:focus, .printer-create-grid textarea:focus { border-color: #27a4cc; outline: 2px solid rgba(39, 164, 204, 0.18); }
.printer-create-form .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 0; }
.required { color: #fb7185; }
.printer-warning { margin: 0; padding: 10px 12px; border: 1px solid #854555; border-radius: 6px; color: #ffc6d0; background: #271522; font-size: 12px; }
.printer-error { color: #fb7185; margin: 12px 0; }
@media (max-width: 760px) { .printer-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .printer-create-grid { grid-template-columns: 1fr; } .printer-create-grid .wide { grid-column: auto; } }
@media (max-width: 420px) { .printer-metrics { gap: 7px; } .printer-metric { padding: 10px; } .printer-metric strong { font-size: 20px; } }
</style>
