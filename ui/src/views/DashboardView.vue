<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
} from "chart.js";
import {
  Boxes,
  Box,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Database,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  PhoneCall,
  Plus,
  Printer,
  Save,
  Settings,
  TimerReset,
  Trash2,
  UserRound,
  Wrench,
  X
} from "lucide-vue-next";
import logoMulti from "../assets/img/logo-multi-transparent.png";
import api, { hapusToken } from "../services/api";
import AuditPage from "./audit/AuditPage.vue";
import Complaint from "./complaint/Complaint.vue";
import PrinterTerpasang from "./dataset/PrinterTerpasang.vue";
import StockPrinter from "./dataset/StockPrinter.vue";
import StockSparepart from "./dataset/StockSparepart.vue";
import StockToner from "./dataset/StockToner.vue";
import Dashboard from "./dashboard/Dashboard.vue";
import Gudang from "./master-data/Gudang.vue";
import Lokasi from "./master-data/Lokasi.vue";
import Pelanggan from "./master-data/Pelanggan.vue";
import PrinterMaster from "./master-data/Printer.vue";
import Sparepart from "./master-data/Sparepart.vue";
import Toner from "./master-data/Toner.vue";
import User from "./master-data/User.vue";
import SettingsPage from "./settings/SettingsPage.vue";
import SuratTugas from "./surat-tugas/SuratTugas.vue";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend);

const router = useRouter();
const pengguna = ref(null);
const statusBackend = ref("Memeriksa");
const pesanError = ref("");
const pesanSukses = ref("");
let toastTimer = null;
const sidebarTerbuka = ref(false);
const userMenuTerbuka = ref(false);
const activeView = ref("dashboard");
const loading = ref(false);
const modalTerbuka = ref(false);
const modalStokTerbuka = ref(false);
const konfirmasiHapusTerbuka = ref(false);
const targetHapus = ref(null);
const modeKonfirmasi = ref("deactivate");
const modeForm = ref("create");
const formTab = ref("general");
const form = reactive({});
const itemForm = reactive({
  gudang_id: "",
  jenis_barang: "toner",
  item_id: "",
  jumlah_pakai: 1,
  serial_number: "",
  keterangan: ""
});
const stockForm = reactive({
  jenis_mutasi: "masuk",
  gudang_asal_id: "",
  gudang_tujuan_id: "",
  jenis_barang: "toner",
  item_id: "",
  jumlah: 1,
  keterangan: "",
  langsung_posting: true
});
const cari = ref("");
const items = ref([]);
const auditItems = ref([]);
const stok = reactive({ toner: [], printer: [], suku_cadang: [] });
const auditFilter = reactive({
  tanggal_mulai: "",
  tanggal_selesai: "",
  user: "",
  nomor_pengaduan: "",
  nomor_surat_tugas: ""
});
const pagination = reactive({
  page: 1,
  pageSize: 10
});
const auditPagination = reactive({
  page: 1,
  pageSize: 10
});
const stokPagination = reactive({
  toner: { page: 1, pageSize: 10 },
  printer: { page: 1, pageSize: 10 },
  suku_cadang: { page: 1, pageSize: 10 }
});
const stokSearch = ref("");
const options = reactive({
  pelanggan: [],
  lokasi: [],
  printer: [],
  toner: [],
  sukuCadang: [],
  gudang: [],
  pengguna: [],
  teknisi: [],
  printerTerpasang: [],
  pengaduan: [],
  suratTugas: []
});
const pengaturan = reactive({
  slaPendingJam: 24,
  roleDipilih: "admin",
  filterModul: "",
  roles: ["admin", "sales", "sales-admin", "kepala-teknisi", "teknisi", "warehouse"],
  modules: [],
  actions: ["view", "create", "update", "delete", "resolve", "workflow"],
  permissions: []
});

const menu = ref([
  {
    section: "Utama",
    items: [
      { key: "dashboard", nama: "Dashboard", icon: LayoutDashboard },
      { key: "pengaduan", nama: "Komplain", icon: PhoneCall },
      { key: "suratTugas", nama: "Surat Tugas", icon: ClipboardList }
    ]
  },
  {
    section: "Dataset",
    items: [
      {
        nama: "Stok Barang",
        icon: Box,
        terbuka: false,
        children: [
          { key: "stokPrinter", nama: "Stok Printer", icon: Printer },
          { key: "stokToner", nama: "Stok Toner", icon: PackagePlus },
          { key: "stokSparepart", nama: "Stok Sparepart", icon: Wrench },
          { key: "printerTerpasang", nama: "Printer Terpasang", icon: Printer }
        ]
      },
      {
        nama: "Master Data",
        icon: Database,
        terbuka: false,
        children: [
          { key: "pelanggan", nama: "Pelanggan", icon: Building2 },
          { key: "lokasi", nama: "Lokasi", icon: Building2 },
          { key: "printer", nama: "Printer", icon: Printer },
          { key: "toner", nama: "Toner", icon: Boxes },
          { key: "sukuCadang", nama: "Sparepart", icon: Wrench },
          { key: "gudang", nama: "Gudang", icon: Box },
          { key: "pengguna", nama: "User", icon: UserRound }
        ]
      }
    ]
  },
  {
    section: "Sistem",
    items: [
      { key: "audit", nama: "Audit", icon: History },
      {
        nama: "Pengaturan",
        icon: Settings,
        terbuka: false,
        adminOnly: true,
        children: [
          { key: "rolePermission", nama: "Role Permission", icon: KeyRound },
          { key: "slaPending", nama: "SLA Pending Komplain", icon: TimerReset }
        ]
      }
    ]
  },
  {
    section: "Auth",
    items: [
      { key: "logout", nama: "Keluar", icon: LogOut }
    ]
  }
]);

