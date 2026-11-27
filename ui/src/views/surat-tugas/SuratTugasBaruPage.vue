<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { Plus, X } from "lucide-vue-next";
import api from "../../services/api";

const props = defineProps({ role: { type: String, default: "" }, ticketPrefill: { type: Object, default: null } });
const emit = defineEmits(["print"]);
const rows = ref([]);
const tickets = ref([]);
const accounts = ref([]);
const customers = ref([]);
const contracts = ref([]);
const printers = ref([]);
const selectedPrinters = ref([]);
const printerSearch = ref("");
const printerLoading = ref(false);
const oldUnitResults = ref([]);
const selectedOldUnit = ref(null);
const oldUnitSearch = ref("");
const oldUnitLoading = ref(false);
const models = ref([]);
const gudang = ref([]);
const teknisi = ref([]);
const warehouse = ref([]);
const toner = ref([]);
const sparepart = ref([]);
const selected = ref(null);
const modal = ref(false);
const creating = ref(false);
const tab = ref("general");
const busy = ref(false);
const error = ref("");
const itemError = ref("");
const notice = ref("");
const rejectionReason = ref("");
const search = ref("");
const page = ref(1);
const limit = ref(10);
const total = ref(0);
const optionsReady = ref(false);
let listRequest = 0;
const emptyNewUnit = () => ({ mp_no: "", serial_number: "", model_id: "", sumber: "", tanggal_pembelian: "" });
const form = reactive({ tiket_id: "", jenis_tugas: "", mode: "", account_id: "", customer_id: "", kontrak_id: "", unit_asal_id: "", gudang_id: "", pic_teknisi_id: "", pic_warehouse_id: "", lokasi_internal: "", sumber: "", printer_ids: [], new_units: [emptyNewUnit()], hasil: "" });
const itemForm = reactive({ jenis_barang: "toner", item_id: "", gudang_id: "", jumlah_pakai: 1, keterangan: "" });
const results = reactive({});
const selectedLineId = ref("");
const stResult = reactive({ choice: "", hasil: "", alasan: "" });
const activeLine = computed(() => selected.value?.surat_tugas_printer?.find((line) => line.id === selectedLineId.value) || null);
const activeResult = computed(() => activeLine.value ? results[activeLine.value.id] : stResult);
const ticketNumber = (st) => st?.tiket?.nomor_tiket || st?.tiket?.id || st?.tiket_id || "Mandiri";
const requiresWarehouse = (st) => !!st?.pemakaian_barang_surat_tugas?.length;
const isInbound = (st) => st?.jenis_tugas?.startsWith("terima_");
function resultChoices(jenis) {
  if (jenis?.startsWith("terima_")) return ["Diterima", "Tertunda"];
  if (jenis === "qc") return ["Lulus QC", "Lulus bersyarat", "Perlu repair", "Tidak layak", "Kanibal", "Tertunda"];
  if (jenis === "repair") return ["Selesai diperbaiki", "Perlu perbaikan lanjutan", "Tidak dapat diperbaiki", "Tertunda"];
  if (jenis === "on_site_service" || jenis === "maintenance") return ["Selesai", "Perlu tindak lanjut", "Tertunda"];
  if (jenis?.startsWith("kirim_") || jenis === "internal_use") return ["Diserahkan", "Tertunda"];
  return ["Selesai", "Tertunda"];
}
const conditionByResult = {
  "Lulus QC": "ready", "Lulus bersyarat": "ready_with_condition", "Perlu repair": "need_repair",
  "Tidak layak": "unready", Kanibal: "kanibal", "Selesai diperbaiki": null,
  "Perlu perbaikan lanjutan": "need_repair", "Tidak dapat diperbaiki": "unready"
};
function resultChanged() {
  const result = activeResult.value;
  result.hasil = result.choice === "Lainnya" ? "" : result.choice;
}
const canEditItems = computed(() => selected.value && ["admin", "teknisi"].includes(role.value)
  && (selected.value.alur_st_baru ? selected.value.status === "progress" : ["progress", "ready_to_print"].includes(selected.value.status)));
const canEditResults = computed(() => selected.value && selected.value.mulai_kunjungan
  && (isInbound(selected.value) ? ["admin", "warehouse"].includes(role.value) && ["progress", "warehouse_validated"].includes(selected.value.status)
    : ["admin", "teknisi"].includes(role.value) && ["progress", "ready_to_print"].includes(selected.value.status)));
