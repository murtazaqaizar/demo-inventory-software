/**
 * Verification for supplier and purchase add/edit/delete.
 *
 *   npm run verify:purchases
 *
 * Exercises the REAL shipped functions from src/lib/purchasing.ts and
 * src/lib/suppliers.ts (the same ones the server actions call) against the real
 * database, inside ONE interactive transaction that is always rolled back.
 * Nothing is left behind.
 *
 * What it proves:
 *   - creating a purchase writes stock, landed cost and the supplier payable
 *   - editing reverses the old effects exactly and re-applies the new ones
 *     (no double-counted stock, no stale payable)
 *   - a product dropped from the purchase keeps its cost (nothing to fall back to)
 *   - the stock-delta map nets the right sign per product
 *   - the negative-stock guard fires when the goods have already been sold
 *   - deleting reverses everything and removes the purchase
 *   - a supplier counts as "has history" exactly when it has purchases or
 *     ledger entries — the delete-or-hide decision
 *
 * NOT covered here: the server actions' own auth checks and zod validation, and
 * the UI itself. Actions live in "use server" files a script cannot import.
 */
import "dotenv/config";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(new URL(url!).hostname);
process.env.DATABASE_URL = url;

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  }),
  log: [{ emit: "event", level: "query" }],
});

// Counting statements is how the transaction-timeout regression gets caught:
// the work per purchase must not grow with the number of lines.
let queryCount = 0;
prisma.$on("query", () => {
  queryCount++;
});

