/**
 * Wipes ALL business data from the target database, keeping ONLY the User table
 * (login accounts and password hashes).
 *
 *   npm run db:wipe          # dry run — shows what would go, deletes nothing
 *   npm run db:wipe -- --yes # actually delete
 *
 * Always writes a full JSON backup to backups/ before deleting anything.
 * This is destructive and there is no undo beyond that backup file.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL;
const isLocal = !!url && ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname);
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  }),
});

const CONFIRMED = process.argv.includes("--yes");

// Children before parents. StockMovement references Invoice/Purchase/CreditNote,
// and Cheque is referenced by both Payment and InvoicePayment, so ordering matters.
const ORDER = [
  "auditLog",
  "stockMovement",
  "invoiceItem",
  "invoicePayment",
  "creditNoteItem",
  "creditNote",
  "invoice",
  "payment",
  "cheque",
  "customerProductPrice",
  "customer",
  "purchaseItem",
  "purchase",
  "supplierLedgerEntry",
  "supplier",
  "product",
  "moneyMovement",
  "moneyAccount",
  "expense",
] as const;

async function main() {
  const host = url ? new URL(url).hostname : "(unset)";
  console.log(`Target: ${host}\n`);

  // Snapshot everything, including User, so the backup is complete even though
  // User is never deleted.
  const backup: Record<string, unknown> = { takenAt: new Date().toISOString(), host };
  for (const model of [...ORDER, "user"]) {
    // @ts-expect-error dynamic model access
    backup[model] = await prisma[model].findMany();
  }
  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `pre-wipe-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 2));
  console.log(`Backup written: ${file}\n`);

  const before: Record<string, number> = {};
  for (const model of [...ORDER, "user"]) {
    // @ts-expect-error dynamic model access
    before[model] = await prisma[model].count();
  }

  if (!CONFIRMED) {
    console.log("DRY RUN — nothing deleted. Rows that WOULD be deleted:\n");
    console.table(
      Object.fromEntries(ORDER.map((m) => [m, before[m]]))
    );
    console.log(`\nKEPT: user = ${before.user} rows (untouched)`);
    console.log("\nRe-run with --yes to actually delete.");
    await prisma.$disconnect();
    return;
  }

  console.log("Deleting...\n");
  for (const model of ORDER) {
    // @ts-expect-error dynamic model access
    const r = await prisma[model].deleteMany();
    console.log(`  ${model.padEnd(22)} deleted ${r.count}`);
  }

  const after: Record<string, number> = {};
  for (const model of [...ORDER, "user"]) {
    // @ts-expect-error dynamic model access
    after[model] = await prisma[model].count();
  }

  const leftovers = ORDER.filter((m) => after[m] > 0);
  console.log("");
  console.table(
    Object.fromEntries([...ORDER, "user"].map((m) => [m, { before: before[m], after: after[m] }]))
  );

  if (after.user !== before.user) {
    console.error(`\n❌ USER TABLE CHANGED: ${before.user} -> ${after.user}. This should never happen.`);
    process.exitCode = 1;
  } else {
    console.log(`\n✅ user table untouched (${after.user} accounts, passwords intact)`);
  }
  if (leftovers.length) {
    console.error(`❌ rows remain in: ${leftovers.join(", ")}`);
    process.exitCode = 1;
  }
  console.log(`\nBackup: ${file}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
