<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { Plus, Search, X } from "lucide-vue-next";
import api from "../../services/api";

const props = defineProps({ role: { type: String, default: "" } });
const emit = defineEmits(["open-surat", "open-legacy"]);
const catalog = ref({});
const rows = ref([]);
const total = ref(0);
const page = ref(1);
const limit = ref(10);
const search = ref("");
const category = ref("");
const status = ref("");
const busy = ref(false);
const error = ref("");
const message = ref("");
const modal = ref(false);
const tab = ref("general");
const selected = ref(null);
const accounts = ref([]);
const customers = ref([]);
const printers = ref([]);
const printerSearch = ref("");
const toners = ref([]);
const models = ref([]);
const sales = ref([]);
const contracts = ref([]);
const optionsReady = ref(false);
const form = reactive({ kategori: "", jenis: "", account_id: "", customer_id: "", sales_id: "", mode: "", kontrak_id: "", tiket_asal_id: "", tanggal_transaksi: "", tanggal_akhir: "", lokasi_internal: "", deskripsi: "", alasan: "", hasil: "", printer_ids: [], printer_utama_id: "", printer_pengganti_id: "", printer_lama_id: "", toner_id: "", jumlah: 1, newPrinters: [{ mp_no: "", model_id: "", sumber: "" }] });

const categoryNames = { delivery: "Delivery", komplain: "Komplain", internal: "Internal", inbound: "Inbound", maintenance: "Maintenance" };
const kindNames = { kontrak: "Kontrak", trial: "Trial", stand_by: "Stand-by", event: "Event", sell: "Sell", toner_purchase: "Toner Purchase", on_site_service: "On-site Service", back_up: "Back-up", repair: "Repair", qc: "QC", internal_use: "Internal Use", return: "Return", penerimaan_printer: "Penerimaan Printer", maintenance: "Maintenance" };
const owners = { delivery: "sales_admin", komplain: "sales_admin", internal: "kepala_teknisi", inbound: "warehouse", maintenance: "kepala_teknisi" };
const normalizedRole = computed(() => String(props.role).replace(/-/g, "_"));
const canCreate = computed(() => normalizedRole.value === "admin" || Object.values(owners).includes(normalizedRole.value));
const canCreateSt = computed(() => ["admin", "kepala_teknisi"].includes(normalizedRole.value) || normalizedRole.value === "warehouse" && (selected.value?.kategori === "inbound" || selected.value?.jenis === "back_up" || selected.value?.jenis === "kontrak" && selected.value?.mode === "tukar"));
const allowedCategories = computed(() => Object.keys(catalog.value).filter((key) => normalizedRole.value === "admin" || owners[key] === normalizedRole.value));
const availableKinds = computed(() => Object.keys(catalog.value[form.kategori] || {}));
const selectedAccountCustomers = computed(() => customers.value.filter((item) => item.account_id === form.account_id && item.aktif));
const availablePrinters = computed(() => printers.value.filter((item) => {
  if (["on_site_service", "maintenance", "return", "back_up"].includes(form.jenis)) return item.lokasi_jenis === "customer" && (!form.customer_id || item.customer_id === form.customer_id);
  if (["repair", "qc"].includes(form.jenis)) return item.lokasi_jenis === "gudang";
  return item.lokasi_jenis === "gudang" && item.kondisi === "ready" && !item.surat_tugas_aktif_id;
}));
const customerRequired = computed(() => ["delivery", "komplain", "maintenance"].includes(form.kategori) || form.jenis === "return");
const dateTimeLocal = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const iso = (value) => value ? new Date(value).toISOString() : undefined;
const errorText = (err) => err.response?.data?.pesan || err.response?.data?.message || err.message || "Permintaan gagal.";
const unit = (id) => printers.value.find((item) => item.id === id);
let printerRequest = 0;
let printerSearchTimer;

