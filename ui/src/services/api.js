import axios from "axios";

export const TOKEN_KEY = "token_multiprint";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  timeout: 10000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
    }
    return Promise.reject(error);
  }
);

export function simpanToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function hapusToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function ambilToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export default api;
