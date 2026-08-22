import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // --- Two role-based logins (spec feature 30) ------------------------------
  const ownerPass = await bcrypt.hash("owner123", 10);
  const staffPass = await bcrypt.hash("staff123", 10);

  await prisma.user.upsert({
    where: { username: "owner" },
    update: {},
    create: { name: "Owner", username: "owner", passwordHash: ownerPass, role: "OWNER" },
  });
  await prisma.user.upsert({
    where: { username: "staff" },
    update: {},
    create: { name: "Staff", username: "staff", passwordHash: staffPass, role: "STAFF" },
  });

  // --- Singleton "Cash Sale" walk-in customer (spec feature 12) -------------
  const existingCash = await prisma.customer.findFirst({ where: { isCashCustomer: true } });
  if (!existingCash) {
    await prisma.customer.create({ data: { name: "Cash Sale", isCashCustomer: true } });
  }

  // --- Cash-in-hand vs bank accounts (spec feature 24) ----------------------
  const cash = await prisma.moneyAccount.findFirst({ where: { kind: "CASH" } });
  if (!cash) await prisma.moneyAccount.create({ data: { name: "Cash in Hand", kind: "CASH" } });
  const bank = await prisma.moneyAccount.findFirst({ where: { kind: "BANK" } });
  if (!bank) await prisma.moneyAccount.create({ data: { name: "Bank", kind: "BANK" } });

  // --- A couple of sample products to prove reads/writes (spec features 1-3) -
  await prisma.product.upsert({
    where: { code: "ABR-0001" },
    update: {},
    create: {
      code: "ABR-0001",
      name: "Cutting Disc",
      size: "4 inch",
      variant: "1.0mm - Brand A",
      piecesPerBox: 25,
      piecesPerCarton: 200,
      minStockLevel: 50,
      latestCostPaisa: 4500, // Rs 45.00 / piece
    },
  });
  await prisma.product.upsert({
    where: { code: "ABR-0002" },
    update: {},
    create: {
      code: "ABR-0002",
      name: "Grinding Disc",
      size: "4 inch",
      variant: "6.0mm - Brand B",
      piecesPerBox: 10,
      piecesPerCarton: 100,
      minStockLevel: 20,
      latestCostPaisa: 9000, // Rs 90.00 / piece
    },
  });

  const productCount = await prisma.product.count();
  const userCount = await prisma.user.count();
  console.log(`Seed complete: ${userCount} users, ${productCount} products.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