async function searchPrinters() {
  const requestId = ++printerRequest;
  try {
    if (["toner_purchase", "penerimaan_printer"].includes(form.jenis)) { printers.value = []; return; }
    const searchParams = { batas: 30, ...(printerSearch.value.trim() ? { cari: printerSearch.value.trim() } : {}) };
    const customerSearch = { ...searchParams, lokasi: "customer", ...(form.customer_id ? { customer_id: form.customer_id } : {}) };
    const warehouseSearch = { ...searchParams, lokasi: "gudang" };
    const sources = ["on_site_service", "maintenance", "return"].includes(form.jenis) || form.tiket_asal_id ? [customerSearch]
      : ["back_up"].includes(form.jenis) || form.jenis === "kontrak" && form.mode === "tukar" ? [customerSearch, { ...warehouseSearch, status: "available", kondisi: "ready", tanpa_reservasi: true }]
      : ["repair", "qc"].includes(form.jenis) ? [warehouseSearch]
      : [{ ...warehouseSearch, status: "available", kondisi: "ready", tanpa_reservasi: true }];
    const responses = await Promise.all(sources.map((params) => api.get("/printer", { params })));
    if (requestId !== printerRequest) return;
    const selectedIds = [
      ...form.printer_ids, form.printer_utama_id, form.printer_pengganti_id, form.printer_lama_id
    ].filter(Boolean);
    const selectedUnits = printers.value.filter((item) => selectedIds.includes(item.id));
    printers.value = [...new Map([...selectedUnits, ...responses.flatMap((response) => response.data.data.items)].map((item) => [item.id, item])).values()];
  } catch (err) { error.value = errorText(err); }
}

watch(printerSearch, () => {
  clearTimeout(printerSearchTimer);
  printerSearchTimer = setTimeout(searchPrinters, 250);
});
watch(() => [form.jenis, form.mode, form.tiket_asal_id, form.kontrak_id], () => {
  form.printer_ids = [];
  form.printer_utama_id = "";
  form.printer_pengganti_id = "";
  form.printer_lama_id = "";
  clearTimeout(printerSearchTimer);
  printerSearchTimer = setTimeout(searchPrinters, 250);
});
watch(() => form.customer_id, (customerId) => {
  if (form.printer_ids[0] && unit(form.printer_ids[0])?.customer_id !== customerId) form.printer_ids = [];
  if (form.printer_utama_id && unit(form.printer_utama_id)?.customer_id !== customerId) form.printer_utama_id = "";
  clearTimeout(printerSearchTimer);
  printerSearchTimer = setTimeout(searchPrinters, 250);
});

function selectUnit(id, field) {
  form[field] = field === "printer_ids" ? (id ? [id] : []) : id;
  const chosen = unit(id);
  if (!chosen || chosen.lokasi_jenis !== "customer") return;
  const customer = customers.value.find((item) => item.id === chosen.customer_id);
  if (!customer) return;
  form.account_id = customer.account_id;
  form.customer_id = customer.id;
}

async function all(endpoint) {
  const result = [];
  for (let halaman = 1; halaman <= 20; halaman++) {
    const response = await api.get(endpoint, { params: { halaman, batas: 100 } });
    const data = response.data.data;
    const chunk = Array.isArray(data) ? data : data?.items || [];
    result.push(...chunk);
    if (Array.isArray(data) || chunk.length < 100 || result.length >= (data?.meta?.total || Infinity)) break;
  }
  return result;
}

async function loadOptions() {
  try {
    const [a, c, t, m, u, k, types] = await Promise.all([
      all("/account"), all("/account/lokasi-customer"), all("/toner"), all("/printer-model"), all("/pengguna"), all("/kontrak"), api.get("/tiket/catalog")
    ]);
    accounts.value = a.filter((item) => item.aktif);
    customers.value = c;
    await searchPrinters();
    toners.value = t;
    models.value = m;
    sales.value = u.filter((item) => ["sales", "sales-admin", "sales_admin"].includes(item.role || item.peran));
    contracts.value = k.filter((item) => item.status === "aktif");
    catalog.value = types.data.data;
    optionsReady.value = true;
  } catch (err) { error.value = errorText(err); }
}

