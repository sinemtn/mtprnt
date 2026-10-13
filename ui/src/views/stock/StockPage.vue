<script setup>
import { History, Minus, Plus, Search } from "lucide-vue-next";

defineProps({
  activeStockView: { type: Object, required: true },
  activeStockGroup: { type: String, required: true },
  canManageStock: { type: Boolean, default: false },
  canViewAuditBarang: { type: Boolean, default: false },
  stokSearch: { type: String, required: true },
  filteredStok: { type: Object, required: true },
  paginatedStok: { type: Object, required: true },
  stokPagination: { type: Object, required: true },
  stokTotalPages: { type: Object, required: true },
  paginationMulai: { type: Function, required: true },
  paginationSelesai: { type: Function, required: true }
});

defineEmits(["update:stokSearch", "reset-stock-pagination", "open-stock-mutation", "open-history", "previous-page", "next-page"]);
</script>

<template>
  <section class="toolbar">
    <label class="search-box">
      <Search :size="17" />
      <input
        :value="stokSearch"
        type="search"
        :placeholder="`Cari ${activeStockView.title.toLowerCase()}`"
        @input="$emit('update:stokSearch', $event.target.value); $emit('reset-stock-pagination')"
      />
    </label>
    <template v-if="canManageStock">
      <button class="secondary-button" type="button" @click="$emit('open-stock-mutation', 'keluar')">
        <Minus :size="16" />
        <span>Kurangi Stok</span>
      </button>
      <button class="primary-button" type="button" @click="$emit('open-stock-mutation', 'masuk')">
        <Plus :size="16" />
        <span>Tambah Stok</span>
      </button>
    </template>
  </section>

  <section class="stock-grid">
    <article class="data-panel">
      <div class="section-heading">
        <h2>{{ activeStockView.title }}</h2>
        <span>{{ filteredStok[activeStockGroup]?.length || 0 }} item</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Gudang</th>
              <th>Barang</th>
              <th>Tersedia</th>
              <th>Cadangan</th>
              <th v-if="canManageStock || canViewAuditBarang">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedStok[activeStockGroup]" :key="row.id">
              <td>{{ row.belum_ditempatkan ? "Belum ada gudang" : row.master_gudang?.nama_gudang || "-" }}</td>
              <td>{{ row.master_toner?.nama_toner || row.master_printer?.model || row.master_suku_cadang?.nama_suku_cadang || "-" }}</td>
              <td>{{ row.jumlah_tersedia }}</td>
              <td>{{ row.jumlah_dicadangkan }}</td>
              <td v-if="canManageStock || canViewAuditBarang">
                <div class="row-actions">
                  <button v-if="canViewAuditBarang" class="icon-action" type="button" title="Riwayat barang" aria-label="Riwayat barang" @click="$emit('open-history', row)"><History :size="16" /></button>
                  <button v-if="canManageStock" class="icon-action" type="button" title="Tambah stok" aria-label="Tambah stok" @click="$emit('open-stock-mutation', 'masuk', row)"><Plus :size="16" /></button>
                  <button v-if="canManageStock" class="icon-action" type="button" title="Kurangi stok" aria-label="Kurangi stok" :disabled="Number(row.jumlah_tersedia) <= 0" @click="$emit('open-stock-mutation', 'keluar', row)"><Minus :size="16" /></button>
                </div>
              </td>
            </tr>
            <tr v-if="!filteredStok[activeStockGroup]?.length">
              <td :colspan="canManageStock || canViewAuditBarang ? 5 : 4" class="empty-cell">Belum ada stok.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination-bar">
        <div class="pagination-size">
          <select v-model.number="stokPagination[activeStockGroup].pageSize" @change="stokPagination[activeStockGroup].page = 1">
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="25">25</option>
          </select>
          <span>Baris per halaman</span>
        </div>
        <span class="pagination-range">
          {{
            filteredStok[activeStockGroup]?.length
              ? `Menampilkan ${paginationMulai(filteredStok[activeStockGroup]?.length || 0, stokPagination[activeStockGroup])}-${paginationSelesai(filteredStok[activeStockGroup]?.length || 0, stokPagination[activeStockGroup])} dari ${filteredStok[activeStockGroup]?.length || 0} item`
              : "0 item"
          }}
        </span>
        <div class="pagination-actions">
          <strong>Halaman {{ Math.min(stokPagination[activeStockGroup].page, stokTotalPages[activeStockGroup]) }} dari {{ stokTotalPages[activeStockGroup] }}</strong>
          <button class="secondary-button" type="button" title="Sebelumnya" :disabled="stokPagination[activeStockGroup].page <= 1" @click="$emit('previous-page', stokPagination[activeStockGroup])">
            &lsaquo;
          </button>
          <button
            class="secondary-button"
            type="button"
            title="Berikutnya"
            :disabled="stokPagination[activeStockGroup].page >= stokTotalPages[activeStockGroup]"
            @click="$emit('next-page', stokPagination[activeStockGroup], stokTotalPages[activeStockGroup])"
          >
            &rsaquo;
          </button>
        </div>
      </div>
    </article>
  </section>
</template>
