const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const initialPassword = process.env.SEED_INITIAL_PASSWORD;
  if (!initialPassword || initialPassword.length < 12) {
    throw new Error("SEED_INITIAL_PASSWORD wajib diisi minimal 12 karakter.");
  }
  const kata_sandi_hash = await bcrypt.hash(initialPassword, 10);
  const akunRole = [
    { user_id: "admin", nama: "Admin Multiprint", email: "admin@multiprint.local", peran: "admin" },
    { user_id: "sales", nama: "Sales Multiprint", email: "sales@multiprint.local", peran: "sales" },
    { user_id: "sales-admin", nama: "Sales Admin Multiprint", email: "sales-admin@multiprint.local", peran: "sales_admin" },
    { user_id: "kepala-teknisi", nama: "Kepala Teknisi Multiprint", email: "kepala-teknisi@multiprint.local", peran: "kepala_teknisi" },
    { user_id: "teknisi", nama: "Teknisi Multiprint", email: "teknisi@multiprint.local", peran: "teknisi" },
    { user_id: "warehouse", nama: "Warehouse Multiprint", email: "warehouse@multiprint.local", peran: "warehouse" }
  ];

  await prisma.$transaction(async (tx) => {
    if (await tx.master_pengguna.count() > 0) {
      throw new Error("Seed akun hanya boleh dijalankan pada database tanpa pengguna.");
    }
    for (const akun of akunRole) {
      await tx.master_pengguna.create({
        data: {
          ...akun,
          telepon: "000",
          aktif: true,
          kata_sandi_hash
        }
      });
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