const configs = {
  pelanggan: {
    title: "Master Pelanggan",
    subtitle: "Kelola data pelanggan dan informasi kontak.",
    endpoint: "/pelanggan",
    hardDelete: true,
    search: true,
    columns: [
      ["kode_pelanggan", "Kode"],
      ["nama_pelanggan", "Nama"],
      ["jenis_pelanggan", "Jenis"],
      ["telepon", "Telepon"],
      ["aktif", "Status"]
    ],
    fields: [
      field("kode_pelanggan", "Kode Pelanggan", "text", true),
      field("nama_pelanggan", "Nama Pelanggan", "text", true),
      field("jenis_pelanggan", "Jenis", "select", false, ["single", "multisite"]),
      field("telepon", "Telepon"),
      field("email", "Email"),
      field("alamat", "Alamat", "textarea"),
      field("aktif", "Aktif", "checkbox")
    ]
  },
  lokasi: {
    title: "Master Lokasi",
    subtitle: "Lokasi pelanggan, alamat, dan PIC.",
    endpoint: "/lokasi-pelanggan",
    hardDelete: true,
    search: true,
    columns: [
      ["kode_lokasi", "Kode"],
      ["nama_lokasi", "Lokasi"],
      ["alamat", "Alamat"],
      ["kota", "Kota"],
      ["aktif", "Status"]
    ],
    fields: [
      relation("pelanggan_id", "Pelanggan", "pelanggan", "nama_pelanggan", true),
      field("kode_lokasi", "Kode Lokasi", "text", true),
      field("nama_lokasi", "Nama Lokasi", "text", true),
      field("alamat", "Alamat", "textarea", true),
      field("kota", "Kota"),
      field("nama_pic", "Nama PIC"),
      field("telepon_pic", "Telepon PIC"),
      field("email_pic", "Email PIC"),
      field("lokasi_default", "Default", "checkbox"),
      field("aktif", "Aktif", "checkbox")
    ]
  },
  printer: {
    title: "Master Printer",
    subtitle: "Model printer dan spesifikasi dasar.",
    endpoint: "/printer",
    hardDelete: true,
    search: true,
    columns: [
      ["kode_printer", "Kode"],
      ["merek", "Merek"],
      ["model", "Model"],
      ["jenis_printer", "Jenis"],
      ["aktif", "Status"]
    ],
    fields: [
      field("kode_printer", "Kode Printer", "text", true),
      field("merek", "Merek", "text", true),
      field("model", "Model", "text", true),
      field("jenis_printer", "Jenis Printer"),
      field("keterangan", "Keterangan", "textarea"),
      field("aktif", "Aktif", "checkbox")
    ]
  },
  toner: {
    title: "Master Toner",
    subtitle: "Data toner, warna, merek, dan kompatibilitas.",
    endpoint: "/toner",
    hardDelete: true,
    search: true,
    columns: [
      ["kode_toner", "Kode"],
      ["nama_toner", "Nama"],
      ["warna", "Warna"],
      ["merek", "Merek"],
      ["aktif", "Status"]
    ],
    fields: [
      field("kode_toner", "Kode Toner", "text", true),
      field("nama_toner", "Nama Toner", "text", true),
      field("warna", "Warna"),
      field("merek", "Merek"),
      field("model_printer_kompatibel", "Kompatibel", "textarea"),
      field("satuan", "Satuan"),
      field("aktif", "Aktif", "checkbox")
    ]
  },
  sukuCadang: {
    title: "Master Sparepart",
    subtitle: "Data suku cadang dan kategori barang.",
    endpoint: "/suku-cadang",
    hardDelete: true,
    search: true,
    columns: [
      ["kode_suku_cadang", "Kode"],
      ["nama_suku_cadang", "Nama"],
      ["kategori", "Kategori"],
      ["merek", "Merek"],
      ["aktif", "Status"]
    ],
    fields: [
      field("kode_suku_cadang", "Kode Sparepart", "text", true),
      field("nama_suku_cadang", "Nama Sparepart", "text", true),
      field("kategori", "Kategori"),
      field("merek", "Merek"),
      field("model_printer_kompatibel", "Kompatibel", "textarea"),
      field("satuan", "Satuan"),
      field("aktif", "Aktif", "checkbox")
    ]
  },
  gudang: {
    title: "Master Gudang",
    subtitle: "Gudang utama, cabang, atau teknisi.",
    endpoint: "/gudang",
    hardDelete: true,
    search: true,
    columns: [
      ["kode_gudang", "Kode"],
      ["nama_gudang", "Nama"],
      ["jenis_gudang", "Jenis"],
      ["alamat", "Alamat"],
      ["aktif", "Status"]
    ],
    fields: [
      field("kode_gudang", "Kode Gudang", "text", true),
      field("nama_gudang", "Nama Gudang", "text", true),
      field("jenis_gudang", "Jenis Gudang", "select", true, ["utama", "cabang", "teknisi"]),
      relation("teknisi_id", "Teknisi", "pengguna", "name"),
      field("alamat", "Alamat", "textarea"),
      field("aktif", "Aktif", "checkbox")
    ]
  },
  pengguna: {
    title: "Master Akun / User",
    subtitle: "Kode user, login, role, dan status aktif akun.",
    endpoint: "/pengguna",
    directList: true,
    columns: [
      ["user_id", "User ID"],
      ["name", "Nama"],
      ["role", "Role"],
      ["email", "Email"],
      ["active", "Status"]
    ],
    fields: [
      field("user_id", "User ID", "text", true),
      field("name", "Nama", "text", true),
      field("role", "Role", "select", true, ["admin", "sales", "sales-admin", "kepala-teknisi", "teknisi", "warehouse"]),
      field("email", "Email", "email", true),
      field("password", "Password", "password", true),
      field("active", "Active", "checkbox")
    ]
  },
  printerTerpasang: {
    title: "Printer Terpasang",
    subtitle: "Printer yang aktif di lokasi pelanggan.",
    endpoint: "/printer-terpasang",
    search: true,
    columns: [
      ["nomor_seri", "Nomor Seri"],
      ["pelanggan_id", "Customer"],
      ["lokasi_detail", "Lokasi Detail"],
      ["status", "Status"],
      ["meter_hitam_putih", "Meter B/W"],
      ["meter_warna", "Meter Warna"]
    ],
    fields: [
      relation("pelanggan_id", "Customer", "pelanggan", "nama_pelanggan", true),
      relation("lokasi_pelanggan_id", "Cabang Customer", "lokasi", "nama_lokasi"),
      relation("printer_id", "Printer", "printer", "model", true),
      field("nomor_seri", "Nomor Seri", "text", true),
      field("lokasi_detail", "Lokasi Detail"),
      field("tanggal_instalasi", "Tanggal Instalasi", "date"),
      field("meter_hitam_putih", "Meter B/W", "number"),
      field("meter_warna", "Meter Warna", "number"),
      field("status", "Status", "select", false, ["aktif", "nonaktif", "dipindahkan", "dikembalikan"])
    ]
  },
  pengaduan: {
    title: "Flow Komplain",
    subtitle: "Input, update prioritas, dan pantau status komplain.",
    endpoint: "/pengaduan",
    search: true,
    columns: [
      ["nomor_pengaduan", "Nomor"],
      ["mp_no", "MP No"],
      ["deskripsi_masalah", "Deskripsi"],
      ["prioritas", "Prioritas"],
      ["status", "Status"]
    ],
    flow: "pengaduan",
    fields: [
      field("nomor_pengaduan", "No. Komplain", "text", false, [], { readonly: true, placeholder: "Generate otomatis" }),
      field("tanggal_pengaduan", "Tanggal Komplain", "datetime-local", false, [], { defaultValue: "now" }),
      field("mp_no", "MP No", "text", true),
      relation("pelanggan_id", "Customer", "pelanggan", "nama_pelanggan", true),
      relation("lokasi_pelanggan_id", "Cabang Customer", "lokasi", "nama_lokasi"),
      relation("sales_id", "Sales", "pengguna", "name", true),
      field("status", "Status", "select", false, ["new", "pending", "progress", "solved", "cancelled"], { defaultValue: "new" }),
      field("deskripsi_masalah", "Deskripsi", "textarea", true),
      field("nama_pelapor", "Nama Pelapor", "text", true),
      field("telepon_pelapor", "Telepon Pelapor"),
      field("prioritas", "Prioritas", "select", false, ["rendah", "normal", "tinggi", "darurat"], { defaultValue: "normal" }),
      field("ringkasan_penyelesaian", "Ringkasan Penyelesaian", "textarea"),
      field("tanggal_diselesaikan", "Resolved At", "datetime-local", false, [], { readonly: true }),
      field("tanggal_diperbarui", "Updated At", "datetime-local", false, [], { readonly: true }),
      field("slug", "Slug", "text", false, [], { readonly: true })
    ]
  },
  suratTugas: {
    title: "Flow Surat Tugas",
    subtitle: "Buat pekerjaan dari komplain, update hasil, ajukan, dan setujui.",
    endpoint: "/surat-tugas",
    directList: true,
    columns: [
      ["nomor_surat_tugas", "Nomor"],
      ["mp_no", "MP No"],
      ["jenis_pekerjaan", "Pekerjaan"],
      ["status", "Status"],
      ["hasil", "Hasil"]
    ],
    flow: "suratTugas",
    fields: [
      field("nomor_surat_tugas", "ID Surat Tugas", "text", false, [], { readonly: true, placeholder: "Generate otomatis" }),
      relation("pengaduan_id", "No. Komplain", "pengaduan", "nomor_pengaduan"),
      field("mp_no", "MP No", "text", true),
      relation("pelanggan_id", "Customer", "pelanggan", "nama_pelanggan", true),
      relation("lokasi_pelanggan_id", "Cabang Customer", "lokasi", "nama_lokasi"),
      relation("pic_teknisi_id", "PIC", "teknisi", "name", true),
      field("jenis_pekerjaan", "Tipe", "select", true, ["maintenance", "installation", "delivery", "support"], { defaultValue: "maintenance" }),
      field("status", "Status", "select", false, ["pending", "progress", "ready_to_print", "technician_completed", "warehouse_validated", "solved", "cancelled"], { defaultValue: "pending" }),
      field("tanggal_jadwal", "Jadwal", "datetime-local"),
      field("catatan_masalah", "Catatan Masalah", "textarea"),
      field("tindakan", "Tindakan", "textarea"),
      field("hasil", "Hasil", "textarea")
    ]
  }
};

const stockItemOptions = computed(() => {
  if (stockForm.jenis_barang === "printer") return options.printer;
  if (stockForm.jenis_barang === "suku_cadang") return options.sukuCadang;
  return options.toner;
});
const itemSuratOptions = computed(() => {
  if (itemForm.jenis_barang === "printer") return options.printer;
  if (itemForm.jenis_barang === "suku_cadang") return options.sukuCadang;
  return options.toner;
});
const ringkasanDashboard = computed(() => [
  {
    icon: PhoneCall,
    label: "Jumlah Komplain",
    value: options.pengaduan.length,
    note: "Total komplain tercatat"
  },
  {
    icon: ClipboardList,
    label: "Jumlah Surat Tugas",
    value: options.suratTugas.length,
    note: "Total surat tugas"
  },
  {
    icon: Printer,
    label: "Jumlah Printer Terpasang",
    value: options.printerTerpasang.length,
    note: "Unit aktif di customer"
  }
]);

function angka(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tanggalDari(item, keys) {
  const raw = keys.map((key) => item?.[key]).find(Boolean);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function tanggalKey(date) {
  return date.toISOString().slice(0, 10);
}

function hariTerakhir(total = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (total - 1 - index));
    return date;
  });
}

const labelHariPendek = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const warnaStatusKomplain = {
  new: "#2563eb",
  pending: "#38bdf8",
  progress: "#22d3ee",
  solved: "#10b981",
  cancelled: "#fb7185"
};
const urutanStatusKomplain = ["new", "pending", "progress", "solved", "cancelled"];

const trenKomplain = computed(() => {
  const counts = options.pengaduan.reduce((result, item) => {
    const date = tanggalDari(item, ["tanggal_pengaduan", "tanggal_dibuat", "created_at"]);
    if (!date) return result;
    const key = tanggalKey(date);
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});

  return hariTerakhir().map((date) => ({
    label: labelHariPendek[date.getDay()],
    value: counts[tanggalKey(date)] || 0
  }));
});

const statusKomplain = computed(() => {
  const counts = options.pengaduan.reduce((result, item) => {
    const status = item.status || "new";
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});

  return urutanStatusKomplain.map((status) => ({
    label: labelStatus(status),
    value: counts[status] || 0,
    color: warnaStatusKomplain[status] || "#94a3b8"
  }));
});

const suratTugasMingguan = computed(() => {
  const counts = options.suratTugas.reduce((result, item) => {
    const date = tanggalDari(item, ["tanggal_dibuat", "tanggal_jadwal", "created_at"]);
    if (!date) return result;
    const key = tanggalKey(date);
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});

  return hariTerakhir().map((date) => ({
    label: labelHariPendek[date.getDay()],
    value: counts[tanggalKey(date)] || 0
  }));
});

