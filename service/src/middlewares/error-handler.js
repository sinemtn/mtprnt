const { ZodError } = require("zod");
const { gagal } = require("../utils/response");

function notFound(req, res) {
  return gagal(res, "Endpoint tidak ditemukan.", 404);
}

function errorHandler(error, req, res, next) {
  if (error instanceof ZodError) {
    return gagal(res, "Validasi gagal.", 422, error.flatten());
  }

  if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
    return gagal(res, "Token tidak valid atau kedaluwarsa.", 401);
  }

  if (error.code === "P2002") {
    return gagal(res, "Data unik sudah digunakan.", 409, error.meta);
  }

  if (error.code === "P2025") {
    return gagal(res, "Data tidak ditemukan.", 404);
  }

  if (error.statusCode) {
    return gagal(res, error.message, error.statusCode);
  }

  console.error(error);
  return gagal(res, "Terjadi kesalahan pada server.", 500);
}

module.exports = { notFound, errorHandler };
