<script setup>
import DashboardPage from "./DashboardPage.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <DashboardPage v-bind="$attrs" />
</template>