const stokBarang = computed(() => [
  {
    label: "Printer",
    value: (stok.printer || []).reduce((total, item) => total + angka(item.jumlah_tersedia), 0),
    color: "#2563eb"
  },
  {
    label: "Toner",
    value: (stok.toner || []).reduce((total, item) => total + angka(item.jumlah_tersedia), 0),
    color: "#22d3ee"
  },
  {
    label: "Sparepart",
    value: (stok.suku_cadang || []).reduce((total, item) => total + angka(item.jumlah_tersedia), 0),
    color: "#8b5cf6"
  }
]);
const stokViews = {
  stokPrinter: {
    group: "printer",
    title: "Stok Printer",
    subtitle: "Pantau ketersediaan unit printer di setiap gudang.",
    label: "Printer"
  },
  stokToner: {
    group: "toner",
    title: "Stok Toner",
    subtitle: "Pantau ketersediaan toner dan kebutuhan refill.",
    label: "Toner"
  },
  stokSparepart: {
    group: "suku_cadang",
    title: "Stok Sparepart",
    subtitle: "Pantau sparepart yang tersedia untuk kebutuhan teknisi.",
    label: "Sparepart"
  }
};
const teknisiBar = computed(() => {
  const aktif = new Set(["pending", "progress", "ready_to_print", "technician_completed", "warehouse_validated"]);
  const counts = options.suratTugas.reduce((result, surat) => {
    if (!aktif.has(surat.status)) return result;
    (surat.teknisi_surat_tugas || surat.teknisi || []).forEach((assignment) => {
      const id = assignment.teknisi_id;
      if (!id) return;
      result[id] = (result[id] || 0) + 1;
    });
    return result;
  }, {});

  return options.teknisi
    .map((teknisi) => ({
      label: penggunaLabel(teknisi),
      value: counts[teknisi.id] || 0
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
});
const chartBaseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "#111827",
      titleColor: "#f8fafc",
      bodyColor: "#e2e8f0",
      padding: 12,
      cornerRadius: 8,
      displayColors: false
    }
  }
};
const axisOptions = {
  ...chartBaseOptions,
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: "#9fb1c7", font: { family: "Manrope", size: 11, weight: 600 } }
    },
    y: {
      beginAtZero: true,
      grid: { color: "rgba(148, 163, 184, 0.13)" },
      ticks: { color: "#9fb1c7", font: { family: "Manrope", size: 11, weight: 600 }, precision: 0 }
    }
  }
};
const lineChartData = computed(() => ({
  labels: trenKomplain.value.map((item) => item.label),
  datasets: [
    {
      data: trenKomplain.value.map((item) => item.value),
      borderColor: "#2563eb",
      backgroundColor: "rgba(34, 211, 238, 0.16)",
      pointBackgroundColor: "#22d3ee",
      pointBorderColor: "#ffffff",
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: true,
      tension: 0.42,
      borderWidth: 3
    }
  ]
}));
const statusDonutData = computed(() => ({
  labels: statusKomplain.value.map((item) => item.label),
  datasets: [
    {
      data: statusKomplain.value.map((item) => item.value),
      backgroundColor: statusKomplain.value.map((item) => item.color),
      borderColor: "#ffffff",
      borderWidth: 4,
      hoverOffset: 5
    }
  ]
}));
const suratTugasBarData = computed(() => ({
  labels: suratTugasMingguan.value.map((item) => item.label),
  datasets: [
    {
      data: suratTugasMingguan.value.map((item) => item.value),
      backgroundColor: "#2563eb",
      hoverBackgroundColor: "#22d3ee",
      borderRadius: 8,
      borderSkipped: false
    }
  ]
}));
const stokDonutData = computed(() => ({
  labels: stokBarang.value.map((item) => item.label),
  datasets: [
    {
      data: stokBarang.value.map((item) => item.value),
      backgroundColor: stokBarang.value.map((item) => item.color),
      borderColor: "#ffffff",
      borderWidth: 4,
      hoverOffset: 5
    }
  ]
}));
const teknisiBarData = computed(() => ({
  labels: teknisiBar.value.map((item) => item.label),
  datasets: [
    {
      data: teknisiBar.value.map((item) => item.value),
      backgroundColor: "#22d3ee",
      hoverBackgroundColor: "#2563eb",
      borderRadius: 8,
      borderSkipped: false
    }
  ]
}));
const donutOptions = {
  ...chartBaseOptions,
  cutout: "68%"
};

watch([pesanError, pesanSukses], ([error, sukses], [errorLama, suksesLama]) => {
  if (toastTimer) clearTimeout(toastTimer);
  if (error && error !== errorLama && sukses) {
    pesanSukses.value = "";
    return;
  }
  if (sukses && sukses !== suksesLama && error) {
    pesanError.value = "";
    return;
  }
  if (!error && !sukses) return;
  toastTimer = setTimeout(() => {
    pesanError.value = "";
    pesanSukses.value = "";
    toastTimer = null;
  }, 3000);
});

const currentConfig = computed(() => configs[activeView.value]);
const activeStockView = computed(() => stokViews[activeView.value]);
const activeStockGroup = computed(() => activeStockView.value?.group);
const isAdmin = computed(() => (pengguna.value?.role || pengguna.value?.peran) === "admin");
const roleAktif = computed(() => normalisasiRoleFrontend(pengguna.value?.role || pengguna.value?.peran || ""));
const stockPageComponents = {
  stokPrinter: StockPrinter,
  stokToner: StockToner,
  stokSparepart: StockSparepart
};
const crudPageComponents = {
  pengaduan: Complaint,
  suratTugas: SuratTugas,
  printerTerpasang: PrinterTerpasang,
  pelanggan: Pelanggan,
  lokasi: Lokasi,
  printer: PrinterMaster,
  toner: Toner,
  sukuCadang: Sparepart,
  gudang: Gudang,
  pengguna: User
};
const currentStockComponent = computed(() => stockPageComponents[activeView.value]);
const currentCrudComponent = computed(() => crudPageComponents[activeView.value]);
const pageTitle = computed(() => {
  if (activeView.value === "audit") return "Audit Trail";
  if (activeView.value === "rolePermission") return "Role Permission";
  if (activeView.value === "slaPending") return "SLA Pending Komplain";
  if (activeStockView.value) return activeStockView.value.title;
  return currentConfig.value?.title || "Ringkasan Aplikasi";
});
const pageSubtitle = computed(() => {
  if (activeView.value === "audit") return "Filter riwayat berdasarkan tanggal, nomor komplain, atau nomor surat tugas.";
  if (activeView.value === "rolePermission") return "Atur hak akses setiap role terhadap modul aplikasi.";
  if (activeView.value === "slaPending") return "Atur batas jam komplain New otomatis menjadi Pending.";
  if (activeStockView.value) return activeStockView.value.subtitle;
  return currentConfig.value?.subtitle || "Selamat datang di portal operasional Multiprint.";
});
const canCreate = computed(() => {
  if (!currentConfig.value) return false;
  if (isAdmin.value) return true;
  if (activeView.value === "pengaduan") return roleAktif.value === "sales_admin";
  if (activeView.value === "suratTugas") return roleAktif.value === "kepala_teknisi";
  if (activeView.value === "pengguna") return false;
  return ["admin", "warehouse"].includes(roleAktif.value);
});
const formTabs = computed(() => {
  if (currentConfig.value?.flow === "pengaduan") return ["general", "suratTugas"];
  if (currentConfig.value?.flow === "suratTugas") return ["general", "item"];
  return ["general"];
});
const currentFormFields = computed(() => currentConfig.value?.fields || []);
const currentVisibleFormFields = computed(() => currentFormFields.value.filter(tampilkanFieldForm));
const relatedSuratTugas = computed(() => {
  if (currentConfig.value?.flow !== "pengaduan" || !form.id) return [];
  return options.suratTugas.filter((item) => item.pengaduan_id === form.id);
});
const pemakaianSuratAktif = computed(() => {
  if (currentConfig.value?.flow !== "suratTugas") return [];
  return form.pemakaian_barang_surat_tugas || form.pemakaian || [];
});
const filteredPermissionRows = computed(() => {
  const keyword = pengaturan.filterModul.trim().toLowerCase();
  if (!keyword) return pengaturan.permissions;
  return pengaturan.permissions.filter((item) => permissionModuleLabel(item.modul).toLowerCase().includes(keyword));
});
const filteredItems = computed(() => {
  const keyword = cari.value.trim().toLowerCase();
  if (!keyword) return items.value;
  return items.value.filter((item) => textBlob(item).toLowerCase().includes(keyword));
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pagination.pageSize)));
const paginatedItems = computed(() => {
  const page = Math.min(pagination.page, totalPages.value);
  const start = (page - 1) * pagination.pageSize;
  return filteredItems.value.slice(start, start + pagination.pageSize);
});
const paginationStart = computed(() => {
  if (!filteredItems.value.length) return 0;
  return (Math.min(pagination.page, totalPages.value) - 1) * pagination.pageSize + 1;
});
const paginationEnd = computed(() => Math.min(paginationStart.value + pagination.pageSize - 1, filteredItems.value.length));
const filteredAuditItems = computed(() => {
  const keyword = [auditFilter.user, auditFilter.nomor_pengaduan, auditFilter.nomor_surat_tugas].join(" ").trim().toLowerCase();
  if (!keyword) return auditItems.value;
  return auditItems.value.filter((item) => textBlob(item).toLowerCase().includes(keyword));
});
const auditFilterSiap = computed(() => {
  const adaTanggal = Boolean(auditFilter.tanggal_mulai || auditFilter.tanggal_selesai);
  const adaTarget = Boolean(auditFilter.user || auditFilter.nomor_pengaduan || auditFilter.nomor_surat_tugas);
  return adaTanggal && adaTarget;
});
const auditTotalPages = computed(() => Math.max(1, Math.ceil(filteredAuditItems.value.length / auditPagination.pageSize)));
const paginatedAuditItems = computed(() => {
  const page = Math.min(auditPagination.page, auditTotalPages.value);
  const start = (page - 1) * auditPagination.pageSize;
  return filteredAuditItems.value.slice(start, start + auditPagination.pageSize);
});
const auditPaginationStart = computed(() => {
  if (!filteredAuditItems.value.length) return 0;
  return (Math.min(auditPagination.page, auditTotalPages.value) - 1) * auditPagination.pageSize + 1;
});
const auditPaginationEnd = computed(() => Math.min(auditPaginationStart.value + auditPagination.pageSize - 1, filteredAuditItems.value.length));
const filteredStok = computed(() => {
  const keyword = stokSearch.value.trim().toLowerCase();
  return ["toner", "printer", "suku_cadang"].reduce((result, group) => {
    const rows = stok[group] || [];
    result[group] = keyword ? rows.filter((row) => textBlob(row).toLowerCase().includes(keyword)) : rows;
    return result;
  }, {});
});
const stokTotalPages = computed(() =>
  ["toner", "printer", "suku_cadang"].reduce((result, group) => {
    result[group] = Math.max(1, Math.ceil((filteredStok.value[group]?.length || 0) / stokPagination[group].pageSize));
    return result;
  }, {})
);
const paginatedStok = computed(() =>
  ["toner", "printer", "suku_cadang"].reduce((result, group) => {
    const target = stokPagination[group];
    const page = Math.min(target.page, stokTotalPages.value[group]);
    const start = (page - 1) * target.pageSize;
    result[group] = (filteredStok.value[group] || []).slice(start, start + target.pageSize);
    return result;
  }, {})
);
const targetHapusLabel = computed(() => {
  const item = targetHapus.value || {};
  return (
    item.nomor_pengaduan ||
    item.nomor_surat_tugas ||
    item.kode_pelanggan ||
    item.nama_pelanggan ||
    item.nama_lokasi ||
    item.kode_printer ||
    item.model ||
    item.nama_toner ||
    item.nama_suku_cadang ||
    item.nama_gudang ||
    item.user_id ||
    item.name ||
    item.nama ||
    "data ini"
  );
});
const judulKonfirmasi = computed(() => {
  if (modeKonfirmasi.value === "delete") return "Hapus permanen data ini?";
  if (currentConfig.value?.flow) return "Batalkan data ini?";
  return "Nonaktifkan data ini?";
});
const eyebrowKonfirmasi = computed(() => {
  if (modeKonfirmasi.value === "delete") return "Konfirmasi Penghapusan";
  if (currentConfig.value?.flow) return "Konfirmasi Pembatalan";
  return "Konfirmasi Penonaktifan";
});
const deskripsiKonfirmasi = computed(() => {
  if (modeKonfirmasi.value === "delete") {
    return "Data akan dihapus permanen dan tidak bisa dikembalikan. Sistem akan menolak jika data sudah dipakai transaksi.";
  }
  if (currentConfig.value?.flow) {
    return "Status akan diubah menjadi cancelled. Riwayat dan audit tetap tersimpan.";
  }
  return "Data tetap tersimpan, tapi tidak dipakai untuk transaksi baru.";
});
const labelTombolKonfirmasi = computed(() => {
  if (modeKonfirmasi.value === "delete") return loading.value ? "Menghapus..." : "Hapus Permanen";
  if (currentConfig.value?.flow) return loading.value ? "Membatalkan..." : "Batalkan";
  return loading.value ? "Menonaktifkan..." : "Nonaktifkan";
});
const namaPenggunaAktif = computed(() => pengguna.value?.name || pengguna.value?.nama || pengguna.value?.user_id || "User");
const rolePenggunaAktif = computed(() => roleLabel(pengguna.value?.role || pengguna.value?.peran || "-"));
const inisialPenggunaAktif = computed(() =>
  namaPenggunaAktif.value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "U"
);

