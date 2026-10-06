import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }),
});

const DIR = join(process.cwd(), "import-data");
const DRY = process.argv.includes("--dry");

// --- Minimal RFC-4180-ish CSV parser (handles quotes, commas, CRLF) ---------
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* ignore */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (nonEmpty.length === 0) return [];
  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase());
  return nonEmpty.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, idx) => (o[h] = (r[idx] ?? "").trim()));
    return o;
  });
}

function readCsv(name: string): Record<string, string>[] | null {
  const path = join(DIR, name);
  if (!existsSync(path)) return null;
  return parseCsv(readFileSync(path, "utf8"));
}

function rsToPaisa(v: string): number {
  const n = Number((v || "0").replace(/,/g, ""));
  return Math.round((isNaN(n) ? 0 : n) * 100);
}
const int = (v: string, d = 0) => {
  const n = parseInt((v || "").replace(/,/g, ""), 10);
  return isNaN(n) ? d : n;
};

async function nextCode(): Promise<string> {
  const last = await prisma.product.findFirst({
    where: { code: { startsWith: "PRD-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const n = last ? parseInt(last.code.replace("PRD-", ""), 10) || 0 : 0;
  return `PRD-${String(n + 1).padStart(4, "0")}`;
}

async function importProducts() {
  const rows = readCsv("products.csv");
  if (!rows) {
    console.log("• products.csv not found — skipping (copy products.example.csv to products.csv to import).");
    return;
  }
  let created = 0, skipped = 0;
  for (const r of rows) {
    if (!r.name) continue;
    const existing = await prisma.product.findFirst({
      where: { name: r.name, size: r.size || null, variant: r.variant || null },
    });
    if (existing) { skipped++; continue; }
    if (DRY) { created++; continue; }
    const opening = int(r.opening_stock);
    const cost = rsToPaisa(r.cost_rs);
    await prisma.product.create({
      data: {
        code: await nextCode(),
        name: r.name,
        size: r.size || null,
        variant: r.variant || null,
        // Box/carton conversions were removed (client B, 2026-10-06); those CSV columns are ignored.
        minStockMilli: int(r.min_stock, 0) * 1000,
        latestCostPaisa: cost,
        movements: opening > 0
          ? { create: { type: "ADJUST", qtyMilli: opening * 1000, unitCostPaisa: cost, reason: "Opening stock (import)" } }
          : undefined,
      },
    });
    created++;
  }
  console.log(`Products: ${created} ${DRY ? "would be created" : "created"}, ${skipped} skipped (already exist).`);
}

async function importCustomers() {
  const rows = readCsv("customers.csv");
  if (!rows) {
    console.log("• customers.csv not found — skipping (copy customers.example.csv to customers.csv to import).");
    return;
  }
  let created = 0, skipped = 0;
  for (const r of rows) {
    if (!r.name) continue;
    const existing = await prisma.customer.findFirst({ where: { name: r.name, isCashCustomer: false } });
    if (existing) { skipped++; continue; }
    if (DRY) { created++; continue; }
    await prisma.customer.create({
      data: {
        name: r.name,
        phone: r.phone || null,
        openingBalancePaisa: rsToPaisa(r.opening_balance_rs),
      },
    });
    created++;
  }
  console.log(`Customers: ${created} ${DRY ? "would be created" : "created"}, ${skipped} skipped (already exist).`);
}

async function main() {
  console.log(`Import from ${DIR}${DRY ? "  [DRY RUN — no writes]" : ""}\n`);
  await importProducts();
  await importCustomers();
  console.log("\nNote: inventory opening stock is imported as a first count; historical udhaar is the customer opening balance.");
}

main().finally(() => prisma.$disconnect());
