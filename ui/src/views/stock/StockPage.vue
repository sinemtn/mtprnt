<script setup>
import { Plus, Search } from "lucide-vue-next";

defineProps({
  activeStockView: { type: Object, required: true },
  activeStockGroup: { type: String, required: true },
  stokSearch: { type: String, required: true },
  filteredStok: { type: Object, required: true },
  paginatedStok: { type: Object, required: true },
  stokPagination: { type: Object, required: true },
  stokTotalPages: { type: Object, required: true },
  paginationMulai: { type: Function, required: true },
  paginationSelesai: { type: Function, required: true }
});

defineEmits(["update:stokSearch", "reset-stock-pagination", "open-stock-mutation", "previous-page", "next-page"]);
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
    <button class="primary-button" type="button" @click="$emit('open-stock-mutation')">
      <Plus :size="17" />
      <span>Tambah</span>
    </button>
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
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedStok[activeStockGroup]" :key="row.id">
              <td>{{ row.master_gudang?.nama_gudang || "-" }}</td>
              <td>{{ row.master_toner?.nama_toner || row.master_printer?.model || row.master_suku_cadang?.nama_suku_cadang || "-" }}</td>
              <td>{{ row.jumlah_tersedia }}</td>
              <td>{{ row.jumlah_dicadangkan }}</td>
            </tr>
            <tr v-if="!filteredStok[activeStockGroup]?.length">
              <td colspan="4" class="empty-cell">Belum ada stok.</td>
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