const timeline = computed(() => {
  const st = selected.value;
  if (!st?.jenis_tugas) return [];
  if (st.alur_st_baru) {
    const inbound = isInbound(st);
    const finished = ["technician_completed", "warehouse_validated", "solved"].includes(st.status);
    const warehouseDone = Boolean(st.validasi_warehouse_pada) || st.status === "solved";
    const stages = inbound
      ? [
          { label: "Mulai Surat Tugas", done: st.status !== "pending" },
          { label: "Mulai Pekerjaan", done: Boolean(st.mulai_kunjungan) },
          { label: "Penerimaan Gudang", done: warehouseDone },
          { label: "Selesaikan Pekerjaan", done: ["technician_completed", "solved"].includes(st.status) },
          { label: "Tutup Surat Tugas", done: st.status === "solved" }
        ]
      : [
          { label: "Mulai Surat Tugas", done: st.status !== "pending" },
          { label: "Mulai Pekerjaan", done: Boolean(st.mulai_kunjungan) },
          { label: "Selesaikan Pekerjaan", done: finished },
          ...(requiresWarehouse(st) ? [{ label: "Validasi Gudang", done: warehouseDone, rejected: Boolean(st.alasan_penolakan_warehouse && !st.validasi_warehouse_pada) }] : []),
          { label: "Tutup Surat Tugas", done: st.status === "solved" }
        ];
    const firstUpcoming = stages.findIndex((step) => !step.done);
    return stages.map((step, index) => ({ ...step, state: st.status === "cancelled" ? index === 0 ? "complete" : "cancelled"
      : step.rejected ? "rejected" : step.done ? "complete" : index === firstUpcoming ? "active" : "upcoming" }));
  }
  const inbound = st.jenis_tugas.startsWith("terima_");
  const stages = inbound
    ? [{ label: "Dibuat", status: "pending" }, { label: "Dibuka", status: "progress" }, { label: "Unit diterima", status: "warehouse_validated" }, { label: "Selesai", status: "solved" }]
    : [{ label: "Dibuat", status: "pending" }, { label: "Dibuka", status: "progress" }, { label: "Siap Cetak", status: "ready_to_print" }, { label: "Pekerjaan Selesai", status: "technician_completed" }, ...(requiresWarehouse(st) ? [{ label: "Validasi Gudang", status: "warehouse_validated" }] : []), { label: "Disetujui", status: "solved" }];
  if (st.status === "cancelled") {
    const last = stages.findIndex((step) => step.status === "solved");
    stages.splice(last, 1, { label: "Dibatalkan", status: "cancelled" });
  }
  const current = Math.max(0, stages.findIndex((step) => step.status === st.status));
  const received = inbound && st.surat_tugas_printer?.length && st.surat_tugas_printer.every((line) => line.konfirmasi_terima_pada || line.pengecualian_disetujui_pada);
  return stages.map((step, index) => ({ ...step, state: st.status === "cancelled" && step.status === "cancelled" ? "cancelled"
    : st.status === "cancelled" ? index === 0 ? "complete" : "upcoming"
    : st.alasan_penolakan_warehouse && step.status === "warehouse_validated" && !st.validasi_warehouse_pada ? "rejected"
      : received && step.status === "warehouse_validated" ? "complete"
      : index < current || st.status === "solved" ? "complete" : index === current ? "active" : "upcoming" }));
});
const role = computed(() => String(props.role).replace(/-/g, "_"));
const canCreate = computed(() => ["admin", "kepala_teknisi", "warehouse"].includes(role.value));
const kinds = {
  kirim_kontrak: "Pengiriman Kontrak", terima_tukar: "Penerimaan Tukar", kirim_trial: "Pengiriman Trial", kirim_stand_by: "Pengiriman Stand-by", kirim_event: "Pengiriman Event", kirim_sell: "Penjualan", kirim_toner: "Pengiriman Toner", on_site_service: "On-site Service", kirim_back_up: "Pengiriman Back-up", terima_unit_rusak: "Terima Unit Rusak", repair: "Repair", qc: "QC", internal_use: "Internal Use", terima_return: "Return", terima_printer_baru: "Penerimaan Printer", maintenance: "Maintenance"
};
const allowedKinds = computed(() => {
  const ticket = tickets.value.find((item) => item.id === form.tiket_id);
  if (ticket) {
    const map = { kontrak: form.mode === "tukar" ? ["kirim_kontrak", "terima_tukar"] : ["kirim_kontrak"], trial: ["kirim_trial"], stand_by: ["kirim_stand_by"], event: ["kirim_event"], sell: ["kirim_sell"], toner_purchase: ["kirim_toner"], on_site_service: ["on_site_service", "terima_return"], back_up: ["kirim_back_up", "terima_unit_rusak", "terima_return"], repair: ["repair"], qc: ["qc"], internal_use: ["internal_use"], return: ["terima_return"], penerimaan_printer: ["terima_printer_baru"], maintenance: ["maintenance"] };
    const choices = map[ticket.jenis] || [];
    return role.value === "warehouse" ? choices.filter((key) => key.startsWith("terima_")) : choices;
  }
  return Object.keys(kinds).filter((key) => role.value !== "warehouse" || key.startsWith("terima_"));
});
const chosenTicket = computed(() => tickets.value.find((item) => item.id === form.tiket_id));
const selectedCustomers = computed(() => customers.value.filter((item) => item.account_id === form.account_id && item.aktif));
const needsOldUnitPicker = computed(() => !chosenTicket.value && (form.jenis_tugas === "kirim_kontrak" && form.mode === "tukar" || form.jenis_tugas === "kirim_back_up"));
const needsPrinterPicker = computed(() => !!form.jenis_tugas && !["kirim_toner", "terima_printer_baru"].includes(form.jenis_tugas));
const canSearchPrinter = computed(() => customerUnitSearch.value ? !!form.customer_id : ["qc", "repair"].includes(form.jenis_tugas) || !!form.gudang_id);
const customerUnitSearch = computed(() => ["terima_return", "terima_tukar", "terima_unit_rusak", "on_site_service"].includes(form.jenis_tugas)
  || form.jenis_tugas === "maintenance" && !!chosenTicket.value
  || form.jenis_tugas === "kirim_kontrak" && !!chosenTicket.value?.tiket_asal_id);
const oldUnitOptions = computed(() => oldUnitResults.value.filter((item) => item.lokasi_jenis === "customer" && item.customer_id === form.customer_id && (form.jenis_tugas !== "kirim_kontrak" || !form.kontrak_id || item.kontrak_id === form.kontrak_id)));
const assetsForSt = computed(() => {
  return printers.value.filter((p) => customerUnitSearch.value
    ? p.lokasi_jenis === "customer" && p.customer_id === form.customer_id && (form.jenis_tugas !== "kirim_kontrak" || p.penempatan === "trial" && p.mp_no === chosenTicket.value?.mp_no)
    : ["qc", "repair"].includes(form.jenis_tugas)
      ? p.lokasi_jenis === "gudang"
      : p.lokasi_jenis === "gudang" && p.kondisi === "ready" && p.status === "available" && !p.surat_tugas_aktif_id && p.gudang_id === form.gudang_id);
});
const itemChoices = computed(() => itemForm.jenis_barang === "toner" ? toner.value : sparepart.value);
const errorText = (err) => {
  const response = err.response?.data;
  const field = Object.entries(response?.detail?.fieldErrors || {}).find(([, messages]) => messages?.length);
  if (field) return `${response.pesan || "Validasi gagal."} ${field[0]}: ${field[1][0]}`;
  return response?.pesan || response?.message || err.message || "Permintaan gagal.";
};
let printerRequest = 0;
let printerSearchTimer;
let oldUnitRequest = 0;
let oldUnitSearchTimer;

async function searchPrinters() {
  const requestId = ++printerRequest;
  const term = printerSearch.value.trim();
  printers.value = [];
  printerLoading.value = false;
  if (!term || ["kirim_toner", "terima_printer_baru"].includes(form.jenis_tugas)
    || customerUnitSearch.value && !form.customer_id
    || !customerUnitSearch.value && !["qc", "repair"].includes(form.jenis_tugas) && !form.gudang_id) return;
  printerLoading.value = true;
  try {
    const params = { batas: 30, cari: term, lokasi: customerUnitSearch.value ? "customer" : "gudang" };
    if (customerUnitSearch.value) params.customer_id = form.customer_id;
    else if (form.gudang_id) params.gudang_id = form.gudang_id;
    if (!customerUnitSearch.value && !["qc", "repair"].includes(form.jenis_tugas)) Object.assign(params, { status: "available", kondisi: "ready", tanpa_reservasi: true });
    const response = await api.get("/printer", { params });
    if (requestId !== printerRequest) return;
    printers.value = (response.data.data.items || []).filter((item) => [item.mp_no, item.serial_number].some((value) => value?.toLowerCase().includes(term.toLowerCase())));
  } catch (err) { if (requestId === printerRequest) error.value = errorText(err); }
  finally { if (requestId === printerRequest) printerLoading.value = false; }
}

