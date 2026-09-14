const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const prisma = require("../config/prisma");
const env = require("../config/env");
const asyncHandler = require("../utils/async-handler");
const { sukses, gagal } = require("../utils/response");
const { autentikasi } = require("../middlewares/auth");
const { tampilkanRole } = require("../utils/roles");

const router = express.Router();

const loginSchema = z.object({
  username: z.string().min(1),
  kata_sandi: z.string().min(1)
});

function bersihkanPengguna(pengguna) {
  const { kata_sandi_hash, ...data } = pengguna;
  return {
    id: data.id,
    user_id: data.user_id,
    name: data.nama,
    email: data.email,
    role: tampilkanRole(data.peran),
    active: data.aktif,
    tanggal_dibuat: data.tanggal_dibuat,
    tanggal_diperbarui: data.tanggal_diperbarui
  };
}

router.post("/masuk", asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const pengguna = await prisma.master_pengguna.findUnique({
    where: { user_id: body.username }
  });

  if (!pengguna || !pengguna.kata_sandi_hash) {
    return gagal(res, "Username atau kata sandi salah.", 401);
  }

  const cocok = await bcrypt.compare(body.kata_sandi, pengguna.kata_sandi_hash);
  if (!cocok) {
    return gagal(res, "Username atau kata sandi salah.", 401);
  }

  if (!pengguna.aktif) {
    return gagal(res, "Pengguna tidak aktif.", 403);
  }

  const token = jwt.sign(
    { id: pengguna.id, peran: pengguna.peran },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

  return sukses(res, "Berhasil masuk.", {
    token,
    pengguna: bersihkanPengguna(pengguna)
  });
}));

router.get("/saya", autentikasi, asyncHandler(async (req, res) => {
  return sukses(res, "Profil berhasil diambil.", bersihkanPengguna(req.pengguna));
}));

module.exports = router;
