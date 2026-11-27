<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { FileUp, Pencil, Plus, Power, Search, Trash2, X } from "lucide-vue-next";
import api from "../../services/api";

const props = defineProps({ canManage: { type: Boolean, default: false } });
const emit = defineEmits(["open-import"]);
const rows = ref([]);
const accounts = ref([]);
const selectedAccount = ref(null);
const search = ref("");
const billingSendiri = ref(false);
const accountSearch = ref("");
const billingOpen = ref(false);
const billingActiveIndex = ref(0);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const busy = ref(false);
const error = ref("");
const modal = ref(false);
const editing = ref(false);
const confirm = ref(null);
const tab = ref("general");
const picRows = ref([]);
const picEditingId = ref("");
const picForm = reactive({ nama_pic: "", telepon_pic: "", email_pic: "" });
const form = reactive({ id: "", account_id: "", kode_customer: "", nama_customer: "", alamat: "", aktif: true });
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const first = computed(() => total.value ? (page.value - 1) * pageSize.value + 1 : 0);
const last = computed(() => Math.min(total.value, page.value * pageSize.value));
const accountOptions = computed(() => accounts.value);
let accountSearchTimer;
let accountRequestId = 0;
let draftPicId = 0;

async function load() {
  busy.value = true;
  error.value = "";
  try {
    const response = await api.get("/account/lokasi-customer", { params: { halaman: page.value, batas: pageSize.value, cari: search.value.trim() } });
    rows.value = response.data.data.items;
    total.value = response.data.data.meta.total;
  } catch (caught) {
    error.value = caught.response?.data?.pesan || "Customer gagal dimuat.";
  } finally {
    busy.value = false;
  }
}

async function loadAccounts() {
  const requestId = ++accountRequestId;
  try {
    const response = await api.get("/account", { params: { batas: 50, cari: accountSearch.value.trim() } });
    if (requestId === accountRequestId) accounts.value = response.data.data.items.filter((row) => row.aktif);
  } catch (caught) {
    if (requestId === accountRequestId) error.value = caught.response?.data?.pesan || "Billing gagal dimuat.";
  }
}

function scheduleAccountSearch() {
  billingOpen.value = true;
  billingActiveIndex.value = 0;
  clearTimeout(accountSearchTimer);
  accountSearchTimer = setTimeout(loadAccounts, 250);
}

function selectAccount(account) {
  selectedAccount.value = account;
  form.account_id = account.id;
  accountSearch.value = "";
  billingOpen.value = false;
}

function onBillingKeydown(event) {
  if (event.key === "Escape") billingOpen.value = false;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    billingOpen.value = true;
    billingActiveIndex.value = Math.max(0, Math.min(accountOptions.value.length - 1, billingActiveIndex.value + (event.key === "ArrowDown" ? 1 : -1)));
  }
  if (event.key === "Enter" && billingOpen.value && accountOptions.value[billingActiveIndex.value]) {
    event.preventDefault();
    selectAccount(accountOptions.value[billingActiveIndex.value]);
  }
}

function onBillingFocusOut(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) billingOpen.value = false;
}

function resetForm() {
  Object.assign(form, { id: "", account_id: "", kode_customer: "", nama_customer: "", alamat: "", aktif: true });
  resetPicForm();
  picRows.value = [];
  tab.value = "general";
}

function resetPicForm() {
  picEditingId.value = "";
  Object.assign(picForm, { nama_pic: "", telepon_pic: "", email_pic: "" });
}

async function loadPic() {
  if (!form.id || !form.account_id) return;
  try {
    const response = await api.get(`/account/${form.account_id}/customer/${form.id}/pic`);
    picRows.value = response.data.data.items;
  } catch (caught) {
    error.value = caught.response?.data?.pesan || "PIC Customer gagal dimuat.";
  }
}

function open(row = null) {
  resetForm();
  editing.value = Boolean(row);
  billingSendiri.value = false;
  billingOpen.value = false;
  accountSearch.value = "";
  accounts.value = [];
  selectedAccount.value = row?.master_account || null;
  if (row) {
    Object.assign(form, row);
    loadPic();
  }
  else loadAccounts();
  error.value = "";
  modal.value = true;
}

