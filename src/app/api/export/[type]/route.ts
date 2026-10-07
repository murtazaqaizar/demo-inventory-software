import { prisma } from "@/lib/prisma";
import { fromMilli, lineAmount, unitOf, unitShort } from "@/lib/qty";
import { requireOwnerApi, ForbiddenError } from "@/lib/guards";
import { getAging, sumLines, getCustomerLedgers } from "@/lib/receivables";
import { getColorStockMap, getStockMap } from "@/lib/stock";
import { COLOR_FIELDS } from "@/lib/products";
import { colorsOf, stockKey } from "@/lib/variants";
import { getIncomeStatement, resolvePeriod } from "@/lib/reports";

const rs = (paisa: number) => (paisa / 100).toFixed(2);

function csv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\r\n");
}

// Owner-only CSV exports (improvement 9) — for the accountant, tax time, or a
// human-readable backup. Amounts are exported in RUPEES.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ type: string }> }
) {
  try {
    await requireOwnerApi();
  } catch (e) {
    if (e instanceof ForbiddenError) return Response.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const { type } = await ctx.params;
  const url = new URL(req.url);
  let rows: (string | number)[][] = [];
  let name = type;

  switch (type) {
    case "stock-valuation": {
      const products = await prisma.product.findMany({
        where: { active: true },
        include: { category: { select: { name: true, unit: true } }, colors: { select: { color: { select: COLOR_FIELDS } } } },
        orderBy: { code: "asc" },
      });
      const ids = products.map((p) => p.id);
      const [stock, colorStock] = await Promise.all([getStockMap(ids), getColorStockMap(ids)]);
      rows = [["Code", "Product", "Category", "Color", "Size", "Variant", "In stock", "Unit", "Cost/unit (Rs)", "Stock value (Rs)"]];
      let totalValue = 0;
      for (const p of products) {
        // A product with color variants gets one row per color (client B: "how much
        // pipe do I have in each color"); the rest get a single row.
        const colors = colorsOf(p);
        const parts = colors.length
          ? colors.map((c) => ({ color: c.name, qty: colorStock.get(stockKey(p.id, c.id)) ?? 0 }))
          : [{ color: "", qty: stock.get(p.id) ?? 0 }];
        for (const part of parts) {
          const value = lineAmount(part.qty, p.latestCostPaisa);
          totalValue += value;
          rows.push([
            p.code,
            p.name,
            p.category?.name ?? "",
            part.color,
            p.size ?? "",
            p.variant ?? "",
            fromMilli(part.qty),
            unitShort(unitOf(p)),
            rs(p.latestCostPaisa),
            rs(value),
          ]);
        }
      }
      rows.push([]);
      rows.push(["", "", "", "", "", "", "", "", "TOTAL STOCK VALUE", rs(totalValue)]);
      break;
    }

    case "aging": {
      const aging = await getAging();
      rows = [["Customer", "Phone", "0-30 (Rs)", "31-60 (Rs)", "61-90 (Rs)", "90+ (Rs)", "Total (Rs)", "Oldest (days)", "Credit limit (Rs)", "Over limit"]];
      for (const a of aging) {
        rows.push([
          a.name, a.phone ?? "", rs(a.current), rs(a.d30), rs(a.d60), rs(a.d90), rs(a.total),
          a.oldestDays === null ? "" : a.oldestDays >= 999 ? "opening" : a.oldestDays,
          a.creditLimitPaisa ? rs(a.creditLimitPaisa) : "", a.overLimit ? "YES" : "",
        ]);
      }
      break;
    }

    case "customers": {
      const customers = await prisma.customer.findMany({ where: { isCashCustomer: false }, orderBy: { name: "asc" } });
      const ledgers = await getCustomerLedgers();
      rows = [["Customer", "Phone", "Opening (Rs)", "Billed (Rs)", "Paid (Rs)", "Credited (Rs)", "Balance (Rs)"]];
      for (const c of customers) {
        const l = ledgers.get(c.id);
        rows.push([
          c.name, c.phone ?? "",
          rs(l?.openingPaisa ?? 0), rs(l?.chargedPaisa ?? 0), rs(l?.paidPaisa ?? 0),
          rs(l?.creditedPaisa ?? 0), rs(l?.balancePaisa ?? 0),
        ]);
      }
      break;
    }

    case "invoices": {
      const invoices = await prisma.invoice.findMany({
        orderBy: { date: "desc" },
        include: { customer: true, items: true, payments: true },
      });
      rows = [["Bill #", "Date", "Customer", "Status", "Total (Rs)", "Paid (Rs)", "Owing (Rs)"]];
      for (const i of invoices) {
        const total = sumLines(i.items);
        const paid = i.payments.reduce((s, p) => s + p.amountPaisa, 0);
        rows.push([
          i.number, i.date.toISOString().slice(0, 10), i.customer.name, i.status,
          rs(total), rs(paid), rs(i.status === "VOIDED" ? 0 : total - paid),
        ]);
      }
      break;
    }

    case "expenses": {
      const expenses = await prisma.expense.findMany({ orderBy: { date: "desc" } });
      rows = [["Date", "Category", "Note", "Amount (Rs)"]];
      for (const e of expenses) {
        rows.push([e.date.toISOString().slice(0, 10), e.category, e.note ?? "", rs(e.amountPaisa)]);
      }
      break;
    }

    case "income-statement": {
      const period = resolvePeriod({
        month: url.searchParams.get("month") ?? undefined,
        year: url.searchParams.get("year") ?? undefined,
      });
      const { statement, perProduct } = await getIncomeStatement(period.from, period.to);
      rows = [
        [`Income statement — ${period.label}`],
        [],
        ["Sales", rs(statement.salesPaisa)],
        ["Cost of goods sold", rs(-statement.cogsPaisa)],
        ["Gross profit", rs(statement.grossPaisa)],
        ["Operating expenses", rs(-statement.expensesPaisa)],
        ["Free samples (marketing)", rs(-statement.samplesCostPaisa)],
        ["Net profit", rs(statement.netPaisa)],
        [],
        ["Profit per product"],
        ["Code", "Product", "Qty sold", "Unit", "Revenue (Rs)", "COGS (Rs)", "Profit (Rs)"],
      ];
      for (const p of perProduct) {
        rows.push([
          p.code,
          p.name,
          p.qtyMilli === null ? "" : fromMilli(p.qtyMilli),
          p.qtyMilli === null ? "" : unitShort(p.unit),
          rs(p.revenuePaisa),
          rs(p.cogsPaisa),
          rs(p.profitPaisa),
        ]);
      }
      name = `income-statement-${period.label.replace(/\s+/g, "-")}`;
      break;
    }

    default:
      return Response.json({ error: "Unknown export type" }, { status: 404 });
  }

  const body = "﻿" + csv(rows); // BOM so Excel opens UTF-8 correctly
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
