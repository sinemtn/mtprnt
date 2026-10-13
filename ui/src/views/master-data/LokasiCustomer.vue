<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { FileUp, Pencil, Plus, Power, Search, Trash2, X } from "lucide-vue-next";
import api from "../../services/api";

const props = defineProps({ canManage: { type: Boolean, default: false } });
const emit = defineEmits(["open-import"]);
const rows = ref([]);
const accounts = ref([]);
const search = ref("");
const accountSearch = ref("");
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const busy = ref(false);
const error = ref("");
const modal = ref(false);
const editing = ref(false);
const confirm = ref(null);
const form = reactive({ id: "", account_id: "", kode_customer: "", nama_customer: "", alamat: "", nama_pic: "", telepon_pic: "", email_pic: "", aktif: true });
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const first = computed(() => total.value ? (page.value - 1) * pageSize.value + 1 : 0);
const last = computed(() => Math.min(total.value, page.value * pageSize.value));

async function load() {
  busy.value = true;
  error.value = "";
  try {
    const response = await api.get("/account/lokasi-customer", { params: { halaman: page.value, batas: pageSize.value, cari: search.value.trim() } });
    rows.value = response.data.data.items;
    total.value = response.data.data.meta.total;
  } catch (caught) {
    error.value = caught.response?.data?.pesan || "Lokasi customer gagal dimuat.";
  } finally {
    busy.value = false;
  }
}

async function loadAccounts() {
  try {
    const response = await api.get("/account", { params: { batas: 50, cari: accountSearch.value.trim() } });
    accounts.value = response.data.data.items.filter((row) => row.aktif);
  } catch (caught) {
    error.value = caught.response?.data?.pesan || "Account gagal dimuat.";
  }
}

function resetForm() {
  Object.assign(form, { id: "", account_id: "", kode_customer: "", nama_customer: "", alamat: "", nama_pic: "", telepon_pic: "", email_pic: "", aktif: true });
}

function open(row = null) {
  resetForm();
  editing.value = Boolean(row);
  accountSearch.value = "";
  accounts.value = [];
  if (row) Object.assign(form, row);
  else loadAccounts();
  error.value = "";
  modal.value = true;
}