async function save() {
  if (!form.kode_customer.trim() || !form.nama_customer.trim() || !form.alamat.trim()) {
    error.value = "Isi kode, nama, dan alamat Customer terlebih dahulu.";
    tab.value = "general";
    return;
  }
  if (!editing.value && !billingSendiri.value && !form.account_id) {
    error.value = "Pilih Billing terlebih dahulu.";
    return;
  }
  if (!editing.value && (picForm.telepon_pic.trim() || picForm.email_pic.trim()) && !picForm.nama_pic.trim()) {
    error.value = "Isi nama PIC sebelum menyimpan Customer.";
    tab.value = "pic";
    return;
  }
  const draftPics = !editing.value ? [...picRows.value] : [];
  if (!editing.value && picForm.nama_pic.trim()) {
    const pending = { nama_pic: picForm.nama_pic.trim(), telepon_pic: picForm.telepon_pic.trim() || null, email_pic: picForm.email_pic.trim() || null };
    if (picEditingId.value) {
      const index = draftPics.findIndex((row) => row.id === picEditingId.value);
      if (index >= 0) draftPics[index] = { ...draftPics[index], ...pending };
    } else draftPics.push(pending);
  }
  busy.value = true;
  error.value = "";
  const payload = {
    kode_customer: form.kode_customer.trim(),
    nama_customer: form.nama_customer.trim(),
    alamat: form.alamat.trim(),
    aktif: form.aktif,
    ...(!editing.value ? { pics: draftPics.map(({ nama_pic, telepon_pic, email_pic }) => ({ nama_pic, telepon_pic, email_pic })) } : {})
  };
  try {
    let response;
    if (editing.value) response = await api.put(`/account/${form.account_id}/customer/${form.id}`, payload);
    else if (billingSendiri.value) {
      response = await api.post("/account", {
        kode_account: payload.kode_customer,
        nama_account: payload.nama_customer,
        alamat_penagihan: payload.alamat,
        minimum_toner_tahunan: 0,
        aktif: true,
        customer_pertama: payload
      });
      form.account_id = response.data.data.id;
      form.id = response.data.data.master_customer[0].id;
      selectedAccount.value = response.data.data;
    }
    else {
      response = await api.post(`/account/${form.account_id}/customer`, payload);
      form.id = response.data.data.id;
    }
    editing.value = true;
    tab.value = "pic";
    await loadPic();
    await load();
  } catch (caught) {
    error.value = caught.response?.data?.pesan || "Customer gagal disimpan.";
  } finally {
    busy.value = false;
  }
}

function editPic(row) {
  picEditingId.value = row.id;
  Object.assign(picForm, { nama_pic: row.nama_pic, telepon_pic: row.telepon_pic || "", email_pic: row.email_pic || "" });
}

async function savePic() {
  if (!picForm.nama_pic.trim()) return;
  const payload = { nama_pic: picForm.nama_pic.trim(), telepon_pic: picForm.telepon_pic.trim() || null, email_pic: picForm.email_pic.trim() || null };
  if (!editing.value) {
    if (picEditingId.value) picRows.value = picRows.value.map((row) => row.id === picEditingId.value ? { ...row, ...payload } : row);
    else picRows.value = [...picRows.value, { id: `draft-${++draftPicId}`, ...payload }];
    resetPicForm();
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const endpoint = `/account/${form.account_id}/customer/${form.id}/pic`;
    if (picEditingId.value) await api.put(`${endpoint}/${picEditingId.value}`, payload);
    else await api.post(endpoint, payload);
    resetPicForm();
    await loadPic();
    await load();
  } catch (caught) {
    error.value = caught.response?.data?.pesan || "PIC Customer gagal disimpan.";
  } finally { busy.value = false; }
}

async function deletePic(row) {
  if (!editing.value) {
    picRows.value = picRows.value.filter((pic) => pic.id !== row.id);
    if (picEditingId.value === row.id) resetPicForm();
    return;
  }
  if (!window.confirm(`Hapus PIC ${row.nama_pic}?`)) return;
  busy.value = true;
  error.value = "";
  try {
    await api.delete(`/account/${form.account_id}/customer/${form.id}/pic/${row.id}`);
    if (picEditingId.value === row.id) resetPicForm();
    await loadPic();
    await load();
  } catch (caught) {
    error.value = caught.response?.data?.pesan || "PIC Customer gagal dihapus.";
  } finally { busy.value = false; }
}

