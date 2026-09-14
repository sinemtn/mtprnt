const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const kata_sandi_hash = await bcrypt.hash("Admin123", 10);
  const akunRole = [
    { user_id: "admin", nama: "Admin Multiprint", email: "admin@multiprint.local", peran: "admin" },
    { user_id: "sales", nama: "Sales Multiprint", email: "sales@multiprint.local", peran: "sales" },
    { user_id: "sales-admin", nama: "Sales Admin Multiprint", email: "sales-admin@multiprint.local", peran: "sales_admin" },
    { user_id: "kepala-teknisi", nama: "Kepala Teknisi Multiprint", email: "kepala-teknisi@multiprint.local", peran: "kepala_teknisi" },
    { user_id: "teknisi", nama: "Teknisi Multiprint", email: "teknisi@multiprint.local", peran: "teknisi" },
    { user_id: "warehouse", nama: "Warehouse Multiprint", email: "warehouse@multiprint.local", peran: "warehouse" }
  ];

  for (const akun of akunRole) {
    const existing = await prisma.master_pengguna.findFirst({
      where: { user_id: akun.user_id }
    });

    if (existing) {
      await prisma.master_pengguna.update({
        where: { id: existing.id },
        data: {
          nama: akun.nama,
          email: akun.email,
          peran: akun.peran,
          aktif: true,
          kata_sandi_hash
        }
      });
      continue;
    }

    await prisma.master_pengguna.create({
      data: {
        ...akun,
        telepon: "000",
        aktif: true,
        kata_sandi_hash
      }
    });
  }
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
