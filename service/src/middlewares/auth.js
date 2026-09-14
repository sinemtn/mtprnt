const jwt = require("jsonwebtoken");
const env = require("../config/env");
const prisma = require("../config/prisma");
const { gagal } = require("../utils/response");
const asyncHandler = require("../utils/async-handler");
const { normalisasiRole } = require("../utils/roles");

const autentikasi = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const [tipe, token] = header.split(" ");

  if (tipe !== "Bearer" || !token) {
    return gagal(res, "Token tidak ditemukan.", 401);
  }

  const payload = jwt.verify(token, env.jwtSecret);
  const pengguna = await prisma.master_pengguna.findUnique({
    where: { id: payload.id }
  });

  if (!pengguna || !pengguna.aktif) {
    return gagal(res, "Pengguna tidak aktif atau tidak ditemukan.", 401);
  }

  req.pengguna = pengguna;
  next();
});

function otorisasi(...peranDiizinkan) {
  return (req, res, next) => {
    if (!req.pengguna) {
      return gagal(res, "Autentikasi diperlukan.", 401);
    }

    const peranPengguna = normalisasiRole(req.pengguna.peran);
    const peranValid = peranDiizinkan.map(normalisasiRole);
    if (peranPengguna === "admin" || peranValid.includes(peranPengguna)) {
      return next();
    }

    return gagal(res, "Anda tidak memiliki akses untuk aksi ini.", 403);
  };
}

function izin(modul, aksi, ...fallbackPeran) {
  return asyncHandler(async (req, res, next) => {
    if (!req.pengguna) {
      return gagal(res, "Autentikasi diperlukan.", 401);
    }

    const peranPengguna = normalisasiRole(req.pengguna.peran);
    if (peranPengguna === "admin") return next();

    const permission = await prisma.role_permission.findUnique({
      where: { role_modul: { role: peranPengguna, modul } }
    });
    const key = `can_${aksi}`;

    if (permission) {
      if (permission[key]) return next();
      return gagal(res, "Anda tidak memiliki permission untuk aksi ini.", 403);
    }

    const fallback = fallbackPeran.map(normalisasiRole);
    if (fallback.includes(peranPengguna)) return next();
    return gagal(res, "Anda tidak memiliki akses untuk aksi ini.", 403);
  });
}

module.exports = { autentikasi, otorisasi, izin };
