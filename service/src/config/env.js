require("dotenv").config();

const env = {
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || "multiprint-dev-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d"
};

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL wajib diisi.");
}

module.exports = env;