async function load() {
  busy.value = true;
  try {
    const response = await api.get("/tiket", { params: { halaman: page.value, batas: limit.value, ...(search.value ? { cari: search.value } : {}), ...(category.value ? { kategori: category.value } : {}), ...(status.value ? { status: status.value } : {}) } });
    rows.value = response.data.data.items;
    total.value = response.data.data.meta.total;
    error.value = "";
  } catch (err) { error.value = errorText(err); }
  finally { busy.value = false; }
}

function openNew() {
  if (!optionsReady.value) return;
  selected.value = null;
  printerSearch.value = "";
  Object.assign(form, { kategori: allowedCategories.value[0] || "", jenis: "", account_id: "", customer_id: "", sales_id: "", mode: "", kontrak_id: "", tiket_asal_id: "", tanggal_transaksi: dateTimeLocal(), tanggal_akhir: "", lokasi_internal: "", deskripsi: "", alasan: "", hasil: "", printer_ids: [], printer_utama_id: "", printer_pengganti_id: "", printer_lama_id: "", toner_id: "", jumlah: 1, newPrinters: [{ mp_no: "", model_id: "", sumber: "" }] });
  form.jenis = Object.keys(catalog.value[form.kategori] || {})[0] || "";
  tab.value = "general";
  modal.value = true;
}

async function openDetail(item, targetTab = "general") {
  try {
    const response = await api.get(`/tiket/${item.id}`);
    selected.value = response.data.data;
    Object.assign(form, { deskripsi: selected.value.deskripsi || "", hasil: selected.value.hasil || "", alasan: selected.value.alasan || "", lokasi_internal: selected.value.lokasi_internal || "" });
    tab.value = targetTab;
    modal.value = true;
  } catch (err) { error.value = errorText(err); }
}

function printerLine(id, peran = "utama") {
  const item = unit(id);
  return item ? { printer_id: item.id, mp_no: item.mp_no, peran } : null;
}

function buildPayload() {
  const objectId = form.jenis === "back_up" ? form.printer_utama_id : form.printer_ids[0];
  const object = form.kategori === "delivery" || form.jenis === "penerimaan_printer" ? null : printerLine(objectId);
  return {
    kategori: form.kategori, jenis: form.jenis,
    account_id: form.account_id || null, customer_id: form.customer_id || null,
    sales_id: form.sales_id || null, mode: form.mode || null,
    kontrak_id: form.kontrak_id || null, tiket_asal_id: form.tiket_asal_id || null,
    tanggal_transaksi: iso(form.tanggal_transaksi), tanggal_akhir: iso(form.tanggal_akhir) || null,
    deskripsi: form.deskripsi || null, alasan: form.alasan || null, lokasi_internal: form.lokasi_internal || null,
    mp_no: object?.mp_no || null,
    printer: object ? [object] : []
  };
}

async function save() {
  busy.value = true;
  try {
    if (selected.value) await api.put(`/tiket/${selected.value.id}`, { deskripsi: form.deskripsi, alasan: form.alasan, hasil: form.hasil, lokasi_internal: form.lokasi_internal || null });
    else await api.post("/tiket", buildPayload());
    modal.value = false;
    message.value = "Tiket tersimpan.";
    await load();
  } catch (err) { error.value = errorText(err); }
  finally { busy.value = false; }
}

async function action(kind) {
  if (!selected.value) return;
  if (kind === "cancel" && !window.confirm("Batalkan tiket ini?")) return;
  busy.value = true;
  try {
    await api.post(`/tiket/${selected.value.id}/${kind}`);
    modal.value = false;
    message.value = kind === "resolve" ? "Tiket selesai." : "Tiket dibatalkan.";
    await load();
  } catch (err) { error.value = errorText(err); }
  finally { busy.value = false; }
}

