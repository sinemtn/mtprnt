<script setup>
import StockPage from "../stock/StockPage.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <StockPage v-bind="$attrs" />
</template>
