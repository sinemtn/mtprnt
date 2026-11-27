import { createRouter, createWebHistory } from "vue-router";
import { ambilToken } from "../services/api";
import LoginView from "../views/LoginView.vue";
import DashboardView from "../views/DashboardView.vue";
import { viewPaths } from "./viewPaths";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/dashboard"
    },
    {
      path: "/login",
      name: "login",
      component: LoginView
    },
    ...Object.entries(viewPaths).map(([view, path]) => ({
      path,
      name: view,
      component: DashboardView,
      meta: { wajibMasuk: true, view }
    }))
  ]
});

router.beforeEach((to) => {
  const token = ambilToken();
  if (to.meta.wajibMasuk && !token) {
    return { name: "login" };
  }

  if (to.name === "login" && token) {
    return { name: "dashboard" };
  }

  return true;
});

export default router;