async function save() {
  busy.value = true;
  error.value = "";
  const payload = {
    kode_customer: form.kode_customer.trim(),
    nama_customer: form.nama_customer.trim(),
    alamat: form.alamat.trim(),
    nama_pic: form.nama_pic.trim() || null,
    telepon_pic: form.telepon_pic.trim() || null,
    email_pic: form.email_pic.trim() || null,
    aktif: form.aktif
  };
  try {
    if (editing.value) await api.put(`/account/${form.account_id}/customer/${form.id}`, payload);
    else await api.post(`/account/${form.account_id}/customer`, payload);
    modal.value = false;
    await load();
  } catch (caught) {
    error.value = caught.response?.data?.pesan || "Lokasi customer gagal disimpan.";
  } finally {
    busy.value = false;
  }
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
    error.value = caught.response?.data?.pesan || "Lokasi customer gagal diubah.";
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
    <label class="search-box"><Search :size="17" /><input v-model="search" type="search" placeholder="Cari account, customer, atau alamat" @keyup.enter="applySearch" /></label>
    <button v-if="props.canManage" class="secondary-button" type="button" @click="emit('open-import')"><FileUp :size="16" />Impor Excel</button>
    <button v-if="props.canManage" class="primary-button" type="button" @click="open()"><Plus :size="16" />Tambah Lokasi</button>
  </section>
  <p v-if="error && !modal && !confirm" class="location-error" role="alert">{{ error }}</p>
  <section class="data-panel">
    <div class="table-wrap"><table><thead><tr><th>Account</th><th>Kode Customer</th><th>Lokasi Customer</th><th>Alamat</th><th>Status</th><th v-if="props.canManage">Aksi</th></tr></thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>{{ row.master_account?.nama_account || "-" }}</td><td>{{ row.kode_customer }}</td><td>{{ row.nama_customer }}</td><td>{{ row.alamat }}</td>
          <td><span class="status-badge" :class="row.aktif ? 'success' : 'neutral'">{{ row.aktif ? "Aktif" : "Nonaktif" }}</span></td>
          <td v-if="props.canManage"><div class="row-actions">
            <button class="icon-action" type="button" title="Edit lokasi customer" @click="open(row)"><Pencil :size="16" /></button>
            <button v-if="row.boleh_nonaktifkan" class="icon-action warning" type="button" title="Nonaktifkan lokasi" @click="confirm = { row, permanent: false }"><Power :size="16" /></button>
            <button v-if="row.boleh_hapus_permanen" class="icon-action danger" type="button" title="Hapus permanen" @click="confirm = { row, permanent: true }"><Trash2 :size="16" /></button>
          </div></td>
        </tr>
        <tr v-if="!rows.length"><td :colspan="props.canManage ? 6 : 5" class="empty-cell">{{ busy ? "Memuat data..." : "Belum ada lokasi customer." }}</td></tr>
      </tbody></table></div>
    <div class="pagination-bar"><div class="pagination-size"><select v-model.number="pageSize" aria-label="Baris per halaman" @change="applySearch"><option :value="10">10</option><option :value="25">25</option><option :value="50">50</option></select><span>Baris per halaman</span></div><span class="pagination-range">{{ first }}-{{ last }} dari {{ total }} lokasi</span><div class="pagination-actions"><strong>Halaman {{ page }} dari {{ pages }}</strong><button class="secondary-button" type="button" :disabled="page <= 1" @click="changePage(-1)">&lsaquo;</button><button class="secondary-button" type="button" :disabled="page >= pages" @click="changePage(1)">&rsaquo;</button></div></div>
  </section>

  <div v-if="modal" class="modal-backdrop"><section class="modal-panel location-modal" role="dialog" aria-modal="true" aria-label="Lokasi Customer"><div class="modal-heading"><h2>{{ editing ? "Edit Lokasi Customer" : "Tambah Lokasi Customer" }}</h2><button class="icon-action" type="button" title="Tutup" @click="modal = false"><X :size="18" /></button></div>
    <form class="data-form" @submit.prevent="save">
      <label v-if="!editing" class="location-wide"><span>Cari Account</span><input v-model="accountSearch" type="search" placeholder="Nama atau kode Account" @input="loadAccounts" /></label>
      <label class="location-wide"><span>Account</span><select v-model="form.account_id" :disabled="editing" required><option value="">Pilih Account</option><option v-if="editing" :value="form.account_id">{{ form.master_account?.nama_account }}</option><option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.nama_account }}</option></select></label>
      <label><span>Kode Customer</span><input v-model="form.kode_customer" type="text" required /></label>
      <label><span>Nama Lokasi Customer</span><input v-model="form.nama_customer" type="text" required /></label>
      <label class="location-wide"><span>Alamat</span><textarea v-model="form.alamat" rows="3" required /></label>
      <label><span>Nama PIC</span><input v-model="form.nama_pic" type="text" /></label><label><span>Telepon PIC</span><input v-model="form.telepon_pic" type="tel" /></label>
      <label><span>Email PIC</span><input v-model="form.email_pic" type="email" /></label>
      <label v-if="editing" class="check-field"><input v-model="form.aktif" type="checkbox" /><span>Aktif</span></label>
      <p v-if="error" class="location-error location-wide" role="alert">{{ error }}</p>
      <div class="modal-actions location-wide"><button class="secondary-button" type="button" @click="modal = false">Batal</button><button class="primary-button" type="submit" :disabled="busy">Simpan</button></div>
    </form>
  </section></div>
  <div v-if="confirm" class="modal-backdrop"><section class="modal-panel location-confirm" role="dialog" aria-modal="true" aria-label="Konfirmasi lokasi"><div class="modal-heading"><h2>{{ confirm.permanent ? "Hapus Lokasi Customer?" : "Nonaktifkan Lokasi Customer?" }}</h2><button class="icon-action" type="button" title="Tutup" @click="confirm = null"><X :size="18" /></button></div><p>{{ confirm.row.nama_customer }}</p><p v-if="error" class="location-error" role="alert">{{ error }}</p><div class="modal-actions"><button class="secondary-button" type="button" @click="confirm = null">Batal</button><button class="danger-button" type="button" :disabled="busy" @click="remove">{{ confirm.permanent ? "Hapus Permanen" : "Nonaktifkan" }}</button></div></section></div>
</template>

<style scoped>
.location-error { color: #fb7185; margin: 12px 0; }
.location-modal { width: min(760px, calc(100vw - 32px)); max-height: min(760px, calc(100vh - 40px)); }
.location-modal .data-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.location-wide { grid-column: 1 / -1; }
.location-confirm { width: min(440px, calc(100vw - 32px)); height: auto; }
.location-confirm > p { padding: 0 24px; }
.location-confirm .modal-actions { padding: 20px 24px; }
@media (max-width: 620px) { .location-modal .data-form { grid-template-columns: 1fr; } }
</style>
