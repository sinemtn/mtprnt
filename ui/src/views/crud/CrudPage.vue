<script setup>
import { Eye, Pencil, Plus, Power, Search, Trash2 } from "lucide-vue-next";

defineProps({
  currentConfig: { type: Object, required: true },
  cari: { type: String, required: true },
  canCreate: { type: Boolean, required: true },
  paginatedItems: { type: Array, required: true },
  filteredItems: { type: Array, required: true },
  pagination: { type: Object, required: true },
  totalPages: { type: Number, required: true },
  paginationStart: { type: Number, required: true },
  paginationEnd: { type: Number, required: true },
  loading: { type: Boolean, required: true },
  canHardDelete: { type: Boolean, default: false },
  canOpenItem: { type: Function, default: () => true },
  canUpdateItem: { type: Function, default: () => true },
  canDeactivateItem: { type: Function, default: () => true },
  canResolveComplaintItem: { type: Function, default: () => true },
  canRunSuratAction: { type: Function, default: () => true },
  canPrintSuratItem: { type: Function, default: () => true },
  valueOf: { type: Function, required: true },
  badgeClass: { type: Function, required: true },
  labelStatus: { type: Function, required: true }
});

defineEmits([
  "update:cari",
  "reset-pagination",
  "load-page",
  "open-form",
  "resolve-complaint",
  "action-surat",
  "print-surat",
  "deactivate-item",
  "hard-delete-item",
  "previous-page",
  "next-page"
]);
</script>

<template>
  <section class="toolbar">
    <label v-if="currentConfig.search" class="search-box">
      <Search :size="17" />
      <input
        :value="cari"
        type="search"
        placeholder="Cari data"
        @input="$emit('update:cari', $event.target.value); $emit('reset-pagination')"
        @keyup.enter="$emit('load-page')"
      />
    </label>
    <button v-if="canCreate" class="primary-button" type="button" @click="$emit('open-form')">
      <Plus :size="17" />
      <span>Tambah</span>
    </button>
  </section>

  <section class="data-panel">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th v-for="column in currentConfig.columns" :key="column[0]">{{ column[1] }}</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in paginatedItems" :key="item.id">
            <td v-for="column in currentConfig.columns" :key="column[0]">
              <span v-if="['status', 'prioritas', 'aktif', 'peran', 'active', 'role'].includes(column[0])" class="status-badge" :class="badgeClass(item[column[0]])">
                {{ valueOf(item, column[0]) }}
              </span>
              <span v-else>{{ valueOf(item, column[0]) }}</span>
            </td>
            <td>
              <div class="row-actions">
                <button
                  v-if="canOpenItem(item)"
                  class="icon-action"
                  type="button"
                  :title="canUpdateItem(item) ? 'Edit' : 'Detail'"
                  @click="$emit('open-form', item)"
                >
                  <Pencil v-if="canUpdateItem(item)" :size="16" />
                  <Eye v-else :size="16" />
                </button>
                <button v-if="currentConfig.flow === 'suratTugas' && canPrintSuratItem(item)" class="text-action" type="button" @click="$emit('print-surat', item)">
                  PDF
                </button>
                <button
                  v-if="currentConfig.flow === 'pengaduan' && canResolveComplaintItem(item)"
                  class="text-action"
                  type="button"
                  @click="$emit('resolve-complaint', item)"
                >
                  Resolve
                </button>
                <button v-if="currentConfig.flow === 'suratTugas' && canRunSuratAction(item, 'start')" class="text-action" type="button" @click="$emit('action-surat', item, 'start')">
                  Start
                </button>
                <button v-if="currentConfig.flow === 'suratTugas' && canRunSuratAction(item, 'readyToPrint')" class="text-action" type="button" @click="$emit('action-surat', item, 'readyToPrint')">
                  Ready Print
                </button>
                <button v-if="currentConfig.flow === 'suratTugas' && canRunSuratAction(item, 'selesaiTeknisi')" class="text-action" type="button" @click="$emit('action-surat', item, 'selesaiTeknisi')">
                  Selesai Teknisi
                </button>
                <button
                  v-if="currentConfig.flow === 'suratTugas' && canRunSuratAction(item, 'validasiWarehouse')"
                  class="text-action"
                  type="button"
                  @click="$emit('action-surat', item, 'validasiWarehouse')"
                >
                  Validasi 1
                </button>
                <button
                  v-if="currentConfig.flow === 'suratTugas' && canRunSuratAction(item, 'resolve')"
                  class="text-action"
                  type="button"
                  @click="$emit('action-surat', item, 'resolve')"
                >
                  Validasi 2
                </button>
                <button
                  v-if="canDeactivateItem(item)"
                  class="icon-action warning"
                  type="button"
                  :title="currentConfig.flow ? 'Batalkan' : 'Nonaktifkan'"
                  @click="$emit('deactivate-item', item)"
                >
                  <Power :size="16" />
                </button>
                <button
                  v-if="canHardDelete && item.boleh_hapus_permanen !== false"
                  class="icon-action danger"
                  type="button"
                  title="Hapus permanen"
                  @click="$emit('hard-delete-item', item)"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!filteredItems.length">
            <td :colspan="currentConfig.columns.length + 1" class="empty-cell">
              {{ loading ? "Memuat data..." : "Belum ada data." }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="pagination-bar">
      <div class="pagination-size">
        <select v-model.number="pagination.pageSize" @change="$emit('reset-pagination')">
          <option :value="5">5</option>
          <option :value="10">10</option>
          <option :value="25">25</option>
        </select>
        <span>Baris per halaman</span>
      </div>
      <span class="pagination-range">
        {{ filteredItems.length ? `Menampilkan ${paginationStart}-${paginationEnd} dari ${filteredItems.length} data` : "0 data" }}
      </span>
      <div class="pagination-actions">
        <strong>Halaman {{ Math.min(pagination.page, totalPages) }} dari {{ totalPages }}</strong>
        <button class="secondary-button" type="button" title="Sebelumnya" :disabled="pagination.page <= 1" @click="$emit('previous-page', pagination)">
          &lsaquo;
        </button>
        <button class="secondary-button" type="button" title="Berikutnya" :disabled="pagination.page >= totalPages" @click="$emit('next-page', pagination, totalPages)">
          &rsaquo;
        </button>
      </div>
    </div>
  </section>
</template>