function field(name, label, type = "text", required = false, optionsList = [], extra = {}) {
  return { name, label, type, required, options: optionsList, ...extra };
}

function relation(name, label, source, optionLabel, required = false, extra = {}) {
  return { name, label, type: "relation", source, optionLabel, required, ...extra };
}

function textBlob(value) {
  if (value == null) return "";
  if (typeof value === "object") return Object.values(value).map(textBlob).join(" ");
  return String(value);
}

function resetPagination() {
  pagination.page = 1;
}

function resetAuditPagination() {
  auditPagination.page = 1;
}

function resetStockPagination() {
  Object.values(stokPagination).forEach((target) => {
    target.page = 1;
  });
}

function paginationMulai(total, target) {
  if (!total) return 0;
  return (Math.min(target.page, Math.max(1, Math.ceil(total / target.pageSize))) - 1) * target.pageSize + 1;
}

function paginationSelesai(total, target) {
  return Math.min(paginationMulai(total, target) + target.pageSize - 1, total);
}

function halamanSebelumnya(target = pagination) {
  if (target.page > 1) target.page -= 1;
}

function halamanBerikutnya(target, total) {
  if (target.page < total) target.page += 1;
}

function toggleMenu(item) {
  if (item.children) item.terbuka = !item.terbuka;
}

function pilihMenu(item) {
  if (item.children) {
    toggleMenu(item);
    return;
  }
  if (!item.key) return;
  if (item.key === "logout") {
    keluar();
    return;
  }
  activeView.value = item.key;
  sidebarTerbuka.value = false;
  userMenuTerbuka.value = false;
  cari.value = "";
  stokSearch.value = "";
  resetPagination();
  resetAuditPagination();
  resetStockPagination();
  pesanError.value = "";
  pesanSukses.value = "";
  muatHalaman();
}

function valueOf(item, key) {
  const value = item?.[key];
  if (typeof value === "boolean") return value ? "Aktif" : "Nonaktif";
  if (key.includes("tanggal") && value) return new Date(value).toLocaleDateString("id-ID");
  if (["status", "prioritas", "peran", "active", "role"].includes(key)) return labelStatus(value);
  if (key === "pelanggan_id") return options.pelanggan.find((row) => row.id === value)?.nama_pelanggan || value || "-";
  if (key === "lokasi_pelanggan_id") return options.lokasi.find((row) => row.id === value)?.nama_lokasi || value || "-";
  if (key === "printer_id") return options.printer.find((row) => row.id === value)?.model || value || "-";
  return value || "-";
}

function labelStatus(value) {
  const labels = {
    new: "New",
    pending: "Pending",
    progress: "Progress",
    solved: "Solved",
    cancelled: "Cancelled",
    ready_to_print: "Ready to Print",
    technician_completed: "Technician Completed",
    warehouse_validated: "Validasi 1",
    sales_admin: "sales-admin",
    kepala_teknisi: "kepala-teknisi"
  };
  return labels[value] || value || "-";
}