const {
  allocateLandedCost,
  applyPurchaseEffects,
  findShortProducts,
  recomputeLatestCosts,
  reversePurchaseEffects,
  stockDelta,
} = await import("../src/lib/purchasing.js");
const { supplierHasHistory, getSupplierBalance } = await import("../src/lib/suppliers.js");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  PASS  ${label} = ${a}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}\n        expected ${e}\n        got      ${a}`);
  }
}

const TAG = `verify-${Date.now()}`;
class Rollback extends Error {}

type Tx = Prisma.TransactionClient;

async function stockOf(tx: Tx, productId: string) {
  const r = await tx.stockMovement.aggregate({
    _sum: { qtyMilli: true },
    where: { productId },
  });
  return (r._sum.qtyMilli ?? 0) / 1000; // in units
}
async function payableOf(tx: Tx, supplierId: string) {
  const rows = await tx.supplierLedgerEntry.findMany({ where: { supplierId } });
  return rows.reduce((s, r) => s + (r.direction === "CHARGE" ? r.amountPaisa : -r.amountPaisa), 0);
}

try {
  await prisma.$transaction(
    async (tx) => {
      // --- fixture ---------------------------------------------------------
      const supplier = await tx.supplier.create({ data: { name: `${TAG} supplier` } });
      const a = await tx.product.create({
        data: { code: `${TAG}-A`, name: `${TAG} product A`, latestCostPaisa: 0 },
      });
      const b = await tx.product.create({
        data: { code: `${TAG}-B`, name: `${TAG} product B`, latestCostPaisa: 0 },
      });

      // --- 1. create: 100 @ Rs100 + 50 @ Rs200, Rs1000 freight, on credit ---
      console.log("\n1. Create purchase (import, on credit)");
      const p1 = allocateLandedCost(
        [
          { productId: a.id, qtyMilli: 100000, colorId: null, supplierUnitCostPaisa: 10_000 },
          { productId: b.id, qtyMilli: 50000, colorId: null, supplierUnitCostPaisa: 20_000 },
        ],
        100_000 // Rs1,000 freight
      );
      const purchase = await tx.purchase.create({
        data: { supplierId: supplier.id, isImport: true, onCredit: true, freightPaisa: 100_000 },
      });
      await applyPurchaseEffects(tx, purchase, p1.lines, p1.totalValuePaisa);
      await recomputeLatestCosts(tx, p1.lines.map((l) => l.productId));

      check("goods value (paisa)", p1.totalValuePaisa, 2_000_000);
      // Readable identity: a number of its own, and the payable it raises is
      // labelled with that number rather than a slice of the cuid.
      check("purchase got a number", Number.isInteger(purchase.number) && purchase.number > 0, true);
      check(
        "payable is labelled with the number",
        (await tx.supplierLedgerEntry.findFirstOrThrow({ where: { purchaseId: purchase.id } })).note,
        `Purchase #${purchase.number}`
      );
      check("stock A", await stockOf(tx, a.id), 100);
      check("stock B", await stockOf(tx, b.id), 50);
      check("payable (paisa)", await payableOf(tx, supplier.id), 2_000_000);
      // Freight Rs1000 split by value: Rs500 to each line → +Rs5/pc on A, +Rs20/pc on B.
      check(
        "latest cost A (landed)",
        (await tx.product.findUniqueOrThrow({ where: { id: a.id } })).latestCostPaisa,
        10_500
      );
      check(
        "latest cost B (landed)",
        (await tx.product.findUniqueOrThrow({ where: { id: b.id } })).latestCostPaisa,
        21_000
      );

      // The detail page reads one supplier's payable through getSupplierBalance;
      // it must agree with the ledger sum the suppliers list shows.
      check(
        "single-supplier balance matches the ledger",
        await getSupplierBalance(supplier.id, tx),
        await payableOf(tx, supplier.id)
      );

      // Delete-or-hide decision: this supplier now has a purchase AND a charge.
      const fresh = await tx.supplier.create({ data: { name: `${TAG} unused supplier` } });
      check("supplier with a purchase has history (→ hide)", await supplierHasHistory(tx, supplier.id), true);
      check("never-used supplier has no history (→ delete)", await supplierHasHistory(tx, fresh.id), false);

      // --- 2. edit: A down to 60 pcs, B removed, no extras, no longer credit -
      console.log("\n2. Edit purchase (A 100→60, drop B, cash instead of credit)");
      const p2 = allocateLandedCost(
        [{ productId: a.id, qtyMilli: 60000, colorId: null, supplierUnitCostPaisa: 10_000 }],
        0
      );
      await reversePurchaseEffects(tx, purchase);
      const edited = await tx.purchase.update({
        where: { id: purchase.id },
        data: { isImport: false, onCredit: false, freightPaisa: 0 },
      });
      await applyPurchaseEffects(tx, edited, p2.lines, p2.totalValuePaisa);
      await recomputeLatestCosts(tx, [a.id, b.id]);

      check("stock A after edit", await stockOf(tx, a.id), 60);
      check("stock B after edit (line removed)", await stockOf(tx, b.id), 0);
      check("payable after edit (no longer credit)", await payableOf(tx, supplier.id), 0);
      check("line items after edit", await tx.purchaseItem.count({ where: { purchaseId: purchase.id } }), 1);
      check(
        "latest cost A after edit (no extras)",
        (await tx.product.findUniqueOrThrow({ where: { id: a.id } })).latestCostPaisa,
        10_000
      );
      // B has no PURCHASE_IN left, so its cost is deliberately left as it was.
      check(
        "latest cost B unchanged (nothing to fall back to)",
        (await tx.product.findUniqueOrThrow({ where: { id: b.id } })).latestCostPaisa,
        21_000
      );

      // --- 3. stock-delta signs --------------------------------------------
      // This map is what the guard actually judges, so its signs matter more
      // than anything else here. A product on both sides must net, not stack.
      console.log("\n3. Stock-delta map");
      check(
        "delete: the whole quantity comes back out",
        [...stockDelta([{ productId: a.id, colorId: null, qtyMilli: 60000 }])],
        [[`${a.id}|`, -60_000]]
      );
      check(
        "edit: A 100→60 nets −40, dropped B nets −50",
        [...stockDelta(
          [
            { productId: a.id, colorId: null, qtyMilli: 100000 },
            { productId: b.id, colorId: null, qtyMilli: 50000 },
          ],
          [{ productId: a.id, colorId: null, qtyMilli: 60000 }]
        )],
        [
          [`${a.id}|`, -40_000],
          [`${b.id}|`, -50_000],
        ]
      );
      check(
        "edit: increasing a line nets positive (never blocks)",
        [...stockDelta([{ productId: a.id, colorId: null, qtyMilli: 60000 }], [{ productId: a.id, colorId: null, qtyMilli: 100000 }])],
        [[`${a.id}|`, 40_000]]
      );

      // --- 4. negative-stock guard -----------------------------------------
      console.log("\n4. Negative-stock guard once the goods are sold");
      const sale = await tx.stockMovement.create({
        data: { productId: a.id, type: "SALE_OUT", qtyMilli: -50_000, unitCostPaisa: 10_000 },
      });
      check("stock A after selling 50", await stockOf(tx, a.id), 10);
      const deleteDelta = stockDelta([{ productId: a.id, colorId: null, qtyMilli: 60000 }]);
      check("delete blocked, names the product", await findShortProducts(tx, deleteDelta), [
        `${TAG} product A`,
      ]);
      await tx.stockMovement.delete({ where: { id: sale.id } }); // un-sell for step 5
      check("guard allows delete once nothing is sold", await findShortProducts(tx, deleteDelta), []);

      // --- 4c. color variants ---------------------------------------------
      console.log("\n4c. Stock per color (one pipe, three colors)");
      const pipe = await tx.product.create({
        data: {
          code: `${TAG}-P`,
          name: `${TAG} pipe`,
          colors: { create: [{ colorId: "color_black" }, { colorId: "color_blue" }, { colorId: "color_white" }] },
        },
      });
      const pp = allocateLandedCost(
        [
          { productId: pipe.id, qtyMilli: 300_000, colorId: "color_black", supplierUnitCostPaisa: 5_000 },
          { productId: pipe.id, qtyMilli: 200_000, colorId: "color_white", supplierUnitCostPaisa: 5_000 },
          { productId: pipe.id, qtyMilli: 150_000, colorId: "color_blue", supplierUnitCostPaisa: 5_000 },
        ],
        0
      );
      const pipePurchase = await tx.purchase.create({ data: { supplierId: supplier.id } });
      await applyPurchaseEffects(tx, pipePurchase, pp.lines, pp.totalValuePaisa);
      const byColor = async () =>
        Object.fromEntries(
          (
            await tx.stockMovement.groupBy({ by: ["colorId"], _sum: { qtyMilli: true }, where: { productId: pipe.id } })
          )
            .map((g) => [g.colorId, (g._sum.qtyMilli ?? 0) / 1000] as const)
            .sort((x, y) => String(x[0]).localeCompare(String(y[0])))
        );
      check("each color holds its own stock", await byColor(), { color_black: 300, color_blue: 150, color_white: 200 });
      check("pipe total = 650", await stockOf(tx, pipe.id), 650);
      // Moving 50 from Black to Blue on an edit nets per color, not to zero.
      check(
        "edit Black 300→250, Blue 150→200 nets −50 / +50",
        [...stockDelta(
          [
            { productId: pipe.id, colorId: "color_black", qtyMilli: 300_000 },
            { productId: pipe.id, colorId: "color_blue", qtyMilli: 150_000 },
          ],
          [
            { productId: pipe.id, colorId: "color_black", qtyMilli: 250_000 },
            { productId: pipe.id, colorId: "color_blue", qtyMilli: 200_000 },
          ]
        )],
        [[`${pipe.id}|color_black`, -50_000], [`${pipe.id}|color_blue`, 50_000]]
      );
      // Sell 140 Blue: deleting the purchase must be blocked for Blue only (10 left < 150).
      await tx.stockMovement.create({
        data: { productId: pipe.id, colorId: "color_blue", type: "SALE_OUT", qtyMilli: -140_000 },
      });
      check(
        "guard names the short color",
        await findShortProducts(tx, stockDelta(pp.lines)),
        [`${TAG} pipe (Blue)`]
      );
      await tx.stockMovement.deleteMany({ where: { productId: pipe.id } });
      await tx.purchaseItem.deleteMany({ where: { purchaseId: pipePurchase.id } });
      await tx.purchase.delete({ where: { id: pipePurchase.id } });

      // --- 4b. decimal meters ----------------------------------------------
      console.log("\n4b. Decimal quantity in meters");
      const wire = await tx.category.create({ data: { name: `${TAG} wire`, unitId: "unit_meter" } });
      const c = await tx.product.create({
        data: { code: `${TAG}-C`, name: `${TAG} product C`, categoryId: wire.id },
      });
      // 250.5 m @ Rs12.34/m = Rs3,091.17 (250.5 × 1,234 = 309,117 paisa exactly)
      const p3 = allocateLandedCost([{ productId: c.id, qtyMilli: 250_500, colorId: null, supplierUnitCostPaisa: 1_234 }], 25_050);
      const meterPurchase = await tx.purchase.create({ data: { supplierId: supplier.id, freightPaisa: 25_050 } });
      await applyPurchaseEffects(tx, meterPurchase, p3.lines, p3.totalValuePaisa);
      await recomputeLatestCosts(tx, [c.id]);
      check("stock C = 250.5 m", await stockOf(tx, c.id), 250.5);
      check("goods value 250.5 x Rs12.34", p3.totalValuePaisa, 309_117);
      // Rs250.50 freight over 250.5 m = +Rs1.00/m
      check("landed cost per meter", (await tx.product.findUniqueOrThrow({ where: { id: c.id } })).latestCostPaisa, 1_334);
      await reversePurchaseEffects(tx, meterPurchase);
      await tx.purchase.delete({ where: { id: meterPurchase.id } });

      // --- 5. delete --------------------------------------------------------
      console.log("\n5. Delete purchase");
      await reversePurchaseEffects(tx, edited);
      await tx.purchase.delete({ where: { id: purchase.id } });
      await recomputeLatestCosts(tx, [a.id]);

      check("stock A after delete", await stockOf(tx, a.id), 0);
      check("payable after delete", await payableOf(tx, supplier.id), 0);
      check("purchase rows left", await tx.purchase.count({ where: { id: purchase.id } }), 0);
      check("line items left", await tx.purchaseItem.count({ where: { purchaseId: purchase.id } }), 0);
      check(
        "stock movements left",
        await tx.stockMovement.count({ where: { purchaseId: purchase.id } }),
        0
      );
      // With its only purchase gone the supplier is deletable outright again.
      check("supplier has no history after the purchase is deleted", await supplierHasHistory(tx, supplier.id), false);

      // --- 6. statements per purchase must not grow with line count ---------
      // The original code ran an INSERT per line plus two statements per product
      // to re-derive latest cost. On hosted Postgres that is a round-trip each,
      // and a real purchase blew Prisma's 5s interactive-transaction limit
      // (P2028). Writing a 2-line and an 8-line purchase must cost the same.
      console.log("\n6. Work per purchase is flat, not per-line");

      async function writePurchase(lineCount: number) {
        const prods = await Promise.all(
          Array.from({ length: lineCount }, (_, i) =>
            tx.product.create({
              data: { code: `${TAG}-N${lineCount}-${i}`, name: `${TAG} bulk ${lineCount}-${i}` },
            })
          )
        );
        const alloc = allocateLandedCost(
          prods.map((p) => ({ productId: p.id, qtyMilli: 10000, colorId: null, supplierUnitCostPaisa: 5_000 })),
          50_000
        );
        const pur = await tx.purchase.create({
          data: { supplierId: supplier.id, isImport: true, onCredit: true, freightPaisa: 50_000 },
        });

        const before = queryCount;
        await applyPurchaseEffects(tx, pur, alloc.lines, alloc.totalValuePaisa);
        await recomputeLatestCosts(tx, alloc.lines.map((l) => l.productId));
        return queryCount - before;
      }

      const twoLines = await writePurchase(2);
      const eightLines = await writePurchase(8);
      console.log(`        (2 lines: ${twoLines} statements · 8 lines: ${eightLines} statements)`);
      check("8-line purchase costs the same as a 2-line one", eightLines, twoLines);
      check("and that cost is a small constant", twoLines <= 5, true);

      throw new Rollback(); // never keep any of this
    },
    { maxWait: 15_000, timeout: 60_000 }
  );
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

// Prove the rollback actually happened.
const leftover = await prisma.supplier.count({ where: { name: { startsWith: "verify-" } } });
check("\nno fixture data left behind", leftover, 0);

await prisma.$disconnect();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
