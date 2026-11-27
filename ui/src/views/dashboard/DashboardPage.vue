<script setup>
import { Bar, Doughnut, Line } from "vue-chartjs";

defineProps({
  ringkasanDashboard: { type: Array, required: true },
  lineChartData: { type: Object, required: true },
  statusDonutData: { type: Object, required: true },
  suratTugasBarData: { type: Object, required: true },
  stokDonutData: { type: Object, required: true },
  teknisiBarData: { type: Object, required: true },
  axisOptions: { type: Object, required: true },
  donutOptions: { type: Object, required: true },
  statusKomplain: { type: Array, required: true },
  stokBarang: { type: Array, required: true },
  backupReminders: { type: Array, default: () => [] }
});

function chartTotal(data) {
  return data?.datasets?.[0]?.data?.reduce((total, value) => total + Number(value || 0), 0) || 0;
}
</script>

<template>
  <section class="summary-grid">
    <article v-for="card in ringkasanDashboard" :key="card.label" class="summary-card">
      <component :is="card.icon" :size="23" />
      <span>{{ card.label }}</span>
      <strong>{{ card.value }}</strong>
      <small>{{ card.note }}</small>
    </article>
  </section>

  <section v-if="backupReminders.length" class="backup-reminders">
    <h2>BACK-UP: unit lama belum diterima</h2>
    <div class="table-wrap"><table><thead><tr><th>Surat Tugas</th><th>MP No unit lama</th><th>Customer</th><th>Terlambat</th></tr></thead><tbody><tr v-for="item in backupReminders" :key="item.nomor_surat_tugas"><td>{{ item.nomor_surat_tugas }}</td><td>{{ item.mp_no }}</td><td>{{ item.customer || '-' }}</td><td>{{ item.hari_terlambat }} hari</td></tr></tbody></table></div>
  </section>

  <section class="dashboard-chart-grid">
    <article class="chart-card chart-card-wide">
      <div class="chart-heading">
        <div>
          <span>Line Chart</span>
          <h2>Tren Tiket</h2>
        </div>
        <strong>{{ chartTotal(lineChartData) }}</strong>
      </div>
      <div class="chart-frame chart-frame-large">
        <Line :data="lineChartData" :options="axisOptions" />
      </div>
    </article>

    <article class="chart-card">
      <div class="chart-heading">
        <div>
          <span>Donut Chart</span>
          <h2>Status Tiket</h2>
        </div>
        <strong>{{ chartTotal(statusDonutData) }}</strong>
      </div>
      <div class="donut-layout">
        <div class="chart-frame donut-frame">
          <Doughnut :data="statusDonutData" :options="donutOptions" />
        </div>
        <div class="chart-legend">
          <span v-for="item in statusKomplain" :key="item.label">
            <i :style="{ background: item.color }"></i>
            {{ item.label }} {{ item.value }}
          </span>
        </div>
      </div>
    </article>

    <article class="chart-card">
      <div class="chart-heading">
        <div>
          <span>Bar Chart</span>
          <h2>Surat Tugas</h2>
        </div>
        <strong>{{ chartTotal(suratTugasBarData) }}</strong>
      </div>
      <div class="chart-frame">
        <Bar :data="suratTugasBarData" :options="axisOptions" />
      </div>
    </article>

    <article class="chart-card">
      <div class="chart-heading">
        <div>
          <span>Donut Chart</span>
          <h2>Komposisi Stok</h2>
        </div>
        <strong>{{ chartTotal(stokDonutData) }}</strong>
      </div>
      <div class="donut-layout">
        <div class="chart-frame donut-frame">
          <Doughnut :data="stokDonutData" :options="donutOptions" />
        </div>
        <div class="chart-legend">
          <span v-for="item in stokBarang" :key="item.label">
            <i :style="{ background: item.color }"></i>
            {{ item.label }} {{ item.value }}
          </span>
        </div>
      </div>
    </article>

    <article class="chart-card">
      <div class="chart-heading">
        <div>
          <span>Bar Chart</span>
          <h2>Beban Teknisi</h2>
        </div>
        <strong>{{ chartTotal(teknisiBarData) }}</strong>
      </div>
      <div class="chart-frame">
        <Bar :data="teknisiBarData" :options="axisOptions" />
      </div>
    </article>
  </section>
</template>

<style scoped>
.backup-reminders { margin: 20px 0; }
.backup-reminders h2 { font-size: 16px; margin: 0 0 10px; }
.backup-reminders table { width: 100%; }
</style>