watch(printerSearch, () => {
  printerRequest += 1;
  printers.value = [];
  clearTimeout(printerSearchTimer);
  printerSearchTimer = setTimeout(searchPrinters, 250);
});
async function searchOldUnits() {
  const requestId = ++oldUnitRequest;
  oldUnitResults.value = [];
  oldUnitLoading.value = false;
  const term = oldUnitSearch.value.trim();
  if (!needsOldUnitPicker.value || !form.customer_id || !term) return;
  oldUnitLoading.value = true;
  try {
    const response = await api.get("/printer", { params: { batas: 30, cari: term, lokasi: "customer", customer_id: form.customer_id } });
    if (requestId === oldUnitRequest) oldUnitResults.value = (response.data.data.items || []).filter((item) => [item.mp_no, item.serial_number].some((value) => value?.toLowerCase().includes(term.toLowerCase())));
  } catch (err) { if (requestId === oldUnitRequest) error.value = errorText(err); }
  finally { if (requestId === oldUnitRequest) oldUnitLoading.value = false; }
}
watch(oldUnitSearch, () => {
  oldUnitRequest += 1;
  oldUnitResults.value = [];
  clearTimeout(oldUnitSearchTimer);
  oldUnitSearchTimer = setTimeout(searchOldUnits, 250);
});
function choosePrinter(unit) {
  if (selectedPrinters.value.some((item) => item.id === unit.id)) return;
  selectedPrinters.value = ["on_site_service", "repair"].includes(form.jenis_tugas) ? [unit] : [...selectedPrinters.value, unit];
  form.printer_ids = selectedPrinters.value.map((item) => item.id);
}
function removePrinter(id) {
  selectedPrinters.value = selectedPrinters.value.filter((item) => item.id !== id);
  form.printer_ids = selectedPrinters.value.map((item) => item.id);
}
function chooseOldUnit(unit) {
  selectedOldUnit.value = unit;
  form.unit_asal_id = unit.id;
}
function removeOldUnit() {
  selectedOldUnit.value = null;
  form.unit_asal_id = "";
}
watch(() => [form.jenis_tugas, form.mode, form.customer_id, form.gudang_id, form.kontrak_id, form.tiket_id], () => {
  form.printer_ids = [];
  form.unit_asal_id = "";
  selectedPrinters.value = [];
  selectedOldUnit.value = null;
  printerSearch.value = "";
  oldUnitSearch.value = "";
  printers.value = [];
  oldUnitResults.value = [];
  printerRequest += 1;
  oldUnitRequest += 1;
  printerLoading.value = false;
  oldUnitLoading.value = false;
  clearTimeout(printerSearchTimer);
  clearTimeout(oldUnitSearchTimer);
});

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
    const [a, c, m, g, u, t, s, tk, k] = await Promise.all([all("/account"), all("/account/lokasi-customer"), all("/printer-model"), all("/gudang"), all("/pengguna"), all("/toner"), all("/suku-cadang"), all("/tiket"), canCreate.value ? all("/kontrak") : Promise.resolve([])]);
    accounts.value = a.filter((item) => item.aktif); customers.value = c; models.value = m; gudang.value = g.filter((item) => item.aktif); toner.value = t; sparepart.value = s; tickets.value = tk.filter((item) => !["solved", "cancelled"].includes(item.status)); contracts.value = k.filter((item) => item.status === "aktif");
    teknisi.value = u.filter((item) => (item.role || item.peran) === "teknisi" && (item.active ?? item.aktif));
    warehouse.value = u.filter((item) => (item.role || item.peran) === "warehouse" && (item.active ?? item.aktif));
    optionsReady.value = true;
  } catch (err) { error.value = errorText(err); }
}
async function load() {
  const requestId = ++listRequest;
  try {
    const response = await api.get("/surat-tugas", { params: { halaman: page.value, batas: limit.value, ...(search.value.trim() ? { cari: search.value.trim() } : {}) } });
    if (requestId !== listRequest) return;
    rows.value = response.data.data.items;
    total.value = response.data.data.meta.total;
    error.value = "";
  } catch (err) { if (requestId === listRequest) error.value = errorText(err); }
}
function onSearchInput() {
  if (!search.value.trim()) { page.value = 1; load(); }
}
async function openDetail(item) {
  try {
    const response = await api.get(`/surat-tugas/${item.id}`);
    selected.value = response.data.data;
    creating.value = false; tab.value = "general"; modal.value = true; error.value = ""; itemError.value = "";
    rejectionReason.value = "";
    stResult.hasil = selected.value.hasil || "";
    stResult.choice = resultChoices(selected.value.jenis_tugas).includes(stResult.hasil) ? stResult.hasil : stResult.hasil ? "Lainnya" : "";
    stResult.alasan = selected.value.tindakan || "";
    itemForm.gudang_id = selected.value.gudang_id || "";
    Object.keys(results).forEach((key) => delete results[key]);
    selected.value.surat_tugas_printer?.forEach((line) => { results[line.id] = {
      hasil: line.hasil || "", choice: resultChoices(selected.value.jenis_tugas).includes(line.hasil) ? line.hasil : line.hasil ? "Lainnya" : "",
      alasan: line.alasan || ""
    }; });
    if (!selected.value.surat_tugas_printer?.some((line) => line.id === selectedLineId.value)) {
      selectedLineId.value = selected.value.surat_tugas_printer?.[0]?.id || "";
    }
  } catch (err) { error.value = errorText(err); }
}
function useTicket() {
  const ticket = chosenTicket.value;
  if (!ticket) {
    Object.assign(form, { jenis_tugas: "", mode: "", account_id: "", customer_id: "", kontrak_id: "", unit_asal_id: "", printer_ids: [] });
    return;
  }
  Object.assign(form, { account_id: ticket.account_id || "", customer_id: ticket.customer_id || "", mode: ticket.mode || "", kontrak_id: ticket.kontrak_id || "", lokasi_internal: ticket.lokasi_internal || "", jenis_tugas: ({ kontrak: "kirim_kontrak", trial: "kirim_trial", stand_by: "kirim_stand_by", event: "kirim_event", sell: "kirim_sell", toner_purchase: "kirim_toner", on_site_service: "on_site_service", back_up: "kirim_back_up", repair: "repair", qc: "qc", internal_use: "internal_use", return: "terima_return", penerimaan_printer: "terima_printer_baru", maintenance: "maintenance" })[ticket.jenis] || "" });
  if (role.value === "warehouse") form.jenis_tugas = allowedKinds.value[0] || "";
  form.printer_ids = [];
}
function changeKind() {
  form.printer_ids = [];
  if (!chosenTicket.value) {
    form.mode = "";
    form.kontrak_id = "";
    form.unit_asal_id = "";
  }
}
function openNew(ticket = null) {
  if (!optionsReady.value) return;
  selected.value = null; creating.value = true; modal.value = true; tab.value = "general";
  error.value = ""; itemError.value = "";
  printerSearch.value = "";
  Object.assign(form, { tiket_id: ticket?.id || "", jenis_tugas: "", mode: "", account_id: "", customer_id: "", kontrak_id: "", unit_asal_id: "", gudang_id: "", pic_teknisi_id: "", pic_warehouse_id: "", lokasi_internal: "", sumber: "", printer_ids: [], new_units: [emptyNewUnit()], hasil: "" });
  if (ticket) { if (!tickets.value.some((row) => row.id === ticket.id)) tickets.value.unshift(ticket); useTicket(); }
}
function buildPayload() {
  const ticket = chosenTicket.value;
  const newPrinter = form.jenis_tugas === "terima_printer_baru";
  const source = newPrinter ? form.new_units : selectedPrinters.value;
  return {
    tiket_id: form.tiket_id || null, jenis_tugas: form.jenis_tugas, mode: form.mode || null,
    account_id: form.account_id || null, customer_id: form.customer_id || null, kontrak_id: form.kontrak_id || null, unit_asal_id: form.unit_asal_id || null,
    gudang_id: form.gudang_id || null, pic_teknisi_id: form.pic_teknisi_id || null, pic_warehouse_id: form.pic_warehouse_id || null,
    lokasi_internal: form.lokasi_internal || null, sumber: form.sumber || ticket?.alasan || null,
    printer: source.map((line) => newPrinter
      ? { mp_no: line.mp_no.trim(), model_id: line.model_id, serial_number: line.serial_number.trim() || null, tanggal_pembelian: line.tanggal_pembelian || null, sumber: line.sumber.trim(), peran: "utama" }
      : { printer_id: line.id, mp_no: line.mp_no, model_id: line.model_id || null, serial_number: line.serial_number || null, peran: { kirim_back_up: "pengganti", terima_tukar: "unit_lama" }[form.jenis_tugas] || "utama" })
  };
}
async function create() {
  error.value = "";
  if (needsPrinterPicker.value && !selectedPrinters.value.length) { error.value = "Pilih minimal satu unit printer dari hasil pencarian."; return; }
  if (needsOldUnitPicker.value && !form.unit_asal_id) { error.value = "Pilih unit lama dari hasil pencarian."; return; }
  busy.value = true;
  try {
    const response = await api.post("/surat-tugas", buildPayload());
    notice.value = "Surat tugas dimulai."; await load(); await loadOptions();
    await openDetail(response.data.data);
  } catch (err) { error.value = errorText(err); }
  finally { busy.value = false; }
}
async function action(name) {
  if (!selected.value) return;
  if (name === "cancel" && !window.confirm("Batalkan surat tugas ini?")) return;
  if (name === "tolak-warehouse" && rejectionReason.value.trim().length < 3) { error.value = "Isi alasan penolakan minimal 3 karakter."; return; }
  busy.value = true;
  try {
    await api.post(`/surat-tugas/${selected.value.id}/${name}`, name === "selesai" && !selected.value.surat_tugas_printer?.length
      ? { hasil: stResult.hasil || null, keterangan: stResult.alasan || null }
      : name === "tolak-warehouse" ? { alasan: rejectionReason.value.trim() } : {});
    notice.value = "Status surat tugas diperbarui.";
    await load(); await openDetail(selected.value);
  } catch (err) { error.value = errorText(err); }
  finally { busy.value = false; }
}
async function assign() {
  if (!form.pic_teknisi_id) { error.value = "Pilih teknisi terlebih dahulu."; return; }
  try {
    await api.post(`/surat-tugas/${selected.value.id}/assign`, { pic_teknisi_id: form.pic_teknisi_id });
    notice.value = "PIC teknisi ditugaskan."; await load(); await openDetail(selected.value);
  } catch (err) { error.value = errorText(err); }
}
async function saveResult() {
  busy.value = true;
  try {
    const line = activeLine.value;
    const result = activeResult.value;
    result.hasil = result.choice === "Lainnya" ? result.hasil.trim() : result.choice;
    if (!result.hasil) { error.value = "Pilih atau isi hasil pekerjaan."; return; }
    if (result.hasil.toLowerCase() === "tertunda" && result.alasan.trim().length < 3) { error.value = "Isi keterangan tertunda minimal 3 karakter."; return; }
    if (line) {
      const kondisi = Object.hasOwn(conditionByResult, result.choice) ? conditionByResult[result.choice]
        : selected.value.jenis_tugas === "qc" && result.choice === "Lainnya" ? "unready"
          : selected.value.jenis_tugas === "repair" ? null : undefined;
      if (kondisi && kondisi !== "ready" && !result.alasan.trim()) { error.value = "Isi keterangan untuk hasil ini."; return; }
      await api.put(`/surat-tugas/${selected.value.id}/printer/${line.id}/hasil`, {
        hasil: result.hasil, kondisi_hasil: kondisi, alasan: result.alasan.trim() || null
      });
    } else {
      await api.put(`/surat-tugas/${selected.value.id}`, { hasil: result.hasil, keterangan: result.alasan.trim() || null });
    }
    await openDetail(selected.value); notice.value = line ? `Hasil ${line.mp_no} tersimpan.` : "Hasil pekerjaan tersimpan.";
  } catch (err) { error.value = errorText(err); }
  finally { busy.value = false; }
}
async function approveException(line) {
  busy.value = true;
  try {
    await api.post(`/surat-tugas/${selected.value.id}/printer/${line.id}/pengecualian/setujui`);
    await openDetail(selected.value); notice.value = `Pengecualian ${line.mp_no} disetujui.`;
  } catch (err) { error.value = errorText(err); }
  finally { busy.value = false; }
}
async function addItem() {
  itemError.value = "";
  try {
    const body = { gudang_id: itemForm.gudang_id, jenis_barang: itemForm.jenis_barang, jumlah_pakai: Number(itemForm.jumlah_pakai), keterangan: itemForm.keterangan || null, ...(itemForm.jenis_barang === "toner" ? { toner_id: itemForm.item_id } : { suku_cadang_id: itemForm.item_id }) };
    await api.post(`/surat-tugas/${selected.value.id}/pemakaian`, body);
    await openDetail(selected.value); tab.value = "item"; notice.value = "Item ditambahkan.";
  } catch (err) { itemError.value = errorText(err); }
}
async function deleteItem(line) {
  if (!window.confirm("Hapus item ini dari surat tugas?")) return;
  try { await api.delete(`/surat-tugas/${selected.value.id}/pemakaian/${line.id}`); await openDetail(selected.value); tab.value = "item"; }
  catch (err) { itemError.value = errorText(err); }
}
function changeTab(next) { tab.value = next; error.value = ""; itemError.value = ""; }
function closeModal() { modal.value = false; error.value = ""; itemError.value = ""; }
function canAct(name) {
  const st = selected.value; if (!st?.jenis_tugas) return false;
  const leader = ["admin", "kepala_teknisi"].includes(role.value);
  const worker = ["admin", "teknisi"].includes(role.value);
  const store = ["admin", "warehouse"].includes(role.value);
  if (name === "start") return (leader || store && st.jenis_tugas.startsWith("terima_")) && st.status === "pending";
  if (name === "mulai-kerja") return (isInbound(st) ? store : worker) && ["progress", "ready_to_print"].includes(st.status) && !st.mulai_kunjungan;
  if (name === "ready-to-print") return !st.alur_st_baru && worker && st.status === "progress" && !isInbound(st);
  const goods = requiresWarehouse(st);
  if (name === "keluar" || name === "tolak-warehouse") return store && st.status === "technician_completed" && goods && !st.konfirmasi_keluar_pada;
  if (name === "selesai") return isInbound(st) ? store && ["progress", "warehouse_validated"].includes(st.status) && (!st.alur_st_baru || st.mulai_kunjungan) && st.surat_tugas_printer?.every((line) => line.konfirmasi_terima_pada || line.pengecualian_disetujui_pada) : worker && (st.alur_st_baru ? st.status === "progress" : st.status === "ready_to_print") && !!st.mulai_kunjungan;
  if (name === "resolve") return isInbound(st) ? store && st.alur_st_baru && st.status === "technician_completed" : leader && (st.status === (goods ? "warehouse_validated" : "technician_completed") || !goods && st.status === "warehouse_validated" && !!st.validasi_warehouse_pada);
  if (name === "cancel") return (leader || store && st.jenis_tugas.startsWith("terima_")) && !["solved", "cancelled"].includes(st.status) && !st.konfirmasi_keluar_pada && !st.konfirmasi_serah_pada && !st.konfirmasi_terima_pada;
  return false;
}
watch(() => props.ticketPrefill, (ticket) => { if (ticket) openNew(ticket); }, { immediate: true });
watch(() => form.account_id, () => { if (!chosenTicket.value) form.customer_id = ""; });
onMounted(async () => { await Promise.all([load(), ...(["sales", "sales_admin"].includes(role.value) ? [] : [loadOptions()])]); if (props.ticketPrefill) openNew(props.ticketPrefill); });
defineExpose({ openNew });
</script>