async function remove() {
  if (!confirm.value) return;
  busy.value = true;
  error.value = "";
  try {
    const { row, permanent } = confirm.value;
    await api.delete(`/account/${row.account_id}/customer/${row.id}${permanent ? "/permanent" : ""}`);
    confirm.value = null;
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  } catch (caught) {
    error.value = caught.response?.data?.pesan || "Customer gagal diubah.";
  } finally {
    busy.value = false;
  }
}

function applySearch() { page.value = 1; load(); }
function changePage(delta) { page.value += delta; load(); }
onMounted(load);
</script>

<template>
  <section class="toolbar">
    <label class="search-box"><Search :size="17" /><input v-model="search" type="search" aria-label="Cari customer" placeholder="Cari kode, nama, billing, atau PIC" @keyup.enter="applySearch" @search="!search && applySearch()" /></label>
    <button v-if="props.canManage" class="secondary-button" type="button" @click="emit('open-import')"><FileUp :size="16" />Impor Excel</button>
    <button v-if="props.canManage" class="primary-button" type="button" @click="open()"><Plus :size="16" />Tambah Customer</button>
  </section>
  <p v-if="error && !modal && !confirm" class="location-error" role="alert">{{ error }}</p>
  <section class="data-panel">
    <div class="table-wrap"><table><thead><tr><th>Billing</th><th>Kode Customer</th><th>Customer</th><th>Alamat</th><th>Status</th><th v-if="props.canManage">Aksi</th></tr></thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>{{ row.master_account?.nama_account || "-" }}</td><td>{{ row.kode_customer }}</td><td>{{ row.nama_customer }}</td><td>{{ row.alamat }}</td>
          <td><span class="status-badge" :class="row.aktif ? 'success' : 'neutral'">{{ row.aktif ? "Aktif" : "Nonaktif" }}</span></td>
          <td v-if="props.canManage"><div class="row-actions">
            <button class="icon-action" type="button" title="Edit customer" @click="open(row)"><Pencil :size="16" /></button>
            <button v-if="row.boleh_nonaktifkan" class="icon-action warning" type="button" title="Nonaktifkan customer" @click="confirm = { row, permanent: false }"><Power :size="16" /></button>
            <button v-if="row.boleh_hapus_permanen" class="icon-action danger" type="button" title="Hapus permanen" @click="confirm = { row, permanent: true }"><Trash2 :size="16" /></button>
          </div></td>
        </tr>
        <tr v-if="!rows.length"><td :colspan="props.canManage ? 6 : 5" class="empty-cell">{{ busy ? "Memuat data..." : "Belum ada customer." }}</td></tr>
      </tbody></table></div>
    <div class="pagination-bar"><div class="pagination-size"><select v-model.number="pageSize" aria-label="Baris per halaman" @change="applySearch"><option :value="10">10</option><option :value="25">25</option><option :value="50">50</option></select><span>Baris per halaman</span></div><span class="pagination-range">{{ first }}-{{ last }} dari {{ total }} customer</span><div class="pagination-actions"><strong>Halaman {{ page }} dari {{ pages }}</strong><button class="secondary-button" type="button" :disabled="page <= 1" @click="changePage(-1)">&lsaquo;</button><button class="secondary-button" type="button" :disabled="page >= pages" @click="changePage(1)">&rsaquo;</button></div></div>
  </section>

  <div v-if="modal" class="modal-backdrop"><section class="modal-panel location-modal" role="dialog" aria-modal="true" aria-label="Customer"><div class="modal-heading"><h2>{{ editing ? "Edit Customer" : "Tambah Customer" }}</h2><button class="icon-action" type="button" title="Tutup" @click="modal = false"><X :size="18" /></button></div>
    <nav class="customer-tabs" aria-label="Data Customer"><button type="button" :class="{ active: tab === 'general' }" @click="tab = 'general'">General</button><button type="button" :class="{ active: tab === 'pic' }" @click="tab = 'pic'; if (form.id) loadPic()">PIC <span v-if="picRows.length">{{ picRows.length }}</span></button></nav>
    <form v-if="tab === 'general'" class="data-form" @submit.prevent="save">
      <label v-if="!editing" class="check-field location-wide"><input v-model="billingSendiri" type="checkbox" /><span>Billing sendiri</span></label>
      <div v-if="editing || !billingSendiri" class="location-wide billing-field"><span>Billing</span>
        <div v-if="editing" class="billing-readonly">{{ selectedAccount ? `${selectedAccount.kode_account} - ${selectedAccount.nama_account}` : form.account_id }}</div>
        <div v-else class="billing-combobox" @focusout="onBillingFocusOut">
          <div class="billing-control"><span v-if="selectedAccount" class="billing-choice">{{ selectedAccount.kode_account }} - {{ selectedAccount.nama_account }} <button type="button" aria-label="Hapus pilihan Billing" @click="selectedAccount = null; form.account_id = ''; billingOpen = true"><X :size="14" /></button></span><Search v-else :size="16" /><input v-model="accountSearch" type="search" role="combobox" aria-label="Cari Billing" aria-autocomplete="list" :aria-expanded="billingOpen" aria-controls="billing-options" placeholder="Cari kode atau nama Billing" @focus="billingOpen = true; loadAccounts()" @input="scheduleAccountSearch" @keydown="onBillingKeydown" /></div>
          <div v-if="billingOpen" id="billing-options" class="billing-options" role="listbox"><button v-for="(account, index) in accountOptions" :key="account.id" type="button" role="option" :aria-selected="form.account_id === account.id" :class="{ active: index === billingActiveIndex }" @mousedown.prevent @click="selectAccount(account)"><strong>{{ account.nama_account }}</strong><small>{{ account.kode_account }}</small></button><p v-if="!accountOptions.length">Billing tidak ditemukan.</p></div>
        </div>
      </div>
      <label><span>Kode Customer</span><input v-model="form.kode_customer" type="text" required /></label>
      <label><span>Nama Customer</span><input v-model="form.nama_customer" type="text" required /></label>
      <label class="location-wide"><span>Alamat</span><textarea v-model="form.alamat" rows="3" required /></label>
      <label v-if="editing" class="check-field"><input v-model="form.aktif" type="checkbox" /><span>Aktif</span></label>
      <p v-if="error" class="location-error location-wide" role="alert">{{ error }}</p>
      <div class="modal-actions location-wide"><button class="secondary-button" type="button" @click="modal = false">Batal</button><button class="primary-button" type="submit" :disabled="busy">Simpan</button></div>
    </form>
    <section v-else class="pic-panel">
      <div class="pic-list"><div v-for="pic in picRows" :key="pic.id" class="pic-row"><div><strong>{{ pic.nama_pic }}</strong><span>{{ pic.telepon_pic || 'Telepon belum ada' }}<template v-if="pic.email_pic"> · {{ pic.email_pic }}</template></span></div><div v-if="props.canManage" class="row-actions"><button class="icon-action" type="button" :aria-label="`Edit ${pic.nama_pic}`" @click="editPic(pic)"><Pencil :size="16" /></button><button class="icon-action danger" type="button" :aria-label="`Hapus ${pic.nama_pic}`" @click="deletePic(pic)"><Trash2 :size="16" /></button></div></div><p v-if="!picRows.length" class="pic-empty">Belum ada PIC Customer.</p></div>
      <form v-if="props.canManage" class="pic-form" @submit.prevent="savePic"><strong>{{ picEditingId ? 'Edit PIC' : 'Tambah PIC' }}</strong><label>Nama PIC<input v-model="picForm.nama_pic" required maxlength="150" /></label><label>Telepon PIC<input v-model="picForm.telepon_pic" type="tel" maxlength="50" /></label><label>Email PIC<input v-model="picForm.email_pic" type="email" maxlength="150" /></label><div class="modal-actions"><button v-if="picEditingId" class="secondary-button" type="button" @click="resetPicForm">Batal Edit</button><button class="primary-button" type="submit" :disabled="busy">{{ picEditingId ? 'Simpan Perubahan' : 'Tambah PIC' }}</button></div></form>
      <div v-if="!editing && props.canManage" class="modal-actions"><button class="secondary-button" type="button" @click="modal = false">Batal</button><button class="primary-button" type="button" :disabled="busy" @click="save">Simpan Customer</button></div>
      <p v-if="error" class="location-error" role="alert">{{ error }}</p>
    </section>
  </section></div>
  <div v-if="confirm" class="modal-backdrop"><section class="modal-panel location-confirm" role="dialog" aria-modal="true" aria-label="Konfirmasi customer"><div class="modal-heading"><h2>{{ confirm.permanent ? "Hapus Customer?" : "Nonaktifkan Customer?" }}</h2><button class="icon-action" type="button" title="Tutup" @click="confirm = null"><X :size="18" /></button></div><p>{{ confirm.row.nama_customer }}</p><p v-if="error" class="location-error" role="alert">{{ error }}</p><div class="modal-actions"><button class="secondary-button" type="button" @click="confirm = null">Batal</button><button class="danger-button" type="button" :disabled="busy" @click="remove">{{ confirm.permanent ? "Hapus Permanen" : "Nonaktifkan" }}</button></div></section></div>
