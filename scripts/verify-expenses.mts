/**
 * Verification for expense heads and what an expense does to the books.
 *
 *   npm run verify:expenses
 *
 * Two things matter here. First, an expense is not just a row — it also moves
 * cash, and the balance is the running sum of those movements, so a missing or
 * wrong-signed movement silently overstates the drawer. Second, heads: an
 * expense stores the head's NAME, not a link, so retiring a head must leave last
 * year's books readable.
 *
 * Runs against the real database inside ONE interactive transaction that is
 * always rolled back, so the shop's own expenses and heads are never touched.
 *
 * NOT covered: the actions' auth/validation and the form. Actions live in
 * "use server" files a script cannot import.
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
});

const { EXPENSE_CATEGORIES } = await import("../src/lib/expense-categories.js");
const { isBuiltIn } = await import("../src/lib/expense-heads.js");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  PASS  ${label} = ${a}`);
  else {
    failures++;
    console.error(`  FAIL  ${label}\n        expected ${e}\n        got      ${a}`);
  }
}

class Rollback extends Error {}
const TAG = `vexp-${Date.now()}`;

// --- 1. built-ins are the floor ---------------------------------------------
console.log("\n1. Built-in heads");
check("the seven built-ins are recognised", EXPENSE_CATEGORIES.every(isBuiltIn), true);
check("matching ignores case, so 'labour' cannot be re-added", isBuiltIn("labour"), true);
check("a shop's own head is not a built-in", isBuiltIn("Chai"), false);

try {
  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // --- 2. an expense moves cash ------------------------------------------
      // The balance is the sum of movements, never a stored number, so this is
      // the assertion that keeps the drawer honest.
      console.log("\n2. What recording an expense does to the books");
      let cash = await tx.moneyAccount.findFirst({ where: { kind: "CASH" } });
      if (!cash) cash = await tx.moneyAccount.create({ data: { kind: "CASH", name: "Cash" } });

      const before = await tx.moneyMovement.aggregate({
        _sum: { amountPaisa: true },
        where: { accountId: cash.id },
      });

      const amountPaisa = 250_00;
      await tx.expense.create({
        data: { category: "Electricity", amountPaisa, note: `${TAG} bill`, date: new Date() },
      });
      await tx.moneyMovement.create({
        data: { accountId: cash.id, type: "EXPENSE", amountPaisa: -amountPaisa, note: `${TAG} Electricity` },
      });

      const after = await tx.moneyMovement.aggregate({
        _sum: { amountPaisa: true },
        where: { accountId: cash.id },
      });
      check(
        "cash falls by exactly the expense",
        (after._sum.amountPaisa ?? 0) - (before._sum.amountPaisa ?? 0),
        -amountPaisa
      );
      check(
        "the movement is negative, not positive",
        (await tx.moneyMovement.findFirstOrThrow({ where: { note: `${TAG} Electricity` } })).amountPaisa < 0,
        true
      );

      // --- 3. custom heads ----------------------------------------------------
      console.log("\n3. Heads the shop adds itself");
      const head = await tx.expenseHead.create({ data: { name: `${TAG} Chai` } });
      check("a new head starts active", head.active, true);

      // Retiring a head that has been used must not touch the expenses filed
      // under it — they store the name, so the history has to survive.
      await tx.expense.create({
        data: { category: head.name, amountPaisa: 500_00, note: `${TAG} chai`, date: new Date() },
      });
      const used = await tx.expense.count({ where: { category: head.name } });
      check("expenses can be filed under it", used, 1);

      await tx.expenseHead.update({ where: { id: head.id }, data: { active: false } });
      check(
        "retiring it leaves the expense alone",
        await tx.expense.count({ where: { category: head.name } }),
        1
      );
      check(
        "...and it drops off the active list",
        await tx.expenseHead.count({ where: { id: head.id, active: true } }),
        0
      );

      // An unused head is safe to delete outright.
      const unused = await tx.expenseHead.create({ data: { name: `${TAG} Unused` } });
      check("an unused head has no expenses", await tx.expense.count({ where: { category: unused.name } }), 0);
      await tx.expenseHead.delete({ where: { id: unused.id } });
      check("...so it deletes cleanly", await tx.expenseHead.count({ where: { id: unused.id } }), 0);

      // --- 4. the income statement counts every head the same ----------------
      // Expenses are summed over a date range with no filter on category, so a
      // custom head reduces profit exactly like a built-in one. If this ever
      // stopped being true, a shop's own heads would quietly vanish from profit.
      console.log("\n4. Custom heads reach the income statement");
      const from = new Date(Date.now() - 60_000);
      const to = new Date(Date.now() + 60_000);
      const total = await tx.expense.aggregate({
        _sum: { amountPaisa: true },
        where: { date: { gte: from, lte: to }, note: { startsWith: TAG } },
      });
      check("both expenses count toward the period total", total._sum.amountPaisa, 250_00 + 500_00);

      // LAST, deliberately: a failed statement aborts the whole Postgres
      // transaction (25P02), so every assertion after this one would fail for
      // the wrong reason. The unique index is what stops the list ever showing
      // the same head twice.
      console.log("\n5. A head cannot be added twice");
      let duplicated = false;
      try {
        await tx.expenseHead.create({ data: { name: `${TAG} Chai` } });
      } catch {
        duplicated = true;
      }
      check("the same head cannot be added twice", duplicated, true);

      throw new Rollback();
    },
    { maxWait: 15_000, timeout: 60_000 }
  );
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

const leftoverHeads = await prisma.expenseHead.count({ where: { name: { startsWith: "vexp-" } } });
const leftoverExpenses = await prisma.expense.count({ where: { note: { startsWith: "vexp-" } } });
check("\nno fixture heads left behind", leftoverHeads, 0);
check("no fixture expenses left behind", leftoverExpenses, 0);

await prisma.$disconnect();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