<template>
  <div class="st-page"><div class="st-toolbar"><label><input v-model="search" placeholder="Cari No ST, jenis, atau MP No" @keyup.enter="page = 1; load()" @input="onSearchInput" /></label><button v-if="canCreate" class="primary-button" type="button" :disabled="!optionsReady" @click="openNew()"><Plus :size="16" /> Surat Tugas</button></div>
    <p v-if="error && !modal" class="st-error">{{ error }}</p><p v-else-if="notice && !modal" class="st-notice">{{ notice }}</p>
    <div class="st-table table-wrap"><table><thead><tr><th>Nomor ST</th><th>Jenis</th><th>Tiket</th><th>Customer</th><th>PIC</th><th>Status</th></tr></thead><tbody><tr v-for="st in rows" :key="st.id" @click="openDetail(st)"><td>{{ st.nomor_surat_tugas }}</td><td>{{ kinds[st.jenis_tugas] || `${st.jenis_pekerjaan} (arsip)` }}</td><td>{{ ticketNumber(st) }}</td><td>{{ st.master_customer?.nama_customer || '—' }}</td><td>{{ st.teknisi_surat_tugas?.[0]?.master_pengguna?.nama_lengkap || st.teknisi_surat_tugas?.[0]?.master_pengguna?.nama || '—' }}</td><td>{{ st.status }}</td></tr><tr v-if="!rows.length"><td colspan="6">Belum ada Surat Tugas.</td></tr></tbody></table></div>
    <div class="st-pagination"><span>{{ total }} surat tugas</span><label>Baris<select v-model.number="limit" @change="page = 1; load()"><option :value="10">10</option><option :value="25">25</option><option :value="50">50</option></select></label><button type="button" :disabled="page <= 1" @click="page--; load()">Sebelumnya</button><span>{{ page }} / {{ Math.max(1, Math.ceil(total / limit)) }}</span><button type="button" :disabled="page >= Math.ceil(total / limit)" @click="page++; load()">Berikutnya</button></div>
    <div v-if="modal" class="modal-backdrop"><section class="st-modal" :class="{ 'st-legacy': !creating && !selected?.jenis_tugas }" role="dialog" aria-modal="true"><header><div><small>{{ creating ? 'DATA BARU' : selected?.nomor_surat_tugas }}</small><h2>{{ creating ? 'Buat Surat Tugas' : kinds[selected?.jenis_tugas] || 'Surat Tugas Arsip' }}</h2></div><button type="button" aria-label="Tutup" @click="closeModal"><X :size="18" /></button></header>
      <nav v-if="!creating && selected?.jenis_tugas"><button type="button" :class="{ active: tab === 'general' }" @click="changeTab('general')">General</button><button type="button" :class="{ active: tab === 'item' }" @click="changeTab('item')">Item</button></nav>
      <p v-if="!creating && !selected?.jenis_tugas" class="st-legacy-note">Data dari alur Komplain lama tetap tersimpan. Surat Tugas ini hanya ditampilkan sebagai arsip di alur baru.</p>
      <p v-if="error" class="st-error st-modal-error" role="alert">{{ error }}</p>
      <p v-if="tab === 'item' && itemError" class="st-error st-modal-error" role="alert">{{ itemError }}</p>
      <div class="st-modal-body"><form v-if="creating" id="st-create" class="st-form" @submit.prevent="create"><label>Tiket (opsional)<select v-model="form.tiket_id" @change="useTicket"><option value="">Surat Tugas mandiri</option><option v-for="t in tickets" :key="t.id" :value="t.id">{{ t.nomor_tiket }} · {{ t.jenis }}</option></select></label><label>Jenis ST<select v-model="form.jenis_tugas" required @change="changeKind"><option value="">Pilih jenis</option><option v-for="key in allowedKinds" :key="key" :value="key">{{ kinds[key] }}</option></select></label>
        <label v-if="!chosenTicket">Account<select v-model="form.account_id"><option value="">Tidak berlaku</option><option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.nama_account }}</option></select></label><label v-if="!chosenTicket">Customer / Site<select v-model="form.customer_id"><option value="">Tidak berlaku</option><option v-for="c in selectedCustomers" :key="c.id" :value="c.id">{{ c.nama_customer }}</option></select></label>
        <label v-if="['kirim_kontrak','kirim_back_up'].includes(form.jenis_tugas) && !chosenTicket">Mode<select v-model="form.mode" required><option value="">Pilih mode</option><option v-if="form.jenis_tugas === 'kirim_kontrak'" value="baru">Baru</option><option v-if="form.jenis_tugas === 'kirim_kontrak'" value="tukar">Tukar</option><option v-if="form.jenis_tugas === 'kirim_back_up'" value="sementara">Sementara</option><option v-if="form.jenis_tugas === 'kirim_back_up'" value="permanen">Permanen</option></select></label>
        <label v-if="!chosenTicket && (form.jenis_tugas === 'kirim_kontrak' && form.mode === 'tukar' || form.jenis_tugas === 'terima_tukar')">Kontrak Aktif<select v-model="form.kontrak_id" required><option value="">Pilih kontrak</option><option v-for="k in contracts.filter(x => x.customer_id === form.customer_id)" :key="k.id" :value="k.id">{{ k.nomor_kontrak }}</option></select></label>
        <div v-if="needsOldUnitPicker" class="st-wide st-picker"><label>Cari Unit Lama (MP No / serial)<input v-model="oldUnitSearch" :disabled="!form.customer_id" :placeholder="form.customer_id ? 'Ketik MP No atau serial' : 'Pilih Customer lebih dulu'" /></label><div v-if="oldUnitSearch.trim()" class="st-picker-results"><p v-if="oldUnitLoading" class="st-picker-empty">Mencari unit...</p><template v-else><div v-for="unit in oldUnitOptions" :key="unit.id" class="st-picker-row"><div class="st-picker-info"><strong>{{ unit.mp_no }}</strong><span>Serial: {{ unit.serial_number || '-' }} · {{ unit.master_printer_model?.nama_model || '-' }}</span></div><button type="button" class="secondary-button" :disabled="form.unit_asal_id === unit.id" @click="chooseOldUnit(unit)">{{ form.unit_asal_id === unit.id ? 'Dipilih' : 'Pilih' }}</button></div><p v-if="!oldUnitOptions.length" class="st-picker-empty">Unit lama tidak ditemukan.</p></template></div><div v-if="selectedOldUnit" class="st-picker-selected"><strong>Unit lama terpilih</strong><div class="st-picker-row"><div class="st-picker-info"><strong>{{ selectedOldUnit.mp_no }}</strong><span>Serial: {{ selectedOldUnit.serial_number || '-' }} · {{ selectedOldUnit.master_printer_model?.nama_model || '-' }}</span></div><button type="button" class="st-remove" :aria-label="`Hapus ${selectedOldUnit.mp_no}`" @click="removeOldUnit"><X :size="16" /></button></div></div></div>
        <label v-if="['kirim_kontrak','kirim_trial','kirim_stand_by','kirim_event','kirim_sell','kirim_back_up','internal_use','kirim_toner','terima_tukar','terima_unit_rusak','terima_return','terima_printer_baru'].includes(form.jenis_tugas) || form.jenis_tugas === 'maintenance' && !chosenTicket">Gudang<select v-model="form.gudang_id" required><option value="">Pilih Gudang</option><option v-for="g in gudang" :key="g.id" :value="g.id">{{ g.nama_gudang }}</option></select></label>
        <label v-if="!form.jenis_tugas.startsWith('terima_')">PIC Teknisi<select v-model="form.pic_teknisi_id" required><option value="">Pilih Teknisi</option><option v-for="u in teknisi" :key="u.id" :value="u.id">{{ u.name || u.user_id }}</option></select></label><label v-else>PIC Warehouse<select v-model="form.pic_warehouse_id" required><option value="">Pilih Warehouse</option><option v-for="u in warehouse" :key="u.id" :value="u.id">{{ u.name || u.user_id }}</option></select></label>
        <label v-if="form.jenis_tugas === 'internal_use'">Divisi / Lokasi Internal<input v-model="form.lokasi_internal" required /></label>
        <div v-if="form.jenis_tugas === 'terima_printer_baru'" class="st-wide st-new-units"><div v-for="(unit, index) in form.new_units" :key="index" class="st-new-unit"><label>MP No<input v-model="unit.mp_no" required /></label><label>Serial Number<input v-model="unit.serial_number" /></label><label>Model<select v-model="unit.model_id" required><option value="">Pilih Model</option><option v-for="m in models" :key="m.id" :value="m.id">{{ m.nama_model }}</option></select></label><label>Sumber / Pemasok<input v-model="unit.sumber" required /></label><label>Tanggal Pembelian<input v-model="unit.tanggal_pembelian" type="date" /></label><button v-if="form.new_units.length > 1" class="secondary-button" type="button" @click="form.new_units.splice(index, 1)">Hapus</button></div><button class="secondary-button" type="button" @click="form.new_units.push(emptyNewUnit())">Tambah Unit</button></div>
        <div v-if="needsPrinterPicker" class="st-wide st-picker"><label>Cari MP No / serial<input v-model="printerSearch" :disabled="!canSearchPrinter" :placeholder="canSearchPrinter ? 'Ketik MP No atau serial' : customerUnitSearch ? 'Pilih Customer lebih dulu' : 'Pilih Gudang lebih dulu'" /></label><div v-if="printerSearch.trim()" class="st-picker-results"><p v-if="printerLoading" class="st-picker-empty">Mencari unit...</p><template v-else><div v-for="unit in assetsForSt" :key="unit.id" class="st-picker-row"><div class="st-picker-info"><strong>{{ unit.mp_no }}</strong><span>Serial: {{ unit.serial_number || '-' }} · {{ unit.master_printer_model?.nama_model || '-' }}</span></div><button type="button" class="secondary-button" :disabled="form.printer_ids.includes(unit.id)" @click="choosePrinter(unit)">{{ form.printer_ids.includes(unit.id) ? 'Dipilih' : 'Pilih' }}</button></div><p v-if="!assetsForSt.length" class="st-picker-empty">Unit tidak ditemukan di lokasi ini.</p></template></div><div v-if="selectedPrinters.length" class="st-picker-selected"><strong>Unit terpilih ({{ selectedPrinters.length }})</strong><div v-for="unit in selectedPrinters" :key="unit.id" class="st-picker-row"><div class="st-picker-info"><strong>{{ unit.mp_no }}</strong><span>Serial: {{ unit.serial_number || '-' }} · {{ unit.master_printer_model?.nama_model || '-' }}</span></div><button type="button" class="st-remove" :aria-label="`Hapus ${unit.mp_no}`" @click="removePrinter(unit.id)"><X :size="16" /></button></div></div></div>
      </form>
      <template v-else-if="tab === 'general'">
        <div class="st-timeline-scroll" role="group" aria-label="Progres surat tugas"><ol class="st-timeline"><li v-for="step in timeline" :key="step.label" :class="`st-step-${step.state}`" :aria-current="step.state === 'active' ? 'step' : undefined"><span class="st-step-marker" aria-hidden="true"></span><span class="st-step-label">{{ step.label }}</span></li></ol></div>
        <div class="st-facts"><span>Tiket: {{ ticketNumber(selected) }}</span><span>Customer: {{ selected.master_customer?.nama_customer || '-' }}</span><span v-if="selected.mulai_kunjungan">Mulai kerja: {{ new Date(selected.mulai_kunjungan).toLocaleString('id-ID') }}</span><span v-if="selected.konfirmasi_serah_pada">Serah: {{ new Date(selected.konfirmasi_serah_pada).toLocaleString('id-ID') }}</span><span v-if="selected.konfirmasi_terima_pada">Terima: {{ new Date(selected.konfirmasi_terima_pada).toLocaleString('id-ID') }}</span></div>
        <p v-if="selected.alasan_penolakan_warehouse" class="st-error">Ditolak Warehouse: {{ selected.alasan_penolakan_warehouse }}</p>
        <div v-if="!selected.teknisi_surat_tugas?.length && selected.status === 'pending' && ['admin','kepala_teknisi'].includes(role)" class="st-assign"><select v-model="form.pic_teknisi_id"><option value="">Pilih Teknisi</option><option v-for="u in teknisi" :key="u.id" :value="u.id">{{ u.name || u.user_id }}</option></select><button class="secondary-button" type="button" @click="assign">Assign PIC</button></div>
        <div v-if="selected.surat_tugas_printer?.length" class="st-result-unit"><label v-if="selected.surat_tugas_printer.length > 1">MP No<select v-model="selectedLineId"><option v-for="line in selected.surat_tugas_printer" :key="line.id" :value="line.id">{{ line.mp_no }} · {{ line.pengecualian_disetujui_pada ? 'Dikecualikan' : line.pengecualian_diminta_pada ? 'Menunggu persetujuan' : line.konfirmasi_terima_pada ? 'Diterima' : line.konfirmasi_serah_pada ? 'Diserahkan' : line.hasil || 'Belum ada hasil' }}</option></select></label><strong v-else>{{ activeLine?.mp_no }}</strong><span v-if="activeLine?.konfirmasi_serah_pada">Diserahkan {{ new Date(activeLine.konfirmasi_serah_pada).toLocaleString('id-ID') }}</span><span v-if="activeLine?.konfirmasi_terima_pada">Diterima {{ new Date(activeLine.konfirmasi_terima_pada).toLocaleString('id-ID') }}</span><span v-if="activeLine?.pengecualian_disetujui_pada">Dikecualikan</span><span v-else-if="activeLine?.pengecualian_diminta_pada">Menunggu persetujuan</span></div>
        <div v-if="activeResult" class="st-result-form">
          <label>Hasil<select v-model="activeResult.choice" :disabled="!canEditResults || !!activeLine?.pengecualian_disetujui_pada" @change="resultChanged"><option value="">Pilih hasil</option><option v-for="value in resultChoices(selected.jenis_tugas)" :key="value" :value="value">{{ value }}</option><option value="Lainnya">Lainnya</option></select></label>
          <label v-if="activeResult.choice === 'Lainnya'">Hasil lainnya<input v-model="activeResult.hasil" maxlength="50" :disabled="!canEditResults || !!activeLine?.pengecualian_disetujui_pada" /></label>
          <label class="st-result-note">Keterangan<textarea v-model="activeResult.alasan" rows="3" :disabled="!canEditResults || !!activeLine?.pengecualian_disetujui_pada" placeholder="Catatan hasil pekerjaan" /></label>
          <div class="st-result-actions"><button v-if="canEditResults && !activeLine?.pengecualian_disetujui_pada" class="secondary-button" type="button" :disabled="busy" @click="saveResult">{{ activeResult.choice === 'Tertunda' ? 'Ajukan Pengecualian' : 'Simpan Hasil' }}</button><button v-if="activeLine?.pengecualian_diminta_pada && !activeLine?.pengecualian_disetujui_pada && ['admin','kepala_teknisi'].includes(role)" class="secondary-button" type="button" :disabled="busy" @click="approveException(activeLine)">Setujui Pengecualian</button></div>
        </div>
        <label v-if="canAct('tolak-warehouse')" class="st-result">Alasan penolakan<textarea v-model="rejectionReason" rows="2" placeholder="Jelaskan selisih barang" /></label>
        <div class="st-actions"><button v-for="name in ['start','mulai-kerja','ready-to-print','selesai','keluar','tolak-warehouse','resolve','cancel']" v-show="canAct(name) && (name !== 'start' || selected.teknisi_surat_tugas?.length || selected.jenis_tugas.startsWith('terima_'))" :key="name" class="secondary-button" type="button" :disabled="busy" @click="action(name)">{{ { start:'Mulai Surat Tugas', 'mulai-kerja':'Mulai Pekerjaan', 'ready-to-print':'Siap Cetak', keluar:'Validasi Gudang', 'tolak-warehouse':'Tolak & Revisi', selesai:'Selesaikan Pekerjaan', resolve:'Tutup Surat Tugas', cancel:'Batalkan' }[name] }}</button><button v-if="(selected.alur_st_baru && selected.status !== 'pending' || !selected.alur_st_baru && ['ready_to_print','technician_completed','warehouse_validated','solved'].includes(selected.status)) && selected.status !== 'cancelled'" class="secondary-button" type="button" @click="emit('print', selected)">PDF</button></div>
      </template>
      <template v-else><div class="table-wrap"><table><thead><tr><th>Item</th><th>Jumlah</th><th>Gudang</th><th></th></tr></thead><tbody><tr v-for="line in selected.pemakaian_barang_surat_tugas" :key="line.id"><td>{{ line.master_toner?.nama_toner || line.master_suku_cadang?.nama_suku_cadang }}</td><td>{{ line.jumlah_pakai }}</td><td>{{ line.master_gudang?.nama_gudang }}</td><td><button v-if="canEditItems" type="button" @click="deleteItem(line)">Hapus</button></td></tr><tr v-if="!selected.pemakaian_barang_surat_tugas?.length"><td colspan="4">Belum ada item.</td></tr></tbody></table></div><form v-if="canEditItems" class="st-form st-item-form" @submit.prevent="addItem"><label>Jenis<select v-model="itemForm.jenis_barang" @change="itemForm.item_id = ''"><option value="toner">Toner</option><option value="suku_cadang">Sparepart</option></select></label><label>Item<select v-model="itemForm.item_id" required><option value="">Pilih item</option><option v-for="i in itemChoices" :key="i.id" :value="i.id">{{ i.nama_toner || i.nama_suku_cadang }}</option></select></label><label>Gudang<select v-model="itemForm.gudang_id" required><option value="">Pilih Gudang</option><option v-for="g in gudang" :key="g.id" :value="g.id">{{ g.nama_gudang }}</option></select></label><label>Jumlah<input v-model.number="itemForm.jumlah_pakai" type="number" min="1" required /></label><label>Catatan<input v-model="itemForm.keterangan" /></label><button class="primary-button" type="submit">Tambah Item</button></form></template>
      </div><footer v-if="creating"><button class="secondary-button" type="button" @click="closeModal">Batal</button><button class="primary-button" type="submit" form="st-create" :disabled="busy">Simpan</button></footer>
    </section></div>
  </div>