watch([category, status, limit], () => { page.value = 1; load(); });
watch(() => form.kategori, () => { form.jenis = Object.keys(catalog.value[form.kategori] || {})[0] || ""; form.printer_ids = []; });
watch(() => form.account_id, (accountId) => {
  if (customers.value.find((item) => item.id === form.customer_id)?.account_id !== accountId) form.customer_id = "";
});
watch(canCreate, (allowed) => { if (allowed && !optionsReady.value) loadOptions(); });
onMounted(async () => {
  await Promise.all([load(), canCreate.value ? loadOptions() : api.get("/tiket/catalog").then((response) => { catalog.value = response.data.data; })]);
});
</script>

<template>
  <div class="tkt-page">
    <div class="tkt-toolbar">
      <label class="tkt-search"><Search :size="17" /><input v-model="search" type="search" aria-label="Cari tiket" placeholder="Cari No. Tiket / MP No" @keyup.enter="page = 1; load()" @search="!search && (page = 1, load())" /></label>
      <select v-model="category" aria-label="Filter kategori tiket"><option value="">Semua kategori</option><option v-for="(group, key) in catalog" :key="key" :value="key">{{ categoryNames[key] }}</option></select>
      <select v-model="status" aria-label="Filter status tiket"><option value="">Semua status</option><option v-for="value in ['new','pending','progress','solved','cancelled']" :key="value" :value="value">{{ value }}</option></select>
      <button v-if="canCreate" class="primary-button" type="button" :disabled="!optionsReady" @click="openNew"><Plus :size="16" /> Tiket</button>
    </div>
    <p v-if="error" class="tkt-error">{{ error }}</p><p v-else-if="message" class="tkt-message">{{ message }}</p>
    <div class="tkt-table table-wrap"><table><thead><tr><th>No. Tiket</th><th>Kategori</th><th>Jenis</th><th>Customer</th><th>Tanggal</th><th>Status</th><th>ST</th></tr></thead><tbody>
      <tr v-for="item in rows" :key="item.id" class="tkt-row" @click="openDetail(item)"><td>{{ item.nomor_tiket }}</td><td>{{ categoryNames[item.kategori] }}</td><td>{{ kindNames[item.jenis] }}</td><td>{{ item.master_customer?.nama_customer || '—' }}</td><td>{{ new Date(item.tanggal_transaksi).toLocaleDateString('id-ID') }}</td><td><span class="tkt-status">{{ item.siap_review ? 'Siap review' : item.status }}</span></td><td>{{ item.surat_tugas?.length || 0 }}</td></tr>
      <tr v-if="!rows.length"><td colspan="7" class="tkt-empty">{{ busy ? 'Memuat...' : 'Belum ada tiket.' }}</td></tr>
    </tbody></table><div class="tkt-footer"><span>{{ total }} tiket</span><div><select v-model.number="limit"><option :value="10">10</option><option :value="20">20</option><option :value="50">50</option></select><button type="button" :disabled="page <= 1" @click="page--; load()">‹</button><span>{{ page }} / {{ Math.max(1, Math.ceil(total / limit)) }}</span><button type="button" :disabled="page * limit >= total" @click="page++; load()">›</button></div></div></div>
    <div v-if="modal" class="modal-backdrop"><section class="tkt-modal" :class="{ 'tkt-legacy': selected?.pengaduan_lama_id }" role="dialog" aria-modal="true"><header class="tkt-modal-header"><div><small>{{ selected ? selected.nomor_tiket : 'DATA BARU' }}</small><h2>{{ selected ? kindNames[selected.jenis] : 'Buat Tiket' }}</h2></div><button type="button" aria-label="Tutup" @click="modal = false"><X :size="19" /></button></header>
      <nav v-if="selected" class="tkt-tabs"><button type="button" :class="{ active: tab === 'general' }" @click="tab = 'general'">General</button><button type="button" :class="{ active: tab === 'st' }" @click="tab = 'st'">Surat Tugas ({{ selected.surat_tugas?.length || 0 }})</button></nav>
      <div v-if="selected?.pengaduan_lama_id" class="tkt-legacy-note"><span>Tiket ini berasal dari Komplain lama. Lanjutkan pekerjaan yang masih aktif melalui alur lama.</span><button class="secondary-button" type="button" @click="emit('open-legacy', selected)">Buka Komplain Arsip</button></div>
      <div class="tkt-modal-body"><form v-if="tab === 'general'" id="tkt-form" class="tkt-form" @submit.prevent="save">
        <template v-if="!selected"><label>Kategori<select v-model="form.kategori" required><option v-for="key in allowedCategories" :key="key" :value="key">{{ categoryNames[key] }}</option></select></label><label>Jenis<select v-model="form.jenis" required><option v-for="key in availableKinds" :key="key" :value="key">{{ kindNames[key] }}</option></select></label>
          <label v-if="customerRequired">Account<select v-model="form.account_id" required><option value="">Pilih Account</option><option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.nama_account }}</option></select></label><label v-if="customerRequired">Customer / Site<select v-model="form.customer_id" required><option value="">Pilih Customer</option><option v-for="c in selectedAccountCustomers" :key="c.id" :value="c.id">{{ c.nama_customer }}</option></select></label>
          <label v-if="['delivery','komplain'].includes(form.kategori)">Sales<select v-model="form.sales_id" required><option value="">Pilih Sales</option><option v-for="u in sales.filter(x => (x.role || x.peran) === 'sales')" :key="u.id" :value="u.id">{{ u.name || u.user_id }}</option></select></label>
          <label v-if="!['delivery','inbound'].includes(form.kategori) && form.jenis !== 'toner_purchase'" class="wide">Cari MP No / serial<input v-model="printerSearch" placeholder="Ketik MP No atau serial" /></label>
          <label>Tanggal Transaksi<input v-model="form.tanggal_transaksi" type="datetime-local" required /></label><label v-if="['trial','event'].includes(form.jenis)">Tanggal Akhir<input v-model="form.tanggal_akhir" type="datetime-local" required /></label>
          <label v-if="['kontrak','back_up'].includes(form.jenis)">{{ form.jenis === 'kontrak' ? 'Jenis Kontrak' : 'Jenis Back-up' }}<select v-model="form.mode" required><option value="">Pilih jenis</option><option v-if="form.jenis === 'kontrak'" value="baru">Kontrak baru</option><option v-if="form.jenis === 'kontrak'" value="tukar">Tukar unit</option><option v-if="form.jenis === 'back_up'" value="sementara">Sementara</option><option v-if="form.jenis === 'back_up'" value="permanen">Permanen</option></select></label>
          <label v-if="form.jenis === 'kontrak' && form.mode === 'tukar'">Kontrak Aktif<select v-model="form.kontrak_id" required><option value="">Pilih Kontrak</option><option v-for="k in contracts.filter(x => x.customer_id === form.customer_id)" :key="k.id" :value="k.id">{{ k.nomor_kontrak }}</option></select></label>
          <label v-if="form.jenis === 'back_up'">Unit Bermasalah<select :value="form.printer_utama_id" required @change="selectUnit($event.target.value, 'printer_utama_id')"><option value="">Pilih Unit</option><option v-for="p in availablePrinters" :key="p.id" :value="p.id">{{ p.mp_no }}</option></select></label>
          <label v-if="!['delivery','inbound'].includes(form.kategori) && form.jenis !== 'back_up'" class="wide">Unit Printer<select :value="form.printer_ids[0] || ''" required @change="selectUnit($event.target.value, 'printer_ids')"><option value="">Pilih unit</option><option v-for="p in availablePrinters" :key="p.id" :value="p.id">{{ p.mp_no }} · {{ p.master_printer_model?.nama_model }}</option></select></label>
        </template>
        <div v-else class="tkt-facts"><span>Kategori: {{ categoryNames[selected.kategori] }}</span><span>Customer: {{ selected.master_customer?.nama_customer || '—' }}</span><span>Status: {{ selected.status }}</span><span v-if="selected.mp_no">MP No: {{ selected.mp_no }}</span></div>
        <label v-if="(selected?.jenis || form.jenis) === 'internal_use'">Divisi / Lokasi Internal<input v-model="form.lokasi_internal" :readonly="!!selected?.pengaduan_lama_id" required /></label><label class="wide">Deskripsi<textarea v-model="form.deskripsi" rows="3" :readonly="!!selected?.pengaduan_lama_id" /></label><label v-if="(selected?.jenis || form.jenis) === 'return'">Alasan Return<input v-model="form.alasan" :readonly="!!selected?.pengaduan_lama_id" required /></label><label v-if="selected?.jenis === 'trial'">Hasil Trial<select v-model="form.hasil"><option value="">Belum ada hasil</option><option value="berhasil">Berhasil</option><option value="gagal">Gagal</option><option value="batal">Batal</option></select></label>
      </form>
      <div v-else><div class="tkt-subhead"><strong>Surat Tugas Terkait</strong><button v-if="canCreateSt" class="primary-button" type="button" @click="emit('open-surat', selected)">Buat Surat Tugas</button></div><div class="table-wrap"><table><thead><tr><th>Nomor</th><th>Jenis</th><th>Status</th></tr></thead><tbody><tr v-for="st in selected.surat_tugas" :key="st.id"><td>{{ st.nomor_surat_tugas }}</td><td>{{ st.jenis_tugas }}</td><td>{{ st.status }}</td></tr><tr v-if="!selected.surat_tugas?.length"><td colspan="3">Belum ada Surat Tugas.</td></tr></tbody></table></div></div>
      </div><footer class="tkt-modal-footer"><button v-if="selected && tab === 'general' && !['solved','cancelled'].includes(selected.status) && (normalizedRole === 'admin' || owners[selected.kategori] === normalizedRole)" class="secondary-button" type="button" @click="action('cancel')">Batalkan Tiket</button><button v-if="selected?.siap_review && tab === 'general' && (normalizedRole === 'admin' || owners[selected.kategori] === normalizedRole)" class="secondary-button" type="button" @click="action('resolve')">Resolve</button><button v-if="tab === 'general' && (!selected || (normalizedRole === 'admin' || owners[selected.kategori] === normalizedRole) && !['solved','cancelled'].includes(selected.status))" class="primary-button" type="submit" form="tkt-form" :disabled="busy">Simpan</button></footer>
    </section></div>
  </div>
