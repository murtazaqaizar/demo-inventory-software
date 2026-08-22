import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { num } from "@/lib/sql";

// Single source of truth for what customers owe.
//
// Model: every ACTIVE invoice is a charge on the customer. Money received at billing
// time is recorded in InvoicePayment (so a bill can be split), later lump sums are
// Payment rows, and returns credited to the account are CreditNotes.
//
//   balance = opening
//           + Σ active invoice totals
//           − Σ invoice payments
//           − Σ lump-sum payments
//           − Σ credit notes credited to account
//
// Voided invoices are excluded entirely (improvement 2).
//
// PERFORMANCE: these sums are done by Postgres, not by pulling the whole sales
// history into Node. The old version ran `invoice.findMany({ status: ACTIVE })`
// with every line item and payment included on every dashboard / customer-list
// render, so page time grew with total history forever. Everything below returns
// one row per customer (or per unpaid invoice) instead.

export function lineTotal(it: { ratePaisa: number; quantity: number; isSample?: boolean }) {
  return it.isSample ? 0 : it.ratePaisa * it.quantity;
}

export function sumLines(items: { ratePaisa: number; quantity: number; isSample?: boolean }[]) {
  return items.reduce((s, it) => s + lineTotal(it), 0);
}

export type CustomerLedger = {
  customerId: string;
  openingPaisa: number;
  chargedPaisa: number;
  paidPaisa: number;
  creditedPaisa: number;
  balancePaisa: number;
};

type LedgerRow = {
  customerId: string;
  opening: number | string;
  charged: number | string;
  paidAtBilling: number | string;
  paidLumpSum: number | string;
  credited: number | string;
};

