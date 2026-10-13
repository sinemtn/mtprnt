<script setup>
import { onMounted, ref } from "vue";
import { Download, FileSpreadsheet, Upload, X } from "lucide-vue-next";
import api from "../../services/api";

const props = defineProps({ kind: { type: String, required: true } });
const emit = defineEmits(["close", "imported"]);
const format = ref(null);
const file = ref(null);
const preview = ref(null);
const busy = ref(false);
const error = ref("");
const excelType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function errorText(caught) {
  return caught.response?.data?.pesan || "Proses impor gagal. Periksa file dan coba lagi.";
}

async function loadFormat() {
  try {
    format.value = (await api.get(`/master-import/${props.kind}/format`)).data.data;
  } catch (caught) {
    error.value = errorText(caught);
  }
}

function chooseFile(event) {
  file.value = event.target.files?.[0] || null;
  preview.value = null;
  error.value = "";
  if (file.value && !file.value.name.toLowerCase().endsWith(".xlsx")) {
    error.value = "Gunakan file .xlsx sesuai template.";
    file.value = null;
  }
}

async function downloadTemplate() {
  busy.value = true;
  error.value = "";
  try {
    const response = await api.get(`/master-import/${props.kind}/template`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([response.data], { type: excelType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `template-${props.kind}.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (caught) {
    error.value = errorText(caught);
  } finally {
    busy.value = false;
  }
}

async function inspect() {
  if (!file.value) return;
  busy.value = true;
  error.value = "";
  preview.value = null;
  try {
    const response = await api.post(`/master-import/${props.kind}/preview`, file.value, {
      headers: { "Content-Type": excelType }, timeout: 120000
    });
    preview.value = response.data.data;
  } catch (caught) {
    error.value = errorText(caught);
  } finally {
    busy.value = false;
  }
}

async function commit() {
  if (!file.value || !preview.value || preview.value.errors.length) return;
  busy.value = true;
  error.value = "";
  try {
    const response = await api.post(`/master-import/${props.kind}/commit`, file.value, {
      headers: { "Content-Type": excelType }, timeout: 180000
    });
    emit("imported", response.data.data.total);
  } catch (caught) {
    error.value = errorText(caught);
    if (Array.isArray(caught.response?.data?.detail)) {
      preview.value = { ...preview.value, errors: caught.response.data.detail };
    }
  } finally {
    busy.value = false;
  }
}

onMounted(loadFormat);
</script>

<template>
  <div class="modal-backdrop import-backdrop" @click.self="emit('close')">
    <section class="modal-panel import-panel" role="dialog" aria-modal="true" aria-label="Impor Excel master data">
      <div class="modal-heading">
        <div><p class="eyebrow">MASTER DATA</p><h2>Impor Excel {{ format?.title || "" }}</h2></div>
        <button class="icon-action" type="button" title="Tutup" aria-label="Tutup" @click="emit('close')"><X :size="18" /></button>
      </div>
      <div class="import-body">
        <div class="import-topline">
          <span>Format Kolom</span>
          <button class="secondary-button" type="button" :disabled="busy" @click="downloadTemplate"><Download :size="15" /> Unduh Template</button>
        </div>
        <div class="import-format-wrap">
          <table class="import-format"><thead><tr><th>Kolom Excel</th><th>Wajib</th><th>Contoh</th><th>Keterangan</th></tr></thead>
            <tbody><tr v-for="column in format?.columns || []" :key="column.key"><td><code>{{ column.key }}</code></td><td>{{ column.required ? "Ya" : "-" }}</td><td>{{ column.example || "-" }}</td><td>{{ column.note || "-" }}</td></tr></tbody>
          </table>
        </div>
        <div class="import-upload">
          <label class="import-file"><FileSpreadsheet :size="18" /><span>{{ file?.name || "Pilih file .xlsx" }}</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" @change="chooseFile" /></label>
          <button class="secondary-button" type="button" :disabled="busy || !file" @click="inspect"><Upload :size="15" /> Periksa File</button>
        </div>
        <p v-if="error" class="import-error" role="alert">{{ error }}</p>
        <div v-if="preview" class="import-result">
          <strong>{{ preview.valid }} valid dari {{ preview.total }} baris</strong>
          <p v-if="preview.errors.length" class="import-error">{{ preview.errors.length }} kesalahan ditemukan. Perbaiki file lalu periksa kembali.</p>
          <div v-if="preview.errors.length" class="import-errors"><p v-for="(item, index) in preview.errors.slice(0, 50)" :key="index">Baris {{ item.baris }} · {{ item.kolom }}: {{ item.pesan }}</p><p v-if="preview.errors.length > 50">Dan {{ preview.errors.length - 50 }} kesalahan lainnya.</p></div>
        </div>
      </div>
      <div class="modal-actions import-actions"><button class="secondary-button" type="button" @click="emit('close')">Batal</button><button class="primary-button" type="button" :disabled="busy || !preview || !!preview.errors.length" @click="commit">{{ busy ? "Memproses..." : `Impor ${preview?.total || 0} Baris` }}</button></div>
    </section>
  </div>
</template>

<style scoped>
.import-panel { width: min(900px, calc(100vw - 24px)); max-height: min(780px, calc(100vh - 24px)); display: flex; flex-direction: column; }
.import-body { min-height: 0; overflow: auto; padding: 18px 22px; }
.import-topline, .import-upload { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.import-topline { margin-bottom: 10px; font-size: 13px; font-weight: 700; }
.import-format-wrap { max-height: 290px; overflow: auto; border: 1px solid #29364d; border-radius: 6px; }
.import-format { width: 100%; border-collapse: collapse; font-size: 12px; }
.import-format th, .import-format td { padding: 8px 10px; border-bottom: 1px solid #29364d; text-align: left; vertical-align: top; }
.import-format th { position: sticky; top: 0; background: #101b30; color: #a9bad0; }
.import-format code { color: #dce9fa; white-space: nowrap; }
.import-upload { margin-top: 16px; }
.import-file { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; padding: 9px 12px; border: 1px dashed #3c516e; border-radius: 6px; color: #cbd5e1; cursor: pointer; font-size: 13px; }
.import-file span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.import-file input { display: none; }
.import-result { margin-top: 16px; font-size: 13px; }
.import-error { color: #fb7185; font-size: 12px; }
.import-errors { max-height: 150px; overflow: auto; padding: 8px 12px; border: 1px solid #7f354b; border-radius: 6px; }
.import-errors p { margin: 4px 0; }
.import-actions { flex-shrink: 0; padding: 14px 22px; }
@media (max-width: 640px) { .import-body { padding: 14px; } .import-topline, .import-upload { align-items: stretch; flex-direction: column; } .import-format { min-width: 600px; } .import-actions { padding: 12px 14px; } }
</style>