</template>

<style scoped>
.st-page { padding: 24px 28px; }.st-toolbar { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 16px; }.st-toolbar input,.st-form input,.st-form select,.st-result textarea,.st-result select { background: #0c1628; color: #eaf2fb; border: 1px solid #29364b; border-radius: 6px; padding: 7px 10px; min-height: 38px; font: inherit; }.st-toolbar input { width: 260px; }.st-table { border: 1px solid #263247; border-radius: 7px; }.st-table tbody tr { cursor: pointer; }.st-table tbody tr:hover { background: #112139; }.st-error,.st-notice { padding: 9px 12px; border-radius: 4px; }.st-error { background: #40202b; color: #ffadbd; }.st-notice { background: #143c36; color: #9ce8c4; }.st-modal-error { margin: 12px 20px 0; flex: none; }
.st-modal { width: min(840px, calc(100vw - 28px)); max-height: min(800px, calc(100vh - 40px)); display: flex; flex-direction: column; border: 1px solid #2c3a4e; border-radius: 8px; background: #091525; color: #eef5ff; }.st-modal header { padding: 18px 20px; display: flex; justify-content: space-between; border-bottom: 1px solid #253246; }.st-modal header small { color: #91a9c2; font-size: 11px; }.st-modal h2 { margin: 3px 0 0; font-size: 21px; }.st-modal header button { color: #b8cadc; background: none; border: 1px solid #2d3b50; border-radius: 5px; width: 32px; height: 32px; }.st-modal nav { display: flex; gap: 4px; border-bottom: 1px solid #253246; padding: 8px 20px 0; }.st-modal nav button { padding: 9px 14px; color: #a9bdd1; border: 0; background: none; }.st-modal nav button.active { color: white; background: #2c3d54; border-radius: 5px 5px 0 0; }.st-modal-body { padding: 18px 20px; overflow: auto; min-height: 0; flex: 1; }.st-form { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }.st-form label,.st-result { display: flex; flex-direction: column; gap: 6px; color: #b6c5d5; font-size: 12px; }.st-wide { grid-column: 1 / -1; padding: 10px 0; border-top: 1px solid #263247; }.st-wide strong { display: block; margin-bottom: 8px; }.st-wide p { margin: 4px 0; }.st-check { display: inline-flex !important; flex-direction: row !important; align-items: center; margin: 4px 14px 4px 0; }.st-check input { min-height: auto; }.st-facts { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }.st-facts span { padding: 7px 9px; border-bottom: 1px solid #294056; font-size: 12px; }.st-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }.st-unit { border-bottom: 1px solid #263247; padding: 12px 0; }.st-unit > span { color: #9eb0c8; margin-left: 12px; }.st-unit .st-form { margin-top: 12px; }.st-item-form { margin-top: 20px; }.st-modal footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid #253246; }
.st-assign { display: flex; gap: 8px; margin: 12px 0; }.st-assign select { min-height: 38px; background: #0c1628; color: #eaf2fb; border: 1px solid #29364b; border-radius: 6px; }
.st-unit-list { margin-top: 22px; border-top: 1px solid #263247; }
.st-unit-list h3 { font-size: 14px; margin: 16px 0 2px; }
.st-new-unit { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-items: end; margin-bottom: 10px; padding-bottom: 12px; border-bottom: 1px solid #263247; }
.st-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 12px; color: #a9bdd1; font-size: 12px; }
.st-pagination > span:first-child { margin-right: auto; }
.st-pagination label { display: flex; align-items: center; gap: 6px; }
.st-pagination select,.st-pagination button { min-height: 32px; padding: 5px 8px; color: #eaf2fb; background: #0c1628; border: 1px solid #29364b; border-radius: 5px; }
.st-pagination button:disabled { opacity: .4; }
.st-legacy-note { margin: 16px 20px 0; color: #aac0d6; font-size: 13px; }.st-legacy .st-assign,.st-legacy .st-result,.st-legacy .st-actions { display: none; }
.st-picker { min-width: 0; }
.st-picker > label { max-width: 100%; }
.st-picker-results { margin-top: 10px; max-height: 190px; overflow-y: auto; border-block: 1px solid #263247; }
.st-picker-selected { margin-top: 16px; }
.st-picker-selected > strong { margin-bottom: 4px; }
.st-picker-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; padding: 8px 2px; border-bottom: 1px solid #263247; }
.st-picker-row:last-child { border-bottom: 0; }
.st-picker-info { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.st-picker-info strong { margin: 0; overflow-wrap: anywhere; }
.st-picker-info span,.st-picker-empty { color: #9eb0c8; font-size: 12px; overflow-wrap: anywhere; }
.st-picker-row button { flex: none; min-height: 32px; }
.st-remove { display: inline-grid; place-items: center; width: 32px; min-width: 32px; padding: 0; color: #c8d8e9; background: transparent; border: 1px solid #34455c; border-radius: 5px; cursor: pointer; }
.st-remove:hover { color: #fff; border-color: #8fa7be; }
.st-picker-empty { padding: 8px 2px; }
.st-exception-status { color: #f4c66f !important; }
.st-timeline-scroll { overflow-x: auto; padding: 4px 0 14px; margin-bottom: 8px; scrollbar-width: thin; }
.st-timeline { display: flex; min-width: max-content; list-style: none; margin: 0; padding: 0; }
.st-timeline li { position: relative; width: 130px; flex: none; color: #7890a9; font-size: 12px; text-align: center; }
.st-timeline li::before { content: ""; position: absolute; top: 9px; left: 50%; width: 100%; height: 2px; background: #34455c; }
.st-timeline li:last-child::before { display: none; }
.st-step-marker { display: block; position: relative; z-index: 1; width: 20px; height: 20px; margin: 0 auto 9px; border: 2px solid #52657b; border-radius: 50%; background: #091525; }
.st-step-label { display: block; max-width: 122px; margin: auto; line-height: 1.3; }
.st-step-complete { color: #b9ead8 !important; }
.st-step-complete .st-step-marker { border-color: #25c995; background: #25c995; }
.st-step-complete::before { background: #25c995 !important; }
.st-step-active { color: #eaf2fb !important; font-weight: 600; }
.st-step-active .st-step-marker { border-color: #38bdf8; box-shadow: 0 0 0 4px #123a53; }
.st-step-rejected { color: #ffb7c2 !important; }
.st-step-rejected .st-step-marker { border-color: #fb7185; background: #703046; }
.st-step-cancelled { color: #ffb7c2 !important; }
.st-step-cancelled .st-step-marker { border-color: #fb7185; background: #fb7185; }
.st-result-unit { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.st-result-unit label,.st-result-form label { display: flex; flex-direction: column; gap: 6px; color: #b6c5d5; font-size: 12px; }
.st-result-unit label { width: min(370px, 100%); }
.st-result-unit strong { font-size: 13px; padding-bottom: 10px; }
.st-result-unit span { color: #9eb0c8; font-size: 12px; padding-bottom: 10px; }
.st-result-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); align-items: start; gap: 10px 14px; }
.st-result-form input,.st-result-form select,.st-result-form textarea,.st-result-unit select { width: 100%; min-height: 38px; padding: 8px 10px; background: #0c1628; color: #eaf2fb; border: 1px solid #29364b; border-radius: 6px; font: inherit; }
.st-result-note { grid-column: 2; grid-row: 1 / span 2; }
.st-result-note textarea { min-height: 78px; resize: vertical; }
.st-result-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; }
@media(max-width:650px) {
  .st-page { padding: 14px; }
  .st-form { grid-template-columns: 1fr; }
  .st-result-form { grid-template-columns: 1fr; }
  .st-result-note { grid-column: 1; grid-row: auto; }
  .st-new-unit { grid-template-columns: 1fr; padding-bottom: 10px; border-bottom: 1px solid #263247; }
  .st-pagination { flex-wrap: wrap; }
  .st-toolbar { align-items: center; }
  .st-toolbar label { flex: 1; min-width: 0; }
  .st-toolbar input { width: 100%; }
  .st-toolbar .primary-button { flex: none; white-space: nowrap; margin-top: 0; }
  .st-table th,.st-table td { padding: 12px 9px; }
  .st-table th:nth-child(3),.st-table td:nth-child(3),
  .st-table th:nth-child(4),.st-table td:nth-child(4),
  .st-table th:nth-child(5),.st-table td:nth-child(5) { display: none; }
  .st-table td:nth-child(1) { font-size: 11px; }
  .st-table td:nth-child(2) { white-space: normal; overflow-wrap: anywhere; }
  .st-modal { max-height: calc(100vh - 16px); }
}
</style>
