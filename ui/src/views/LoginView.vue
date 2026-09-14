<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Eye, EyeOff } from "lucide-vue-next";
import logoMulti from "../assets/img/logo-multi-transparent.png";
import api, { simpanToken } from "../services/api";

const router = useRouter();
const username = ref("admin");
const kataSandi = ref("Admin123");
const tampilkanKataSandi = ref(false);
const sedangMasuk = ref(false);
const pesanError = ref("");

async function masuk() {
  pesanError.value = "";
  sedangMasuk.value = true;

  try {
    const response = await api.post("/auth/masuk", {
      username: username.value,
      kata_sandi: kataSandi.value
    });

    simpanToken(response.data.data.token);
    await router.push({ name: "dashboard" });
  } catch (error) {
    pesanError.value = error.response?.data?.pesan || "Tidak dapat masuk. Periksa username dan kata sandi.";
  } finally {
    sedangMasuk.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-panel" aria-label="Form masuk">
      <div class="panel-heading">
        <img class="login-logo" :src="logoMulti" alt="Multi Print" />
        <p>Aplikasi Manajemen Multiprint</p>
      </div>

      <form class="login-form" @submit.prevent="masuk">
        <label>
          <span>Username</span>
          <input v-model.trim="username" type="text" autocomplete="username" required autofocus />
        </label>

        <label>
          <span>Password</span>
          <div class="password-field">
            <input
              v-model="kataSandi"
              :type="tampilkanKataSandi ? 'text' : 'password'"
              autocomplete="current-password"
              required
            />
            <button
              class="icon-button"
              type="button"
              :title="tampilkanKataSandi ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'"
              @click="tampilkanKataSandi = !tampilkanKataSandi"
            >
              <EyeOff v-if="tampilkanKataSandi" :size="18" />
              <Eye v-else :size="18" />
            </button>
          </div>
        </label>

        <p v-if="pesanError" class="alert-error">{{ pesanError }}</p>

        <button class="primary-button" type="submit" :disabled="sedangMasuk">
          <span>{{ sedangMasuk ? "Memproses..." : "Login" }}</span>
        </button>
      </form>
    </section>
  </main>
</template>