function formatTanggalPdf(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function nl2br(value) {
  return escapeHtml(value || "-").replace(/\n/g, "<br>");
}

function penggunaLabel(user) {
  return user?.name || user?.nama || user?.user_id || "-";
}

function picSurat(item) {
  const primary = item?.teknisi_surat_tugas?.find((row) => row.peran === "utama") || item?.teknisi?.find?.((row) => row.peran === "utama");
  if (primary?.master_pengguna) return penggunaLabel(primary.master_pengguna);
  const id = primary?.teknisi_id || item?.pic_teknisi_id;
  return penggunaLabel(options.pengguna.find((user) => user.id === id));
}

function nomorKomplainSurat(item) {
  if (item?.pengaduan?.nomor_pengaduan) return item.pengaduan.nomor_pengaduan;
  return options.pengaduan.find((row) => row.id === item?.pengaduan_id)?.nomor_pengaduan || "-";
}

function alamatSurat(item) {
  return item?.master_lokasi_pelanggan?.alamat || item?.master_pelanggan?.alamat || "-";
}

function pemakaianSurat(item) {
  return item?.pemakaian_barang_surat_tugas || item?.pemakaian || [];
}

function kodeItemSurat(item) {
  return (
    item?.master_toner?.kode_toner ||
    item?.master_printer?.kode_printer ||
    item?.master_suku_cadang?.kode_suku_cadang ||
    item?.jenis_barang ||
    "-"
  );
}

function deskripsiItemSurat(item) {
  return (
    item?.master_toner?.nama_toner ||
    item?.master_printer?.model ||
    item?.master_suku_cadang?.nama_suku_cadang ||
    item?.keterangan ||
    "-"
  );
}

function catatanPdfSurat(item) {
  return [item?.catatan_masalah, item?.tindakan, item?.hasil]
    .filter(Boolean)
    .join("\n");
}

function templatePdfSurat(item) {
  const rows = pemakaianSurat(item);
  const itemRows = rows.length
    ? rows.map((row) => `
        <tr>
          <td>${escapeHtml(kodeItemSurat(row))}</td>
          <td>Stock</td>
          <td>${escapeHtml(deskripsiItemSurat(row))}</td>
          <td>${escapeHtml(row.jumlah_pakai)}</td>
          <td>${escapeHtml(row.serial_number || "No Serial")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="5" class="empty">Tidak ada item/barang.</td></tr>`;
  const validator = penggunaLabel(item.master_pengguna_surat_tugas_validasi_warehouse_olehTomaster_pengguna);
  const authorizer = penggunaLabel(
    item.master_pengguna_surat_tugas_validasi_kepala_olehTomaster_pengguna ||
    item.master_pengguna_surat_tugas_disetujui_olehTomaster_pengguna
  );
  const validatedAt = item.validasi_warehouse_pada ? formatTanggalPdf(item.validasi_warehouse_pada) : "";
  const authorizedAt = (item.validasi_kepala_teknisi_pada || item.disetujui_pada)
    ? formatTanggalPdf(item.validasi_kepala_teknisi_pada || item.disetujui_pada)
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(item.nomor_surat_tugas || "Surat Tugas")}</title>
  <style>
    @page { size: A4 landscape; margin: 20mm 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #000; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.35; }
    .sheet { width: 100%; min-height: 180mm; padding: 10px 0; }
    h1 { margin: 0 0 4px; font-size: 22px; line-height: 1.1; letter-spacing: .2px; }
    .company p { margin: 0; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 90px; margin-top: 58px; }
    .meta-row { display: grid; grid-template-columns: 190px 20px 1fr; min-height: 36px; align-items: start; }
    table { width: 100%; border-collapse: collapse; }
    .items { margin-top: 48px; }
    th, td { border: 1px solid #000; padding: 4px 8px; text-align: left; vertical-align: top; }
    th { font-weight: 700; }
    .empty { text-align: center; }
    .notes { min-height: 84px; margin-top: 50px; border: 1px solid #000; padding: 10px 12px; }
    .notes strong { display: block; margin-bottom: 12px; font-weight: 400; }
    .signatures { width: 74%; margin: 78px 0 0 auto; }
    .signatures td { width: 33.333%; height: 96px; padding: 8px 10px; }
    .signature-name { display: block; margin-top: 48px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet { padding: 0; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="company">
      <h1>PT. MULTI PRIMA MANDIRI SUKSES</h1>
      <p>Jl. Hidup Baru Blok D No.6 Gunung Sahari DKI Jakarta 14420</p>
      <p>Telp.6415351/52 Fax. 6415263</p>
    </section>

    <section class="meta">
      <div>
        <div class="meta-row"><span>Tanggal Surat Tugas</span><span>:</span><span>${escapeHtml(formatTanggalPdf(item.tanggal_jadwal || item.tanggal_dibuat))}</span></div>
        <div class="meta-row"><span>Nomor surat tugas</span><span>:</span><span>${escapeHtml(item.nomor_surat_tugas)}</span></div>
        <div class="meta-row"><span>Jenis tugas</span><span>:</span><span>${escapeHtml(item.jenis_pekerjaan || "Service")}</span></div>
      </div>
      <div>
        <div class="meta-row"><span>Request By</span><span>:</span><span>${escapeHtml(picSurat(item))}</span></div>
        <div class="meta-row"><span>Request Address</span><span>:</span><span>${escapeHtml(alamatSurat(item))}</span></div>
        <div class="meta-row"><span>No. Komplain</span><span>:</span><span>${escapeHtml(nomorKomplainSurat(item))}</span></div>
      </div>
    </section>

    <table class="items">
      <thead>
        <tr>
          <th style="width: 12%;">Item ID</th>
          <th style="width: 18%;">Item Type</th>
          <th>Item Description</th>
          <th style="width: 6%;">Qty</th>
          <th style="width: 30%;">Serial No</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <section class="notes">
      <strong>Notes :</strong>
      <div>${nl2br(catatanPdfSurat(item))}</div>
    </section>

    <table class="signatures">
      <tr>
        <td>Validate by<span class="signature-name">${escapeHtml(validator)}${validatedAt ? `<br>${escapeHtml(validatedAt)}` : ""}</span></td>
        <td>Authorized by<span class="signature-name">${escapeHtml(authorizer)}${authorizedAt ? `<br>${escapeHtml(authorizedAt)}` : ""}</span></td>
        <td>Customer</td>
      </tr>
    </table>
  </main>
</body>
</html>`;
}

async function cetakSuratTugas(item) {
  if (!canPrintSuratItem(item)) {
    pesanError.value = "PDF surat tugas baru bisa dicetak setelah status Ready to Print.";
    return;
  }
  try {
    loading.value = true;
    const response = await api.get(`/surat-tugas/${item.id}`);
    const detail = response.data.data;
    const popup = window.open("", "_blank", "width=1200,height=800");
    if (!popup) {
      pesanError.value = "Popup diblokir browser. Izinkan popup untuk mencetak PDF surat tugas.";
      return;
    }
    popup.document.open();
    popup.document.write(templatePdfSurat(detail));
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 350);
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "PDF surat tugas gagal dibuat.";
  } finally {
    loading.value = false;
  }
}

function labelAction(action) {
  const labels = {
    view: "View",
    create: "Create",
    update: "Update",
    delete: "Delete",
    resolve: "Resolve",
    workflow: "Workflow"
  };
  return labels[action] || action;
}

function permissionKey(action) {
  return `can_${action}`;
}

function permissionModuleLabel(modul) {
  return pengaturan.modules.find((item) => item.key === modul)?.label || modul;
}

function roleLabel(role) {
  return labelStatus(role).replace("-", " ");
}

function normalisasiRoleFrontend(role) {
  return String(role || "")
    .replace("sales-admin", "sales_admin")
    .replace("kepala-teknisi", "kepala_teknisi");
}

function teknisiAssigned(item) {
  if (isAdmin.value) return true;
  return item?.teknisi_surat_tugas?.some((row) => row.teknisi_id === pengguna.value?.id);
}

function suratPunyaItem(item) {
  return Boolean(item?.pemakaian_barang_surat_tugas?.length || item?.pemakaian?.length);
}

function statusBisaPrint(status) {
  return ["ready_to_print", "technician_completed", "warehouse_validated", "solved"].includes(status);
}

function canUpdateItem(item) {
  if (isAdmin.value) return true;
  if (activeView.value === "pengaduan") return false;
  if (activeView.value === "suratTugas") return roleAktif.value === "kepala_teknisi" || (roleAktif.value === "teknisi" && teknisiAssigned(item));
  return roleAktif.value === "admin";
}

function canOpenItem(item) {
  if (!item) return false;
  if (["pengaduan", "suratTugas"].includes(activeView.value)) return true;
  return canUpdateItem(item);
}

function canDeactivateItem(item) {
  if (!item) return false;
  if (currentConfig.value?.flow) return isAdmin.value && !["solved", "cancelled"].includes(item.status);
  return canUpdateItem(item);
}

function canResolveComplaintItem(item) {
  if (!(isAdmin.value || roleAktif.value === "sales_admin")) return false;
  if (["solved", "cancelled"].includes(item?.status)) return false;
  const suratTerkait = options.suratTugas.filter((surat) => surat.pengaduan_id === item?.id);
  return suratTerkait.length > 0 && suratTerkait.every((surat) => surat.status === "solved");
}

function canRunSuratAction(item, action) {
  if (!item) return false;
  if (action === "start") return (isAdmin.value || roleAktif.value === "kepala_teknisi") && item.status === "pending";
  if (action === "readyToPrint") return (isAdmin.value || (roleAktif.value === "teknisi" && teknisiAssigned(item))) && item.status === "progress";
  if (action === "selesaiTeknisi") return (isAdmin.value || (roleAktif.value === "teknisi" && teknisiAssigned(item))) && item.status === "ready_to_print";
  if (action === "validasiWarehouse") return (isAdmin.value || roleAktif.value === "warehouse") && item.status === "technician_completed" && suratPunyaItem(item);
  if (action === "resolve") {
    if (!(isAdmin.value || roleAktif.value === "kepala_teknisi")) return false;
    return suratPunyaItem(item) ? item.status === "warehouse_validated" : item.status === "technician_completed";
  }
  return false;
}

function canPrintSuratItem(item) {
  return currentConfig.value?.flow === "suratTugas" && statusBisaPrint(item?.status);
}

function canTambahItemSurat() {
  return form.id && (isAdmin.value || (roleAktif.value === "teknisi" && teknisiAssigned(form))) && ["progress", "ready_to_print"].includes(form.status);
}

function handleFieldChange(name) {
  if (name === "jenis_pelanggan" && form.jenis_pelanggan === "single") {
    form.alamat = form.alamat || "";
  }
  if (name === "pelanggan_id") {
    form.lokasi_pelanggan_id = customerMultisite(form.pelanggan_id) ? form.lokasi_pelanggan_id : "";
  }
  if (currentConfig.value?.flow === "suratTugas" && name === "pengaduan_id") {
    const pengaduan = options.pengaduan.find((item) => item.id === form.pengaduan_id);
    if (!pengaduan) return;
    form.mp_no = pengaduan.mp_no || "";
    form.pelanggan_id = pengaduan.pelanggan_id || "";
    form.lokasi_pelanggan_id = pengaduan.lokasi_pelanggan_id || "";
    form.catatan_masalah = pengaduan.deskripsi_masalah || "";
  }
}

function customerDipilih(pelangganId = form.pelanggan_id) {
  return options.pelanggan.find((item) => item.id === pelangganId);
}

function customerMultisite(pelangganId = form.pelanggan_id) {
  return customerDipilih(pelangganId)?.jenis_pelanggan === "multisite";
}

function tampilkanFieldForm(item) {
  if (item.name === "status" && activeView.value === "suratTugas" && !isAdmin.value) {
    return false;
  }
  if (item.name === "lokasi_pelanggan_id" && ["pengaduan", "suratTugas", "printerTerpasang"].includes(activeView.value)) {
    return customerMultisite();
  }
  return true;
}

function fieldWajib(item) {
  if (item.name === "alamat" && activeView.value === "pelanggan" && form.jenis_pelanggan === "single") return true;
  if (item.name === "lokasi_pelanggan_id" && ["pengaduan", "suratTugas", "printerTerpasang"].includes(activeView.value)) return customerMultisite();
  return item.required;
}

function relationOptions(item) {
  const rows = options[item.source] || [];
  if (item.name === "sales_id") {
    return rows.filter((option) => normalisasiRoleFrontend(option.role || option.peran) === "sales");
  }
  if (activeView.value === "lokasi" && item.name === "pelanggan_id") {
    return rows.filter((option) => option.jenis_pelanggan === "multisite");
  }
  if (activeView.value === "printerTerpasang" && item.name === "lokasi_pelanggan_id" && form.pelanggan_id) {
    return rows.filter((option) => option.pelanggan_id === form.pelanggan_id);
  }
  if (item.name === "lokasi_pelanggan_id" && form.pelanggan_id) {
    return rows.filter((option) => option.pelanggan_id === form.pelanggan_id);
  }
  return rows;
}

function badgeClass(value) {
  if (value === true || ["aktif", "terhubung", "selesai", "disetujui", "terposting", "solved", "warehouse_validated"].includes(String(value).toLowerCase())) return "success";
  if (["darurat", "tinggi", "dibatalkan", "nonaktif", "cancelled"].includes(String(value).toLowerCase())) return "danger";
  if (["draft", "baru", "ditugaskan", "diproses", "diajukan", "new", "pending", "progress", "ready_to_print", "technician_completed"].includes(String(value).toLowerCase())) return "info";
  return "neutral";
}

function resetForm() {
  Object.keys(form).forEach((key) => delete form[key]);
  currentConfig.value?.fields.forEach((item) => {
    if (item.type === "checkbox") form[item.name] = true;
    else if (item.defaultValue === "now") form[item.name] = localDateTimeValue();
    else form[item.name] = item.defaultValue || "";
  });
}

function localDateTimeValue(value = new Date()) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function resetItemForm() {
  Object.assign(itemForm, {
    gudang_id: "",
    jenis_barang: "toner",
    item_id: "",
    jumlah_pakai: 1,
    serial_number: "",
    keterangan: ""
  });
}

async function bukaForm(item = null, prefill = null) {
  resetForm();
  formTab.value = "general";
  resetItemForm();
  modeForm.value = item ? "edit" : "create";
  if (currentConfig.value?.fields?.some((fieldItem) => fieldItem.type === "relation")) {
    await muatOptions();
  }
  if (item) {
    let sumber = item;
    if (currentConfig.value?.flow === "suratTugas") {
      try {
        loading.value = true;
        const response = await api.get(`/surat-tugas/${item.id}`);
        sumber = response.data.data || item;
      } catch (error) {
        pesanError.value = error.response?.data?.pesan || "Detail surat tugas gagal dimuat.";
      } finally {
        loading.value = false;
      }
    }
    Object.assign(form, sumber);
    form.id = sumber.id;
    form.pic_teknisi_id = sumber.teknisi_surat_tugas?.find((row) => row.peran === "utama")?.teknisi_id || "";
    currentConfig.value?.fields.forEach((fieldItem) => {
      if (fieldItem.type === "datetime-local" && form[fieldItem.name]) {
        form[fieldItem.name] = String(form[fieldItem.name]).slice(0, 16);
      }
      if (fieldItem.type === "date" && form[fieldItem.name]) {
        form[fieldItem.name] = String(form[fieldItem.name]).slice(0, 10);
      }
      if (fieldItem.name === "password") form[fieldItem.name] = "";
    });
  }
  if (prefill) Object.assign(form, prefill);
  modalTerbuka.value = true;
}

function payloadForm() {
  const data = {};
  currentConfig.value.fields.forEach((item) => {
    const value = form[item.name];
    if (item.readonly && (value === "" || value == null)) return;
    if (item.name === "password" && modeForm.value === "edit" && !value) return;
    if (item.type === "number") data[item.name] = value === "" || value == null ? 0 : Number(value);
    else if (item.type === "checkbox") data[item.name] = Boolean(value);
    else data[item.name] = value === "" ? null : value;
  });
  if (["pengaduan", "suratTugas", "printerTerpasang"].includes(activeView.value) && !customerMultisite(data.pelanggan_id || form.pelanggan_id)) {
    data.lokasi_pelanggan_id = null;
  }
  return data;
}

async function simpanForm() {
  if (modeForm.value === "edit" && !canUpdateItem(form)) {
    pesanError.value = "Anda tidak memiliki akses untuk mengubah data ini.";
    return;
  }
  if (modeForm.value === "create" && !canCreate.value) {
    pesanError.value = "Anda tidak memiliki akses untuk membuat data ini.";
    return;
  }
  try {
    loading.value = true;
    const config = currentConfig.value;
    if (modeForm.value === "edit") {
      await api.put(`${config.endpoint}/${form.id}`, payloadForm());
      pesanSukses.value = "Data berhasil diperbarui.";
    } else {
      await api.post(config.endpoint, payloadForm());
      pesanSukses.value = "Data berhasil dibuat.";
    }
    modalTerbuka.value = false;
    await muatOptions();
    await muatHalaman();
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "Data gagal disimpan.";
  } finally {
    loading.value = false;
  }
}

function mintaKonfirmasi(item, mode = "deactivate") {
  targetHapus.value = item;
  modeKonfirmasi.value = mode;
  konfirmasiHapusTerbuka.value = true;
}

function batalHapus() {
  if (loading.value) return;
  targetHapus.value = null;
  modeKonfirmasi.value = "deactivate";
  konfirmasiHapusTerbuka.value = false;
}

async function konfirmasiHapus() {
  const item = targetHapus.value;
  if (!item) return;
  try {
    loading.value = true;
    if (modeKonfirmasi.value === "delete") {
      await api.delete(`${currentConfig.value.endpoint}/${item.id}/permanent`);
      pesanSukses.value = "Data berhasil dihapus permanen.";
    } else if (currentConfig.value.flow === "suratTugas") {
      await api.put(`/surat-tugas/${item.id}`, { status: "cancelled" });
      pesanSukses.value = "Surat tugas dibatalkan.";
    } else if (currentConfig.value.flow === "pengaduan") {
      await api.delete(`${currentConfig.value.endpoint}/${item.id}`);
      pesanSukses.value = "Komplain dibatalkan.";
    } else {
      await api.delete(`${currentConfig.value.endpoint}/${item.id}`);
      pesanSukses.value = "Data berhasil dinonaktifkan.";
    }
    await muatHalaman();
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "Aksi data gagal diproses.";
  } finally {
    loading.value = false;
    targetHapus.value = null;
    modeKonfirmasi.value = "deactivate";
    konfirmasiHapusTerbuka.value = false;
  }
}

async function aksiSurat(item, action) {
  const actionMap = {
    start: {
      endpoint: "start",
      pesan: "Surat tugas dimulai."
    },
    readyToPrint: {
      endpoint: "ready-to-print",
      pesan: "Surat tugas siap dicetak."
    },
    selesaiTeknisi: {
      endpoint: "selesai-teknisi",
      pesan: "Surat tugas selesai oleh teknisi."
    },
    validasiWarehouse: {
      endpoint: "validasi-warehouse",
      pesan: "Validasi 1 warehouse berhasil."
    },
    resolve: {
      endpoint: "resolve",
      pesan: "Validasi 2 kepala teknisi berhasil."
    },
    ajukan: {
      endpoint: "ready-to-print",
      pesan: "Surat tugas siap dicetak."
    },
    setujui: {
      endpoint: "validasi-warehouse",
      pesan: "Barang surat tugas berhasil divalidasi warehouse."
    }
  };
  const target = actionMap[action];
  if (!target) return;
  if (!canRunSuratAction(item, action)) {
    pesanError.value = "Anda tidak memiliki akses atau status surat tugas belum sesuai untuk aksi ini.";
    return;
  }
  try {
    loading.value = true;
    await api.post(`/surat-tugas/${item.id}/${target.endpoint}`);
    pesanSukses.value = target.pesan;
    await muatHalaman();
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "Aksi surat tugas gagal.";
  } finally {
    loading.value = false;
  }
}

async function resolveKomplain(item) {
  if (!canResolveComplaintItem(item)) {
    pesanError.value = "Hanya sales admin yang bisa resolve komplain setelah surat tugas selesai.";
    return;
  }
  try {
    loading.value = true;
    await api.post(`/pengaduan/${item.id}/resolve`);
    pesanSukses.value = "Komplain berhasil diselesaikan.";
    await muatHalaman();
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "Komplain gagal diselesaikan.";
  } finally {
    loading.value = false;
  }
}

function buatSuratDariKomplain() {
  if (!(isAdmin.value || roleAktif.value === "kepala_teknisi")) {
    pesanError.value = "Hanya kepala teknisi yang bisa membuat surat tugas dari komplain.";
    return;
  }
  const sumber = { ...form };
  activeView.value = "suratTugas";
  bukaForm(null, {
    pengaduan_id: sumber.id || "",
    mp_no: sumber.mp_no || "",
    pelanggan_id: sumber.pelanggan_id || "",
    lokasi_pelanggan_id: sumber.lokasi_pelanggan_id || "",
    catatan_masalah: sumber.deskripsi_masalah || "",
    status: "pending"
  });
}

async function simpanItemSurat() {
  if (!form.id) return;
  if (!canTambahItemSurat()) {
    pesanError.value = "Item hanya bisa ditambahkan oleh teknisi assigned saat surat tugas progress atau ready to print.";
    return;
  }
  try {
    loading.value = true;
    const idField = {
      toner: "toner_id",
      printer: "printer_id",
      suku_cadang: "suku_cadang_id"
    }[itemForm.jenis_barang];
    await api.post(`/surat-tugas/${form.id}/pemakaian`, {
      gudang_id: itemForm.gudang_id,
      jenis_barang: itemForm.jenis_barang,
      [idField]: itemForm.item_id,
      jumlah_pakai: Number(itemForm.jumlah_pakai),
      serial_number: itemForm.serial_number || null,
      keterangan: itemForm.keterangan || null
    });
    pesanSukses.value = "Item surat tugas berhasil ditambahkan.";
    const response = await api.get(`/surat-tugas/${form.id}`);
    Object.assign(form, response.data.data);
    await muatHalaman();
    resetItemForm();
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "Item surat tugas gagal ditambahkan.";
  } finally {
    loading.value = false;
  }
}

async function hapusItemSurat(item) {
  if (!form.id || !canTambahItemSurat()) return;
  if (!window.confirm("Hapus item surat tugas ini?")) return;
  try {
    loading.value = true;
    await api.delete(`/surat-tugas/${form.id}/pemakaian/${item.id}`);
    pesanSukses.value = "Item surat tugas berhasil dihapus.";
    const response = await api.get(`/surat-tugas/${form.id}`);
    Object.assign(form, response.data.data);
    await muatHalaman();
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "Item surat tugas gagal dihapus.";
  } finally {
    loading.value = false;
  }
}

function bukaMutasiStok() {
  Object.assign(stockForm, {
    jenis_mutasi: "masuk",
    gudang_asal_id: "",
    gudang_tujuan_id: "",
    jenis_barang: activeStockGroup.value || "toner",
    item_id: "",
    jumlah: 1,
    keterangan: "",
    langsung_posting: true
  });
  modalStokTerbuka.value = true;
}

async function simpanMutasiStok() {
  try {
    loading.value = true;
    const idField = {
      toner: "toner_id",
      printer: "printer_id",
      suku_cadang: "suku_cadang_id"
    }[stockForm.jenis_barang];
    await api.post("/mutasi-stok", {
      jenis_mutasi: stockForm.jenis_mutasi,
      gudang_asal_id: stockForm.gudang_asal_id || null,
      gudang_tujuan_id: stockForm.gudang_tujuan_id || null,
      keterangan: stockForm.keterangan || null,
      langsung_posting: stockForm.langsung_posting,
      detail: [
        {
          jenis_barang: stockForm.jenis_barang,
          [idField]: stockForm.item_id,
          jumlah: Number(stockForm.jumlah),
          satuan: "pcs"
        }
      ]
    });
    pesanSukses.value = "Mutasi stok berhasil dibuat.";
    modalStokTerbuka.value = false;
    await muatStok();
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "Mutasi stok gagal disimpan.";
  } finally {
    loading.value = false;
  }
}

async function muatOptions() {
  const loaders = [
    ["pelanggan", "/pelanggan"],
    ["lokasi", "/lokasi-pelanggan"],
    ["printer", "/printer"],
    ["toner", "/toner"],
    ["sukuCadang", "/suku-cadang"],
    ["gudang", "/gudang"],
    ["pengguna", "/pengguna"],
    ["printerTerpasang", "/printer-terpasang"],
    ["pengaduan", "/pengaduan"],
    ["suratTugas", "/surat-tugas"]
  ];
  const responses = await Promise.allSettled(loaders.map(([, endpoint]) => api.get(endpoint, { params: { batas: 100 } })));
  const gagalWajib = [];
  responses.forEach((result, index) => {
    const key = loaders[index][0];
    if (result.status !== "fulfilled") {
      if (["pelanggan", "lokasi", "pengguna"].includes(key)) gagalWajib.push(key);
      return;
    }
    const data = result.value.data.data;
    options[key] = Array.isArray(data) ? data : data?.items || [];
  });
  options.teknisi = options.pengguna.filter((item) => ["teknisi", "technician"].includes(item.role || item.peran));
  if (gagalWajib.length) {
    pesanError.value = `Data dropdown gagal dimuat: ${gagalWajib.join(", ")}.`;
  }
}

async function muatHalaman() {
  if (activeView.value === "dashboard") {
    await Promise.all([muatOptions(), muatStok(true)]);
    return;
  }
  if (["rolePermission", "slaPending"].includes(activeView.value)) {
    await muatPengaturan();
    return;
  }
  if (activeStockView.value) {
    await muatStok();
    return;
  }
  if (activeView.value === "audit") {
    auditItems.value = [];
    return;
  }
  const config = currentConfig.value;
  if (!config) return;
  try {
    loading.value = true;
    const response = await api.get(config.endpoint, { params: config.search ? { cari: cari.value, batas: 100 } : {} });
    const data = response.data.data;
    items.value = Array.isArray(data) ? data : data?.items || [];
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "Data gagal dimuat.";
  } finally {
    loading.value = false;
  }
}

async function muatPengaturan() {
  try {
    loading.value = true;
    const response = await api.get("/pengaturan", { params: { role: pengaturan.roleDipilih } });
    const data = response.data.data;
    pengaturan.slaPendingJam = data.sla?.pending_setelah_jam || 24;
    pengaturan.roles = data.roles || pengaturan.roles;
    pengaturan.modules = data.modules || [];
    pengaturan.actions = data.actions || pengaturan.actions;
    pengaturan.permissions = data.permissions || [];
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "Pengaturan gagal dimuat.";
  } finally {
    loading.value = false;
  }
}

async function simpanSla() {
  try {
    loading.value = true;
    await api.put("/pengaturan/sla-pending-komplain", {
      pending_setelah_jam: Number(pengaturan.slaPendingJam)
    });
    pesanSukses.value = "SLA pending komplain berhasil disimpan.";
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "SLA gagal disimpan.";
  } finally {
    loading.value = false;
  }
}

async function simpanPermission() {
  try {
    loading.value = true;
    const response = await api.put("/pengaturan/role-permission", {
      role: pengaturan.roleDipilih,
      permissions: pengaturan.permissions
    });
    pengaturan.permissions = response.data.data || pengaturan.permissions;
    pesanSukses.value = "Permission role berhasil disimpan.";
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "Permission gagal disimpan.";
  } finally {
    loading.value = false;
  }
}

async function muatStok(silent = false) {
  try {
    loading.value = true;
    const response = await api.get("/stok");
    Object.assign(stok, response.data.data);
  } catch (error) {
    if (!silent) pesanError.value = error.response?.data?.pesan || "Stok gagal dimuat.";
  } finally {
    loading.value = false;
  }
}

async function muatAudit() {
  if (!auditFilterSiap.value) {
    auditItems.value = [];
    return;
  }
  try {
    loading.value = true;
    const params = Object.fromEntries(
      Object.entries(auditFilter).filter(([, value]) => value)
    );
    const response = await api.get("/audit", { params });
    auditItems.value = response.data.data || [];
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "Audit gagal dimuat.";
  } finally {
    loading.value = false;
  }
}

function resetAuditFilter() {
  Object.assign(auditFilter, {
    tanggal_mulai: "",
    tanggal_selesai: "",
    user: "",
    nomor_pengaduan: "",
    nomor_surat_tugas: ""
  });
  auditItems.value = [];
  resetAuditPagination();
}

function labelOption(source, option, labelKey) {
  if (!option) return "-";
  if (source === "printer") return `${option.merek || ""} ${option.model || ""}`.trim();
  if (source === "pengaduan") return `${option.nomor_pengaduan} - ${option.nama_pelapor}`;
  return option[labelKey] || option.name || option.nama || option.kode || option.id;
}

async function muatProfil() {
  try {
    const response = await api.get("/auth/saya");
    pengguna.value = response.data.data;
    statusBackend.value = "Terhubung";
    await Promise.all([muatOptions(), muatStok(true)]);
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "Sesi tidak valid.";
    hapusToken();
    await router.push({ name: "login" });
  }
}

async function keluar() {
  userMenuTerbuka.value = false;
  hapusToken();
  await router.push({ name: "login" });
}

onMounted(muatProfil);
</script>

<template>
  <main class="app-shell" :class="{ 'sidebar-open': sidebarTerbuka }">
    <button
      v-if="sidebarTerbuka"
      class="sidebar-backdrop"
      type="button"
      aria-label="Tutup menu"
      @click="sidebarTerbuka = false"
    />

    <aside class="sidebar">
      <div class="sidebar-brand">
        <img class="sidebar-logo" :src="logoMulti" alt="Multi Print" />
        <button class="sidebar-close" type="button" title="Tutup menu" @click="sidebarTerbuka = false">
          <X :size="20" />
        </button>
      </div>

      <nav class="sidebar-nav" aria-label="Menu utama">
        <section v-for="group in menu" :key="group.section" class="menu-section">
          <p>{{ group.section }}</p>
          <div class="menu-list">
            <div v-for="item in group.items" v-show="!item.adminOnly || isAdmin" :key="item.nama" class="menu-block">
              <button
                type="button"
                class="menu-item"
                :class="{ active: item.key === activeView || item.children?.some((child) => child.key === activeView), 'has-children': item.children }"
                :aria-current="item.key === activeView ? 'page' : undefined"
                :aria-expanded="item.children ? item.terbuka : undefined"
                @click="pilihMenu(item)"
              >
                <component :is="item.icon" :size="21" />
                <span>{{ item.nama }}</span>
                <ChevronDown v-if="item.children && item.terbuka" class="menu-chevron" :size="18" />
                <ChevronRight v-else-if="item.children || item.arah" class="menu-chevron" :size="18" />
              </button>

              <Transition name="submenu">
                <div v-if="item.children && item.terbuka" class="submenu-list">
                  <button
                    v-for="child in item.children"
                    :key="child.nama"
                    type="button"
                    class="submenu-item"
                    :class="{ active: child.key === activeView }"
                    @click="pilihMenu(child)"
                  >
                    <component :is="child.icon" :size="20" />
                    <span>{{ child.nama }}</span>
                  </button>
                </div>
              </Transition>
            </div>
          </div>
        </section>
      </nav>

    </aside>

    <section class="content-area">
      <header class="topbar">
        <div class="topbar-heading">
          <button class="mobile-menu-button" type="button" title="Buka menu" @click="sidebarTerbuka = true">
            <Menu :size="20" />
          </button>
          <div>
            <p class="eyebrow">{{ activeView === "dashboard" ? "Dashboard" : "Workspace" }}</p>
            <h1>{{ pageTitle }}</h1>
            <span class="page-subtitle">{{ pageSubtitle }}</span>
          </div>
        </div>

        <div class="user-menu">
          <button
            class="user-menu-trigger"
            type="button"
            :aria-expanded="userMenuTerbuka"
            aria-haspopup="menu"
            @click="userMenuTerbuka = !userMenuTerbuka"
          >
            <span class="user-avatar">{{ inisialPenggunaAktif }}</span>
            <span class="user-menu-name">{{ namaPenggunaAktif }}</span>
            <ChevronDown :size="16" />
          </button>

          <Transition name="submenu">
            <div v-if="userMenuTerbuka" class="user-dropdown" role="menu">
              <div class="user-dropdown-profile">
                <span class="user-avatar compact">{{ inisialPenggunaAktif }}</span>
                <div>
                  <strong>{{ namaPenggunaAktif }}</strong>
                  <span>{{ rolePenggunaAktif }}</span>
                </div>
              </div>
              <button class="user-dropdown-action" type="button" role="menuitem" @click="keluar">
                <LogOut :size="16" />
                <span>Logout</span>
              </button>
            </div>
          </Transition>
        </div>
      </header>

      <Transition name="toast-fade">
        <p v-if="pesanError" class="alert-error">{{ pesanError }}</p>
      </Transition>
      <Transition name="toast-fade">
        <p v-if="pesanSukses" class="alert-success">{{ pesanSukses }}</p>
      </Transition>

      <Dashboard
        v-if="activeView === 'dashboard'"
        :ringkasan-dashboard="ringkasanDashboard"
        :line-chart-data="lineChartData"
        :status-donut-data="statusDonutData"
        :surat-tugas-bar-data="suratTugasBarData"
        :stok-donut-data="stokDonutData"
        :teknisi-bar-data="teknisiBarData"
        :axis-options="axisOptions"
        :donut-options="donutOptions"
        :status-komplain="statusKomplain"
        :stok-barang="stokBarang"
      />

      <SettingsPage
        v-else-if="['rolePermission', 'slaPending'].includes(activeView)"
        :active-section="activeView"
        :pengaturan="pengaturan"
        :filtered-permission-rows="filteredPermissionRows"
        :loading="loading"
        :label-action="labelAction"
        :permission-key="permissionKey"
        :permission-module-label="permissionModuleLabel"
        :role-label="roleLabel"
        @save-sla="simpanSla"
        @load-settings="muatPengaturan"
        @save-permission="simpanPermission"
      />

      <component
        :is="currentStockComponent"
        v-else-if="activeStockView"
        v-model:stok-search="stokSearch"
        :active-stock-view="activeStockView"
        :active-stock-group="activeStockGroup"
        :filtered-stok="filteredStok"
        :paginated-stok="paginatedStok"
        :stok-pagination="stokPagination"
        :stok-total-pages="stokTotalPages"
        :pagination-mulai="paginationMulai"
        :pagination-selesai="paginationSelesai"
        @reset-stock-pagination="resetStockPagination"
        @open-stock-mutation="bukaMutasiStok"
        @previous-page="halamanSebelumnya"
        @next-page="halamanBerikutnya"
      />

      <AuditPage
        v-else-if="activeView === 'audit'"
        :audit-filter="auditFilter"
        :audit-pagination="auditPagination"
        :paginated-audit-items="paginatedAuditItems"
        :filtered-audit-items="filteredAuditItems"
        :audit-pagination-start="auditPaginationStart"
        :audit-pagination-end="auditPaginationEnd"
        :audit-total-pages="auditTotalPages"
        :audit-filter-siap="auditFilterSiap"
        :loading="loading"
        :value-of="valueOf"
        :badge-class="badgeClass"
        @reset-audit-pagination="resetAuditPagination"
        @load-audit="muatAudit"
        @reset-audit-filter="resetAuditFilter"
        @previous-page="halamanSebelumnya"
        @next-page="halamanBerikutnya"
      />

      <component
        :is="currentCrudComponent"
        v-else-if="currentConfig"
        v-model:cari="cari"
        :current-config="currentConfig"
        :can-create="canCreate"
        :paginated-items="paginatedItems"
        :filtered-items="filteredItems"
        :pagination="pagination"
        :total-pages="totalPages"
        :pagination-start="paginationStart"
        :pagination-end="paginationEnd"
        :loading="loading"
        :can-hard-delete="Boolean(currentConfig.hardDelete)"
        :can-open-item="canOpenItem"
        :can-update-item="canUpdateItem"
        :can-deactivate-item="canDeactivateItem"
        :can-resolve-complaint-item="canResolveComplaintItem"
        :can-run-surat-action="canRunSuratAction"
        :can-print-surat-item="canPrintSuratItem"
        :value-of="valueOf"
        :badge-class="badgeClass"
        :label-status="labelStatus"
        @reset-pagination="resetPagination"
        @load-page="muatHalaman"
        @open-form="bukaForm"
        @resolve-complaint="resolveKomplain"
        @action-surat="aksiSurat"
        @print-surat="cetakSuratTugas"
        @deactivate-item="mintaKonfirmasi($event, 'deactivate')"
        @hard-delete-item="mintaKonfirmasi($event, 'delete')"
        @previous-page="halamanSebelumnya"
        @next-page="halamanBerikutnya"
      />
    </section>

    <div v-if="konfirmasiHapusTerbuka" class="modal-backdrop">
      <section class="confirm-panel" role="dialog" aria-modal="true" aria-labelledby="hapus-title">
        <div class="confirm-icon">
          <Trash2 :size="22" />
        </div>
        <div class="confirm-content">
          <p class="eyebrow">{{ eyebrowKonfirmasi }}</p>
          <h2 id="hapus-title">{{ judulKonfirmasi }}</h2>
          <p>
            <strong>{{ targetHapusLabel }}</strong> {{ deskripsiKonfirmasi }}
          </p>
        </div>
        <div class="modal-actions confirm-actions">
          <button class="secondary-button" type="button" :disabled="loading" @click="batalHapus">Batal</button>
          <button class="danger-button" type="button" :disabled="loading" @click="konfirmasiHapus">
            <Trash2 :size="17" />
            <span>{{ labelTombolKonfirmasi }}</span>
          </button>
        </div>
      </section>
    </div>

    <div v-if="modalTerbuka" class="modal-backdrop">
      <section class="modal-panel">
        <div class="modal-heading">
          <div>
            <p class="eyebrow">{{ modeForm === "edit" ? "Edit Data" : "Data Baru" }}</p>
            <h2>{{ pageTitle }}</h2>
          </div>
          <button class="icon-action" type="button" title="Tutup" @click="modalTerbuka = false">
            <X :size="18" />
          </button>
        </div>

        <div v-if="formTabs.length > 1" class="form-tabs">
          <button
            v-for="tab in formTabs"
            :key="tab"
            type="button"
            :class="{ active: formTab === tab }"
            @click="formTab = tab"
          >
            {{ tab === "suratTugas" ? "Surat Tugas" : tab === "item" ? "Item" : "General" }}
          </button>
        </div>

        <form v-if="formTab === 'general'" class="data-form" @submit.prevent="simpanForm">
          <label v-for="item in currentVisibleFormFields" :key="item.name" :class="{ 'check-field': item.type === 'checkbox' }">
            <template v-if="item.type === 'checkbox'">
              <input v-model="form[item.name]" type="checkbox" />
              <span>{{ item.label }}</span>
            </template>
            <template v-else>
              <span>{{ item.label }}</span>
              <textarea v-if="item.type === 'textarea'" v-model="form[item.name]" :required="fieldWajib(item)" rows="3" />
              <select v-else-if="item.type === 'select'" v-model="form[item.name]" :required="fieldWajib(item)" @change="handleFieldChange(item.name)">
                <option value="">Pilih</option>
                <option v-for="option in item.options" :key="option" :value="option">{{ labelStatus(option) }}</option>
              </select>
              <select v-else-if="item.type === 'relation'" v-model="form[item.name]" :required="fieldWajib(item)" @change="handleFieldChange(item.name)">
                <option value="">Pilih</option>
                <option v-for="option in relationOptions(item)" :key="option.id" :value="option.id">
                  {{ labelOption(item.source, option, item.optionLabel) }}
                </option>
              </select>
              <input
                v-else
                v-model="form[item.name]"
                :type="item.type"
                :required="fieldWajib(item) && !(modeForm === 'edit' && item.name === 'password')"
                :readonly="item.readonly"
                :placeholder="item.placeholder"
              />
            </template>
          </label>

          <div class="modal-actions">
            <button class="secondary-button" type="button" @click="modalTerbuka = false">Batal</button>
            <button v-if="modeForm === 'create' ? canCreate : canUpdateItem(form)" class="primary-button" type="submit" :disabled="loading">
              <Save :size="17" />
              <span>{{ loading ? "Menyimpan..." : "Simpan" }}</span>
            </button>
          </div>
        </form>

        <section v-else-if="currentConfig.flow === 'pengaduan' && formTab === 'suratTugas'" class="tab-panel">
          <div v-if="isAdmin || roleAktif === 'kepala_teknisi'" class="tab-panel-actions">
            <button
              class="primary-button"
              type="button"
              :disabled="!form.id"
              @click="buatSuratDariKomplain"
            >
              <Plus :size="17" />
              <span>Buat Surat Tugas</span>
            </button>
          </div>
          <p v-if="!form.id" class="helper-text">Simpan komplain terlebih dahulu sebelum membuat surat tugas.</p>
          <div v-else class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID Surat Tugas</th>
                  <th>Tipe</th>
                  <th>Status</th>
                  <th>Hasil</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="surat in relatedSuratTugas" :key="surat.id">
                  <td>{{ surat.nomor_surat_tugas }}</td>
                  <td>{{ surat.jenis_pekerjaan || "-" }}</td>
                  <td><span class="status-badge" :class="badgeClass(surat.status)">{{ labelStatus(surat.status) }}</span></td>
                  <td>{{ surat.hasil || "-" }}</td>
                </tr>
                <tr v-if="!relatedSuratTugas.length">
                  <td colspan="4" class="empty-cell">Belum ada surat tugas untuk komplain ini.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-else-if="currentConfig.flow === 'suratTugas' && formTab === 'item'" class="tab-panel">
          <p v-if="!form.id" class="helper-text">Simpan surat tugas terlebih dahulu sebelum menambahkan item.</p>
          <template v-else>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Kuantitas</th>
                    <th>Serial Number</th>
                    <th>Catatan</th>
                    <th v-if="canTambahItemSurat()">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in pemakaianSuratAktif" :key="item.id">
                    <td>{{ item.master_toner?.nama_toner || item.master_printer?.model || item.master_suku_cadang?.nama_suku_cadang || item.jenis_barang }}</td>
                    <td>{{ item.jumlah_pakai }}</td>
                    <td>{{ item.serial_number || "-" }}</td>
                    <td>{{ item.keterangan || "-" }}</td>
                    <td v-if="canTambahItemSurat()">
                      <button class="icon-action danger" type="button" title="Hapus item" @click="hapusItemSurat(item)">
                        <Trash2 :size="15" />
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!pemakaianSuratAktif.length">
                    <td :colspan="canTambahItemSurat() ? 5 : 4" class="empty-cell">Belum ada item.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <form v-if="canTambahItemSurat()" class="data-form inline-form" @submit.prevent="simpanItemSurat">
              <label>
                <span>Jenis Item</span>
                <select v-model="itemForm.jenis_barang" required>
                  <option value="printer">Printer</option>
                  <option value="toner">Toner</option>
                  <option value="suku_cadang">Sparepart</option>
                </select>
              </label>
              <label>
                <span>Item</span>
                <select v-model="itemForm.item_id" required>
                  <option value="">Pilih item</option>
                  <option v-for="item in itemSuratOptions" :key="item.id" :value="item.id">
                    {{ item.nama_toner || item.model || item.nama_suku_cadang }}
                  </option>
                </select>
              </label>
              <label>
                <span>Gudang</span>
                <select v-model="itemForm.gudang_id" required>
                  <option value="">Pilih gudang</option>
                  <option v-for="gudang in options.gudang" :key="gudang.id" :value="gudang.id">{{ gudang.nama_gudang }}</option>
                </select>
              </label>
              <label>
                <span>Kuantitas</span>
                <input v-model="itemForm.jumlah_pakai" type="number" min="1" step="1" required />
              </label>
              <label>
                <span>Serial Number</span>
                <input v-model="itemForm.serial_number" type="text" />
              </label>
              <label>
                <span>Catatan</span>
                <textarea v-model="itemForm.keterangan" rows="3" />
              </label>
              <div class="modal-actions">
                <button class="primary-button" type="submit" :disabled="loading">
                  <Plus :size="17" />
                  <span>{{ loading ? "Menambah..." : "Tambah Item" }}</span>
                </button>
              </div>
            </form>
            <p v-else class="helper-text">Item hanya bisa ditambahkan oleh teknisi assigned saat status progress atau ready to print.</p>
          </template>
        </section>
      </section>
    </div>

    <div v-if="modalStokTerbuka" class="modal-backdrop">
      <section class="modal-panel">
        <div class="modal-heading">
          <div>
            <p class="eyebrow">Stock Item</p>
            <h2>Tambah Stok</h2>
          </div>
          <button class="icon-action" type="button" title="Tutup" @click="modalStokTerbuka = false">
            <X :size="18" />
          </button>
        </div>

        <form class="data-form" @submit.prevent="simpanMutasiStok">
          <label>
            <span>Jenis Mutasi</span>
            <select v-model="stockForm.jenis_mutasi" required>
              <option value="masuk">masuk</option>
              <option value="keluar">keluar</option>
              <option value="transfer">transfer</option>
              <option value="penyesuaian">penyesuaian</option>
            </select>
          </label>
          <label>
            <span>Gudang Asal</span>
            <select v-model="stockForm.gudang_asal_id">
              <option value="">Pilih</option>
              <option v-for="gudang in options.gudang" :key="gudang.id" :value="gudang.id">{{ gudang.nama_gudang }}</option>
            </select>
          </label>
          <label>
            <span>Gudang Tujuan</span>
            <select v-model="stockForm.gudang_tujuan_id">
              <option value="">Pilih</option>
              <option v-for="gudang in options.gudang" :key="gudang.id" :value="gudang.id">{{ gudang.nama_gudang }}</option>
            </select>
          </label>
          <label>
            <span>Jenis Barang</span>
            <select v-model="stockForm.jenis_barang" required>
              <option value="toner">toner</option>
              <option value="printer">printer</option>
              <option value="suku_cadang">suku_cadang</option>
            </select>
          </label>
          <label>
            <span>Barang</span>
            <select v-model="stockForm.item_id" required>
              <option value="">Pilih</option>
              <option v-for="item in stockItemOptions" :key="item.id" :value="item.id">
                {{ item.nama_toner || item.model || item.nama_suku_cadang }}
              </option>
            </select>
          </label>
          <label>
            <span>Jumlah</span>
            <input v-model="stockForm.jumlah" type="number" min="1" step="1" required />
          </label>
          <label>
            <span>Keterangan</span>
            <textarea v-model="stockForm.keterangan" rows="3" />
          </label>
          <label class="check-field">
            <input v-model="stockForm.langsung_posting" type="checkbox" />
            <span>Langsung posting</span>
          </label>

          <div class="modal-actions">
            <button class="secondary-button" type="button" @click="modalStokTerbuka = false">Batal</button>
            <button class="primary-button" type="submit" :disabled="loading">
              <Save :size="17" />
              <span>{{ loading ? "Menyimpan..." : "Simpan Mutasi" }}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  </main>
</template>
