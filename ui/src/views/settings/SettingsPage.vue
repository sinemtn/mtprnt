<script setup>
defineProps({
  activeSection: { type: String, required: true },
  pengaturan: { type: Object, required: true },
  filteredPermissionRows: { type: Array, required: true },
  loading: { type: Boolean, required: true },
  labelAction: { type: Function, required: true },
  permissionKey: { type: Function, required: true },
  permissionModuleLabel: { type: Function, required: true },
  roleLabel: { type: Function, required: true }
});

defineEmits(["save-sla", "load-settings", "save-permission"]);
</script>

<template>
  <section class="settings-stack">
    <article v-if="activeSection === 'slaPending'" class="settings-card">
      <div class="section-heading">
        <div>
          <h2>SLA Pending Komplain</h2>
          <span>Komplain status New otomatis menjadi Pending setelah batas jam ini.</span>
        </div>
      </div>
      <form class="settings-form" @submit.prevent="$emit('save-sla')">
        <label>
          <span>Pending setelah</span>
          <div class="input-with-suffix">
            <input v-model.number="pengaturan.slaPendingJam" type="number" min="1" max="720" required />
            <strong>jam</strong>
          </div>
        </label>
        <button class="primary-button" type="submit" :disabled="loading">Simpan SLA</button>
      </form>
    </article>

    <article v-if="activeSection === 'rolePermission'" class="settings-card">
      <div class="section-heading">
        <div>
          <h2>Role Permission</h2>
          <span>Pilih role, lalu atur modul dan aksi yang diizinkan.</span>
        </div>
        <button class="primary-button" type="button" :disabled="loading" @click="$emit('save-permission')">
          Simpan Permission
        </button>
      </div>

      <section class="permission-toolbar">
        <label>
          <span>Pilih Role</span>
          <select v-model="pengaturan.roleDipilih" @change="$emit('load-settings')">
            <option v-for="role in pengaturan.roles" :key="role" :value="role">{{ roleLabel(role) }}</option>
          </select>
        </label>
        <label>
          <span>Filter Modul</span>
          <input v-model.trim="pengaturan.filterModul" type="search" placeholder="Semua modul" />
        </label>
        <div class="permission-summary">
          <span>Ringkasan Akses</span>
          <strong v-if="pengaturan.roleDipilih === 'admin'">Admin selalu memiliki akses penuh ke semua modul dan aksi.</strong>
          <strong v-else>{{ roleLabel(pengaturan.roleDipilih) }} memiliki {{ pengaturan.permissions.filter((item) => item.can_view).length }} modul yang bisa dilihat.</strong>
        </div>
      </section>

      <div class="table-wrap">
        <table class="permission-table">
          <thead>
            <tr>
              <th>Modul</th>
              <th v-for="action in pengaturan.actions" :key="action">{{ labelAction(action) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="permission in filteredPermissionRows" :key="permission.modul">
              <td>{{ permissionModuleLabel(permission.modul) }}</td>
              <td v-for="action in pengaturan.actions" :key="action">
                <input
                  v-model="permission[permissionKey(action)]"
                  class="permission-check"
                  type="checkbox"
                  :disabled="pengaturan.roleDipilih === 'admin'"
                />
              </td>
            </tr>
            <tr v-if="!filteredPermissionRows.length">
              <td :colspan="pengaturan.actions.length + 1" class="empty-cell">Modul tidak ditemukan.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>