</template>

<style scoped>
.location-error { color: #fb7185; margin: 12px 0; }
.location-modal { width: min(760px, calc(100vw - 32px)); max-height: min(760px, calc(100vh - 40px)); }
.location-modal .data-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.location-wide { grid-column: 1 / -1; }
.location-confirm { width: min(440px, calc(100vw - 32px)); height: auto; }
.location-confirm > p { padding: 0 24px; }
.location-confirm .modal-actions { padding: 20px 24px; }
.billing-field { display: flex; flex-direction: column; gap: 7px; color: #b6c5d5; font-size: 13px; }
.billing-readonly,.billing-control { min-height: 40px; border: 1px solid #2d3b50; border-radius: 6px; background: #0c1628; color: #eaf2fb; padding: 7px 10px; }
.billing-control { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.billing-control:focus-within { border-color: #38bdf8; }
.billing-control input { flex: 1; min-width: 150px; width: auto; min-height: 24px; padding: 0; border: 0; background: transparent; outline: 0; color: inherit; }
.billing-choice { display: inline-flex; align-items: center; gap: 8px; max-width: 100%; color: #eaf2fb; overflow-wrap: anywhere; }
.billing-choice button { display: inline-grid; place-items: center; flex: none; border: 0; background: transparent; color: #a9bdd1; padding: 2px; cursor: pointer; }
.billing-combobox { position: relative; }
.billing-options { position: absolute; z-index: 5; top: calc(100% + 4px); left: 0; right: 0; max-height: 210px; overflow: auto; border: 1px solid #34455c; border-radius: 6px; background: #0d1a2e; box-shadow: 0 12px 24px #0008; }
.billing-options button { display: flex; justify-content: space-between; gap: 12px; width: 100%; padding: 10px 12px; border: 0; border-bottom: 1px solid #263247; background: transparent; color: #eaf2fb; text-align: left; cursor: pointer; }
.billing-options button:hover,.billing-options button.active { background: #18304c; }
.billing-options small,.billing-options p { color: #9eb0c8; }
.billing-options p { padding: 10px 12px; margin: 0; }
.customer-tabs { display: flex; gap: 4px; padding: 8px 24px 0; border-bottom: 1px solid #263247; }
.customer-tabs button { border: 0; border-bottom: 2px solid transparent; background: transparent; color: #9eb0c8; padding: 10px 16px; cursor: pointer; }
.customer-tabs button.active { border-bottom-color: #38bdf8; color: #eaf2fb; }
.customer-tabs button:disabled { opacity: .5; cursor: not-allowed; }
.pic-panel { padding: 20px 24px 24px; overflow: auto; }
.pic-list { display: grid; gap: 6px; margin-bottom: 18px; }
.pic-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid #263247; }
.pic-row > div:first-child { display: grid; gap: 3px; min-width: 0; }
.pic-row strong,.pic-row span { overflow-wrap: anywhere; }
.pic-row span,.pic-empty { color: #9eb0c8; font-size: 13px; }
.pic-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; border-top: 1px solid #263247; padding-top: 16px; }
.pic-form > strong,.pic-form .modal-actions { grid-column: 1 / -1; }
.pic-form label { display: grid; gap: 5px; color: #b6c5d5; font-size: 13px; }
.pic-form input { min-width: 0; width: 100%; border: 1px solid #2d3b50; border-radius: 6px; background: #0c1628; color: #eaf2fb; padding: 9px 10px; }
@media (max-width: 620px) { .location-modal .data-form { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .pic-form { grid-template-columns: 1fr; } }
</style>
