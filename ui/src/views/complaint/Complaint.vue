<script setup>
import CrudPage from "../crud/CrudPage.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <CrudPage v-bind="$attrs" />
</template>
