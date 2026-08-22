import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { formatPKR } from "@/lib/money";
import { getBusinessSettings } from "@/lib/settings";
import { drawsTextHeader } from "@/lib/letterhead";
import { daysSince } from "@/lib/dates";
import { PrintSheet } from "@/components/print-sheet";
import {
  Badge,
  Button,
  Input,
  Label,
  PageHeader,
  Panel,
  Rail,
  RailBlock,
  RailStat,
} from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { WhatsAppButton } from "@/components/whatsapp-button";

type Row = { date: Date; kind: string; debit: number; credit: number };

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export default async function CustomerStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { from, to } = await searchParams;

  const settings = await getBusinessSettings();

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  const [invoices, payments, creditNotes] = await Promise.all([
    // Every active bill is a charge; money taken at billing time shows as a credit.
    prisma.invoice.findMany({
      where: { customerId: id, status: "ACTIVE" },
      include: { items: true, payments: true },
      orderBy: { date: "asc" },
    }),
    prisma.payment.findMany({ where: { customerId: id }, orderBy: { date: "asc" } }),
    prisma.creditNote.findMany({
      where: { customerId: id, refundMethod: "CREDIT_TO_ACCOUNT" },
      include: { items: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const allRows: Row[] = [
    ...invoices.map((inv) => ({
      date: inv.date,
      kind: `Bill #${inv.number}`,
      debit: inv.items.reduce((s, it) => s + (it.isSample ? 0 : it.ratePaisa * it.quantity), 0),
      credit: inv.payments.reduce((s, p) => s + p.amountPaisa, 0),
    })),
    ...payments.map((p) => ({
      date: p.date,
      kind: `Payment (${p.method})`,
      debit: 0,
      credit: p.amountPaisa,
    })),
    ...creditNotes.map((cn) => ({
      date: cn.date,
      kind: `Return #${cn.number}`,
      debit: 0,
      credit: cn.items.reduce((s, it) => s + it.ratePaisa * it.quantity, 0),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? endOfDay(new Date(to)) : null;

  // Opening balance for the chosen period = starting balance + everything before `from`.
  let opening = customer.openingBalancePaisa;
  const inPeriod: Row[] = [];
  for (const r of allRows) {
    if (fromDate && r.date < fromDate) {
      opening += r.debit - r.credit;
      continue;
    }
    if (toDate && r.date > toDate) continue;
    inPeriod.push(r);
  }

  let running = opening;
  const withBalance = inPeriod.map((r) => {
    running += r.debit - r.credit;
    return { ...r, balance: running };
  });

  const periodLabel =
    fromDate || toDate
      ? `${fromDate ? fromDate.toLocaleDateString("en-PK") : "start"} – ${
          to ? new Date(to).toLocaleDateString("en-PK") : "today"
        }`
      : "All transactions";

  // Per-bill breakdown (client request): every bill with what's paid and what's still owing.
  const bills = invoices
    .map((inv) => {
      const total = inv.items.reduce((s, it) => s + (it.isSample ? 0 : it.ratePaisa * it.quantity), 0);
      const paid = inv.payments.reduce((s, p) => s + p.amountPaisa, 0);
      return { id: inv.id, number: inv.number, date: inv.date, total, paid, owing: total - paid };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalBilled = bills.reduce((s, b) => s + b.total, 0);
  const paidAtBilling = bills.reduce((s, b) => s + b.paid, 0);
  const lumpTotal = payments.reduce((s, p) => s + p.amountPaisa, 0);
  const returnsTotal = creditNotes.reduce(
    (s, cn) => s + cn.items.reduce((t, it) => t + it.ratePaisa * it.quantity, 0),
    0
  );
  const oldestOwing = bills.filter((b) => b.owing > 0).at(-1);
  const oldestOwingDays = oldestOwing ? daysSince(oldestOwing.date) : null;
  const totalReceived = paidAtBilling + lumpTotal;
  const outstanding = customer.openingBalancePaisa + totalBilled - totalReceived - returnsTotal;

  return (
    <div>
      <PageHeader
        title={customer.name}
        description={[customer.phone, periodLabel].filter(Boolean).join(" · ")}
        action={
          <div className="no-print flex flex-wrap gap-2.5">
            <Link href={`/customers/${customer.id}/edit`}>
              <Button variant="secondary">Edit customer</Button>
            </Link>
            <PrintButton label="Print / PDF" />
          </div>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="no-print mb-4">
            <Panel>
              <form method="get" className="flex flex-wrap items-end gap-2.5 px-4 py-4 md:px-6">
                <div>
                  <Label htmlFor="from">From</Label>
                  <Input id="from" type="date" name="from" defaultValue={from ?? ""} className="w-auto font-mono" />
                </div>
                <div>
                  <Label htmlFor="to">To</Label>
                  <Input id="to" type="date" name="to" defaultValue={to ?? ""} className="w-auto font-mono" />
                </div>
                <Button type="submit" variant="secondary">Filter</Button>
                <Link href={`/customers/${customer.id}`}>
                  <Button type="button" variant="quiet">Clear</Button>
                </Link>
              </form>
            </Panel>
          </div>

      <PrintSheet settings={settings} documentDate={new Date()}>
        <div className="flex items-start justify-between border-b border-line-strong pb-4">
          {drawsTextHeader(settings) ? (
            <div>
              <h1 className="text-xl font-bold">{settings.name}</h1>
              <p className="text-xs text-ink-muted">{settings.phone}</p>
            </div>
          ) : (
            // The letterhead already carries the shop name; printing it twice
            // looks like a mistake. The spacer keeps the layout.
            <div />
          )}
          <div className="text-right">
            <p className="text-lg font-semibold">LEDGER</p>
            <p className="text-sm">{customer.name}</p>
            {customer.phone && <p className="text-xs text-ink-muted">{customer.phone}</p>}
          </div>
        </div>

        {/* Bills for this customer */}
        <h2 className="mt-6 text-sm font-semibold text-ink">Bills</h2>
        {bills.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">No bills yet.</p>
        ) : (
          <table className="rtable mt-2 w-full text-[15px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-ink-muted">
                <th className="h-11 py-2.5">Bill</th>
                <th className="h-11 py-2.5">Date</th>
                <th className="h-11 py-2.5 text-right font-mono">Total</th>
                <th className="h-11 py-2.5 text-right font-mono">Paid</th>
                <th className="h-11 py-2.5 text-right font-mono">Owing</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} className="border-b border-line">
                  <td className="h-11 py-2.5" data-label="Bill">
                    <Link href={`/billing/${b.id}/print`} className="text-ink-muted underline hover:text-ink">
                      #{b.number}
                    </Link>
                  </td>
                  <td className="h-11 py-2.5 text-ink-muted" data-label="Date">{b.date.toLocaleDateString("en-PK")}</td>
                  <td className="h-11 py-2.5 text-right font-mono" data-label="Total">{formatPKR(b.total)}</td>
                  <td className="h-11 py-2.5 text-right font-mono text-ink-muted" data-label="Paid">{formatPKR(b.paid)}</td>
                  <td className="h-11 py-2.5 text-right font-mono" data-label="Owing">
                    {b.owing > 0 ? (
                      <span className="font-medium text-warn">{formatPKR(b.owing)}</span>
                    ) : (
                      <Badge tone="green">Paid</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Running statement (every bill, payment and return in order) */}
        <div className="mt-6 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink">Running statement</h2>
          <span className="text-xs text-ink-muted">{periodLabel}</span>
        </div>
        <table className="rtable mt-2 w-full text-[15px]">
          <thead>
            <tr className="border-b border-line-strong text-left text-ink-muted">
              <th className="h-11 py-2.5">Date</th>
              <th className="h-11 py-2.5">Detail</th>
              <th className="h-11 py-2.5 text-right font-mono">Bill</th>
              <th className="h-11 py-2.5 text-right font-mono">Paid</th>
              <th className="h-11 py-2.5 text-right font-mono">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line text-ink-muted">
              <td className="h-11 py-2.5">—</td>
              <td className="h-11 py-2.5">Opening balance</td>
              <td className="h-11 py-2.5 text-right font-mono">—</td>
              <td className="h-11 py-2.5 text-right font-mono">—</td>
              <td className="h-11 py-2.5 text-right font-mono">{formatPKR(opening)}</td>
            </tr>
            {withBalance.map((r, i) => (
              <tr key={i} className="border-b border-line">
                <td className="h-11 py-2.5 text-ink-muted" data-label="Date">{r.date.toLocaleDateString("en-PK")}</td>
                <td className="h-11 py-2.5" data-label="Detail">{r.kind}</td>
                <td className="h-11 py-2.5 text-right font-mono" data-label="Bill">{r.debit ? formatPKR(r.debit) : "—"}</td>
                <td className="h-11 py-2.5 text-right font-mono" data-label="Paid">{r.credit ? formatPKR(r.credit) : "—"}</td>
                <td className="h-11 py-2.5 text-right font-mono" data-label="Balance">{formatPKR(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong font-semibold">
              <td className="h-11 py-2.5" colSpan={4}>
                Closing balance
              </td>
              <td className="h-11 py-2.5 text-right font-mono">{formatPKR(running)}</td>
            </tr>
          </tfoot>
        </table>
      </PrintSheet>
        </div>

        {/* The rail earns its place here: the one figure that matters, and the
            action you came to take. */}
        <Rail>
          <RailBlock title="Outstanding">
            <p className="font-mono text-[30px] font-semibold leading-tight tracking-[-0.01em] text-ink">
              {formatPKR(outstanding)}
            </p>
            {oldestOwingDays !== null && outstanding > 0 && (
              <p className="mt-1 text-[13px] text-warn">
                Oldest unpaid bill {oldestOwingDays} days
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/customers" className="w-full">
                <Button className="w-full">Record payment</Button>
              </Link>
              <WhatsAppButton
                phone={customer.phone}
                text={`Assalam-o-Alaikum ${customer.name}, your account statement from ${settings.name}. Closing balance: ${formatPKR(running)}. JazakAllah.`}
              />
            </div>
          </RailBlock>

          <RailBlock title="Account">
            <RailStat label="Opening balance" value={formatPKR(customer.openingBalancePaisa)} />
            <RailStat label="Total billed" value={formatPKR(totalBilled)} />
            <RailStat label="Received" value={formatPKR(totalReceived + returnsTotal)} />
            {customer.creditLimitPaisa > 0 && (
              <RailStat
                label="Credit limit"
                value={formatPKR(customer.creditLimitPaisa)}
                note={outstanding > customer.creditLimitPaisa ? "over limit" : undefined}
                tone={outstanding > customer.creditLimitPaisa ? "bad" : "ink"}
              />
            )}
            {customer.phone && <RailStat label="Phone" value={customer.phone} />}
          </RailBlock>

          <Link
            href="/customers"
            className="no-print text-[13px] font-medium text-accent hover:underline"
          >
            ← Back to customers
          </Link>
        </Rail>
      </div>
    </div>
  );
}