</template>

<style scoped>
.tkt-page { padding: 24px 28px; }
.tkt-toolbar { display: flex; align-items: center; gap: 9px; justify-content: flex-end; flex-wrap: wrap; margin-bottom: 16px; }
.tkt-toolbar select,.tkt-search,.tkt-form input,.tkt-form select,.tkt-form textarea { border: 1px solid #29364b; border-radius: 6px; background: #0c1628; color: #eaf2fb; min-height: 38px; padding: 7px 10px; font: inherit; }
.tkt-toolbar select { width: auto; max-width: 155px; font-size: 13px; }
.tkt-search { display: flex; align-items: center; gap: 8px; width: 260px; height: 38px; min-height: 38px; min-width: 0; color: #8da2bd; transition: border-color 180ms ease, box-shadow 180ms ease; }
.tkt-search:focus-within { border-color: rgba(34, 211, 238, .55); box-shadow: 0 0 0 3px rgba(34, 211, 238, .08); }
.tkt-search input { border: 0; background: none; outline: 0; color: #eaf2fb; width: 100%; height: 100%; min-height: 0; min-width: 0; padding: 0; }
.tkt-table { border: 1px solid #263247; border-radius: 7px; }
.tkt-row { cursor: pointer; }.tkt-row:hover { background: #112139; }.tkt-empty { text-align: center; padding: 34px; }
.tkt-status { display: inline-block; padding: 4px 9px; border-radius: 4px; background: #183349; color: #8bd7e8; text-transform: capitalize; }
.tkt-footer { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; color: #a8bad0; font-size: 12px; }.tkt-footer div { display: flex; align-items: center; gap: 10px; }.tkt-footer button,.tkt-footer select { background: #111e31; border: 1px solid #29364b; color: #eaf2fb; min-width: 34px; min-height: 32px; border-radius: 5px; }.tkt-footer button:disabled { opacity: .4; }
.tkt-error,.tkt-message { padding: 9px 12px; margin: 8px 0; border-radius: 4px; }.tkt-error { color: #ffadbd; background: #40202b; }.tkt-message { color: #9ce8c4; background: #143c36; }
.tkt-modal { width: min(800px, calc(100vw - 28px)); max-height: min(790px, calc(100vh - 40px)); display: flex; flex-direction: column; background: #091525; border: 1px solid #2c3a4e; border-radius: 8px; color: #eef5ff; }
.tkt-legacy-note { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 20px; color: #b8c9d9; font-size: 12px; }.tkt-legacy-note button { flex: none; }.tkt-legacy .tkt-modal-footer,.tkt-legacy .tkt-subhead button { display: none; }
.tkt-modal-header { padding: 18px 20px; display: flex; justify-content: space-between; align-items: start; border-bottom: 1px solid #253246; }.tkt-modal-header small { color: #91a9c2; font-size: 11px; }.tkt-modal-header h2 { margin: 3px 0 0; font-size: 21px; }.tkt-modal-header button { background: none; color: #b8cadc; border: 1px solid #2d3b50; border-radius: 5px; width: 32px; height: 32px; }
.tkt-tabs { display: flex; gap: 4px; border-bottom: 1px solid #253246; padding: 8px 20px 0; }.tkt-tabs button { padding: 9px 14px; background: none; color: #a9bdd1; border: 0; border-radius: 5px 5px 0 0; }.tkt-tabs button.active { background: #2c3d54; color: white; }
.tkt-modal-body { padding: 20px 20px 18px; overflow-y: auto; flex: 1; min-height: 0; }.tkt-form { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); column-gap: 16px; row-gap: 18px; }.tkt-form label { display: flex; flex-direction: column; gap: 7px; font-size: 12px; color: #b6c5d5; }.tkt-form .wide,.tkt-facts { grid-column: 1 / -1; }.tkt-form textarea { resize: vertical; }.tkt-facts { display: flex; flex-wrap: wrap; gap: 8px; }.tkt-facts span { font-size: 12px; color: #cbd8e6; border-bottom: 1px solid #294056; padding: 6px; }
.tkt-subhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }.tkt-modal-footer { border-top: 1px solid #253246; padding: 12px 20px; display: flex; justify-content: flex-end; gap: 8px; }
.tkt-units { max-height: 150px; overflow: auto; border-top: 1px solid #263247; padding: 10px 0; }.tkt-units strong { display: block; margin-bottom: 7px; }.tkt-units label { flex-direction: row; align-items: center; margin: 5px 0; }.tkt-units input { min-height: auto; }
.tkt-new-unit { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 10px; align-items: end; padding: 10px 0; border-bottom: 1px solid #263247; }.tkt-new-units > button { margin-top: 10px; }
@media(max-width:650px) { .tkt-new-unit { grid-template-columns: 1fr; } }
@media(max-width:650px) { .tkt-page { padding: 14px; }.tkt-toolbar { justify-content: stretch; }.tkt-toolbar > * { flex: 1; }.tkt-search { flex-basis: 100%; width: 100%; }.tkt-toolbar select { max-width: none; }.tkt-form { grid-template-columns: 1fr; }.tkt-modal { max-height: calc(100vh - 16px); } }
</style>