// `customerIds` scopes the whole computation — pass the ids actually on screen and
// Postgres only touches those customers' rows. Omit it for a full receivables sweep.
export async function getCustomerLedgers(
  customerIds?: string[]
): Promise<Map<string, CustomerLedger>> {
  if (customerIds && customerIds.length === 0) return new Map();

  const scopeCustomer = customerIds
    ? Prisma.sql`WHERE c."id" IN (${Prisma.join(customerIds)})`
    : Prisma.empty;
  const scopeInvoice = customerIds
    ? Prisma.sql`AND i."customerId" IN (${Prisma.join(customerIds)})`
    : Prisma.empty;
  const scopePayment = customerIds
    ? Prisma.sql`WHERE p."customerId" IN (${Prisma.join(customerIds)})`
    : Prisma.empty;
  const scopeCreditNote = customerIds
    ? Prisma.sql`AND n."customerId" IN (${Prisma.join(customerIds)})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<LedgerRow[]>`
    SELECT
      c."id"                        AS "customerId",
      c."openingBalancePaisa"       AS "opening",
      COALESCE(ch."charged", 0)     AS "charged",
      COALESCE(ip."paid", 0)        AS "paidAtBilling",
      COALESCE(pm."paid", 0)        AS "paidLumpSum",
      COALESCE(cn."credited", 0)    AS "credited"
    FROM "Customer" c
    LEFT JOIN (
      SELECT i."customerId",
             SUM(CASE WHEN it."isSample" THEN 0 ELSE it."ratePaisa" * it."quantity" END) AS "charged"
      FROM "Invoice" i
      JOIN "InvoiceItem" it ON it."invoiceId" = i."id"
      WHERE i."status" = 'ACTIVE' ${scopeInvoice}
      GROUP BY i."customerId"
    ) ch ON ch."customerId" = c."id"
    LEFT JOIN (
      SELECT i."customerId", SUM(p."amountPaisa") AS "paid"
      FROM "Invoice" i
      JOIN "InvoicePayment" p ON p."invoiceId" = i."id"
      WHERE i."status" = 'ACTIVE' ${scopeInvoice}
      GROUP BY i."customerId"
    ) ip ON ip."customerId" = c."id"
    LEFT JOIN (
      SELECT p."customerId", SUM(p."amountPaisa") AS "paid"
      FROM "Payment" p
      ${scopePayment}
      GROUP BY p."customerId"
    ) pm ON pm."customerId" = c."id"
    LEFT JOIN (
      SELECT n."customerId", SUM(ci."ratePaisa" * ci."quantity") AS "credited"
      FROM "CreditNote" n
      JOIN "CreditNoteItem" ci ON ci."creditNoteId" = n."id"
      WHERE n."refundMethod" = 'CREDIT_TO_ACCOUNT' ${scopeCreditNote}
      GROUP BY n."customerId"
    ) cn ON cn."customerId" = c."id"
    ${scopeCustomer}
  `;

  const map = new Map<string, CustomerLedger>();
  for (const r of rows) {
    const openingPaisa = num(r.opening);
    const chargedPaisa = num(r.charged);
    const paidPaisa = num(r.paidAtBilling) + num(r.paidLumpSum);
    const creditedPaisa = num(r.credited);
    map.set(r.customerId, {
      customerId: r.customerId,
      openingPaisa,
      chargedPaisa,
      paidPaisa,
      creditedPaisa,
      balancePaisa: openingPaisa + chargedPaisa - paidPaisa - creditedPaisa,
    });
  }
  return map;
}

export async function getCustomerBalances(customerIds?: string[]): Promise<Map<string, number>> {
  const ledgers = await getCustomerLedgers(customerIds);
  const out = new Map<string, number>();
  for (const [id, l] of ledgers) out.set(id, l.balancePaisa);
  return out;
}

export async function getCustomerBalance(customerId: string): Promise<number> {
  return (await getCustomerBalances([customerId])).get(customerId) ?? 0;
}

// Total owed across every active credit customer, as one scalar from Postgres —
// so the customers list doesn't have to load every customer just to print a footer.
export async function getTotalReceivable(): Promise<number> {
  const rows = await prisma.$queryRaw<{ total: number | string | null }[]>`
    SELECT SUM(
      c."openingBalancePaisa"
      + COALESCE((
          SELECT SUM(CASE WHEN it."isSample" THEN 0 ELSE it."ratePaisa" * it."quantity" END)
          FROM "Invoice" i
          JOIN "InvoiceItem" it ON it."invoiceId" = i."id"
          WHERE i."customerId" = c."id" AND i."status" = 'ACTIVE'
        ), 0)
      - COALESCE((
          SELECT SUM(p."amountPaisa")
          FROM "Invoice" i
          JOIN "InvoicePayment" p ON p."invoiceId" = i."id"
          WHERE i."customerId" = c."id" AND i."status" = 'ACTIVE'
        ), 0)
      - COALESCE((
          SELECT SUM(p."amountPaisa") FROM "Payment" p WHERE p."customerId" = c."id"
        ), 0)
      - COALESCE((
          SELECT SUM(ci."ratePaisa" * ci."quantity")
          FROM "CreditNote" n
          JOIN "CreditNoteItem" ci ON ci."creditNoteId" = n."id"
          WHERE n."customerId" = c."id" AND n."refundMethod" = 'CREDIT_TO_ACCOUNT'
        ), 0)
    ) AS "total"
    FROM "Customer" c
    WHERE c."isCashCustomer" = false AND c."active" = true
  `;
  return num(rows[0]?.total);
}

// ---------------------------------------------------------------------------
// Aging (improvement 7)
//
// Payments are lump sums, so for reporting we allocate unallocated credit against
// the OLDEST outstanding invoices first (FIFO). What's left is bucketed by invoice age.
// ---------------------------------------------------------------------------

export type AgingBuckets = {
  current: number; // 0-30 days
  d30: number; // 31-60
  d60: number; // 61-90
  d90: number; // 90+ (includes opening balance)
  total: number;
};

export type CustomerAging = AgingBuckets & {
  customerId: string;
  name: string;
  phone: string | null;
  creditLimitPaisa: number;
  overLimit: boolean;
  oldestDays: number | null;
};

function bucketFor(days: number): keyof Omit<AgingBuckets, "total"> {
  if (days <= 30) return "current";
  if (days <= 60) return "d30";
  if (days <= 90) return "d60";
  return "d90";
}

type OpenInvoiceRow = { customerId: string; date: Date; outstanding: number | string };

export async function getAging(asOf: Date = new Date()): Promise<CustomerAging[]> {
  const [customers, openInvoices, payments, creditNotes] = await Promise.all([
    prisma.customer.findMany({
      where: { isCashCustomer: false },
      select: { id: true, name: true, phone: true, openingBalancePaisa: true, creditLimitPaisa: true },
    }),
    // One row per *still-unpaid* bill, already netted off in Postgres. Bills that
    // were fully paid at billing time were skipped by the old loop too, so they
    // never need to leave the database.
    prisma.$queryRaw<OpenInvoiceRow[]>`
      SELECT x."customerId", x."date", x."outstanding"
      FROM (
        SELECT i."customerId",
               i."date",
               COALESCE(t."total", 0) - COALESCE(p."paid", 0) AS "outstanding"
        FROM "Invoice" i
        JOIN "Customer" c ON c."id" = i."customerId" AND c."isCashCustomer" = false
        LEFT JOIN (
          SELECT it."invoiceId",
                 SUM(CASE WHEN it."isSample" THEN 0 ELSE it."ratePaisa" * it."quantity" END) AS "total"
          FROM "InvoiceItem" it
          GROUP BY it."invoiceId"
        ) t ON t."invoiceId" = i."id"
        LEFT JOIN (
          SELECT ip."invoiceId", SUM(ip."amountPaisa") AS "paid"
          FROM "InvoicePayment" ip
          GROUP BY ip."invoiceId"
        ) p ON p."invoiceId" = i."id"
        WHERE i."status" = 'ACTIVE'
      ) x
      WHERE x."outstanding" > 0
      ORDER BY x."date" ASC
    `,
    prisma.payment.groupBy({ by: ["customerId"], _sum: { amountPaisa: true } }),
    prisma.$queryRaw<{ customerId: string; credited: number | string }[]>`
      SELECT n."customerId", SUM(ci."ratePaisa" * ci."quantity") AS "credited"
      FROM "CreditNote" n
      JOIN "CreditNoteItem" ci ON ci."creditNoteId" = n."id"
      WHERE n."refundMethod" = 'CREDIT_TO_ACCOUNT'
      GROUP BY n."customerId"
    `,
  ]);

  const unallocated = new Map<string, number>();
  for (const p of payments) unallocated.set(p.customerId, p._sum.amountPaisa ?? 0);
  for (const cn of creditNotes) {
    unallocated.set(cn.customerId, (unallocated.get(cn.customerId) ?? 0) + num(cn.credited));
  }

  const invByCustomer = new Map<string, OpenInvoiceRow[]>();
  for (const inv of openInvoices) {
    const arr = invByCustomer.get(inv.customerId) ?? [];
    arr.push(inv);
    invByCustomer.set(inv.customerId, arr);
  }

  const result: CustomerAging[] = [];

  for (const c of customers) {
    let credit = unallocated.get(c.id) ?? 0;
    const buckets: AgingBuckets = { current: 0, d30: 0, d60: 0, d90: 0, total: 0 };
    let oldestDays: number | null = null;

    // Opening balance is the oldest debt — settle it first.
    let opening = c.openingBalancePaisa;
    const useOnOpening = Math.min(credit, opening);
    opening -= useOnOpening;
    credit -= useOnOpening;
    if (opening > 0) {
      buckets.d90 += opening;
      oldestDays = 999;
    }

    for (const inv of invByCustomer.get(c.id) ?? []) {
      let outstanding = num(inv.outstanding);

      const use = Math.min(credit, outstanding);
      outstanding -= use;
      credit -= use;
      if (outstanding <= 0) continue;

      const days = Math.max(
        0,
        Math.floor((asOf.getTime() - inv.date.getTime()) / 86_400_000)
      );
      buckets[bucketFor(days)] += outstanding;
      if (oldestDays === null || days > oldestDays) oldestDays = days;
    }

    buckets.total = buckets.current + buckets.d30 + buckets.d60 + buckets.d90;
    if (buckets.total === 0) continue; // only show customers who owe

    result.push({
      customerId: c.id,
      name: c.name,
      phone: c.phone,
      creditLimitPaisa: c.creditLimitPaisa,
      overLimit: c.creditLimitPaisa > 0 && buckets.total > c.creditLimitPaisa,
      oldestDays,
      ...buckets,
    });
  }

  return result.sort((a, b) => b.total - a.total);
}
