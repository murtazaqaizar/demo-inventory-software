import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { getLowStock } from "@/lib/stock";
import { getAging } from "@/lib/receivables";
import { getSalesTotals, } from "@/lib/reports";
import { sumLines } from "@/lib/receivables";
import { getAccountBalances } from "@/lib/money-accounts";
import { formatPKR } from "@/lib/money";
import {
  Badge,
  Button,
  EmptyState,
  GroupRow,
  PageHeader,
  Panel,
  PanelHeader,
  Rail,
  RailBlock,
  RailList,
  RailListItem,
  RailStat,
  rowClass,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";

export default async function DashboardPage() {
  const user = await requireUser();
  const owner = user.role === "OWNER";

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

  // One parallel batch — everything the page needs, including the owner-only
  // panels. These used to run as three extra serial round-trips after this block.
  const [
    productCount,
    customerCount,
    sales,
    lowStock,
    pendingCheques,
    accounts,
    aging,
    recentBills,
  ] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    prisma.customer.count({ where: { isCashCustomer: false } }),
    getSalesTotals({ startToday, startMonth, startLastMonth, endLastMonth }),
    getLowStock(),
    prisma.cheque.findMany({
      where: { status: "PENDING", chequeDate: { lte: weekAhead } },
      orderBy: { chequeDate: "asc" },
      take: 5,
    }),
    owner ? getAccountBalances() : Promise.resolve([]),
    owner ? getAging() : Promise.resolve([]),
    // The working list — this is the hero of the page, not the totals.
    prisma.invoice.findMany({
      orderBy: { date: "desc" },
      take: 12,
      include: { customer: true, items: true, payments: true },
    }),
  ]);

  const monthSales = sales.month;
  const lastMonthSales = sales.lastMonth;
  const delta =
    lastMonthSales > 0
      ? Math.round(((monthSales - lastMonthSales) / lastMonthSales) * 100)
      : null;

  const totalOwed = aging.reduce((s, a) => s + a.total, 0);
  const overdue = aging.reduce((s, a) => s + a.d30 + a.d60 + a.d90, 0);
  const topDebtors = aging.slice(0, 5);

  // Group the working list by day, same treatment as the Billing page.
  const rows = recentBills.map((inv) => {
    const totalPaisa = sumLines(inv.items);
    const paid = inv.payments.reduce((s, p) => s + p.amountPaisa, 0);
    const voided = inv.status === "VOIDED";
    return {
      inv,
      totalPaisa,
      owing: voided ? 0 : totalPaisa - paid,
      voided,
      key: inv.date.toLocaleDateString("en-PK", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    };
  });
  const groups = rows.reduce<{ key: string; items: typeof rows }[]>((acc, r) => {
    const last = acc[acc.length - 1];
    if (last && last.key === r.key) last.items.push(r);
    else acc.push({ key: r.key, items: [r] });
    return acc;
  }, []);

  return (
    <div>
      <PageHeader
        title="Today at the counter"
        description={`Welcome, ${user.name}. Signed in as ${user.role}.`}
        action={
          <Link href="/billing/new">
            <Button>+ New bill</Button>
          </Link>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* ── Working list first, full width ─────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <Panel>
            <PanelHeader
              title="Recent bills"
              action={
                <Link
                  href="/billing"
                  className="text-[15px] font-medium text-accent hover:underline"
                >
                  All bills →
                </Link>
              }
            />
            {rows.length === 0 ? (
              <EmptyState>
                No bills yet. Raise your first bill to get started.
              </EmptyState>
            ) : (
              <div className="tablewrap">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Bill</th>
                      <th className={thClass}>Customer</th>
                      <th className={thClass}>Status</th>
                      <th className={thNumClass}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => {
                      const sum = g.items.reduce(
                        (s, r) => s + (r.voided ? 0 : r.totalPaisa),
                        0,
                      );
                      const owed = g.items.reduce((s, r) => s + r.owing, 0);
                      return (
                        <GroupRow
                          key={g.key}
                          label={g.key}
                          labelSpan={2}
                          aggregateSpan={2}
                          aggregate={
                            <>
                              {g.items.length} bill{g.items.length > 1 ? "s" : ""} ·{" "}
                              {formatPKR(sum)}
                              {owed > 0 && (
                                <span className="text-warn"> · {formatPKR(owed)} owing</span>
                              )}
                            </>
                          }
                        >
                          {g.items.map(({ inv, totalPaisa, owing, voided }) => (
                            <tr
                              key={inv.id}
                              className={`${rowClass} ${voided ? "opacity-55" : ""}`}
                            >
                              <td className={`${tdClass} font-mono`} data-label="Bill">
                                #{inv.number}
                              </td>
                              <td className={tdClass} data-label="Customer">
                                {inv.customer.name}
                              </td>
                              <td className={tdClass} data-label="Status">
                                {voided ? (
                                  <Badge tone="red">Voided</Badge>
                                ) : owing > 0 ? (
                                  <Badge tone="amber">{formatPKR(owing)} owing</Badge>
                                ) : (
                                  <Badge tone="green">Paid</Badge>
                                )}
                              </td>
                              <td
                                className={`${tdNumClass} font-medium`}
                                data-label="Total"
                              >
                                <span className={voided ? "line-through" : ""}>
                                  {formatPKR(totalPaisa)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </GroupRow>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* ── Metrics live in the rail — context, not the primary path ──── */}
        <Rail>
          <RailBlock title="This month">
            <RailStat
              label="Sales today"
              value={formatPKR(sales.today)}
            />
            <RailStat
              label="Sales this month"
              value={formatPKR(monthSales)}
              note={
                delta === null
                  ? "no sales last month to compare"
                  : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs last month (${formatPKR(lastMonthSales)})`
              }
              tone={delta === null ? "ink" : delta >= 0 ? "good" : "warn"}
            />
            {owner ? (
              <>
                <RailStat
                  label="Owed to you"
                  value={formatPKR(totalOwed)}
                  note={`${formatPKR(overdue)} over 30 days`}
                  tone={overdue > 0 ? "warn" : "ink"}
                />
                <RailStat
                  label="Cash + Bank"
                  value={formatPKR(accounts.reduce((s, a) => s + a.balancePaisa, 0))}
                  note={accounts
                    .map((a) => `${a.name}: ${formatPKR(a.balancePaisa)}`)
                    .join(" · ")}
                />
              </>
            ) : (
              <>
                <RailStat label="Active products" value={productCount} />
                <RailStat label="Customers" value={customerCount} />
              </>
            )}
          </RailBlock>

          <RailBlock title={`Low stock (${lowStock.length})`}>
            {lowStock.length === 0 ? (
              <p className="text-[15px] text-ink-muted">Everything is above its minimum.</p>
            ) : (
              <RailList>
                {lowStock.slice(0, 6).map((p) => (
                  <RailListItem key={p.id}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{p.name}</span>
                      <span className="block truncate text-[13px] text-ink-muted">
                        {[p.size, p.variant].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <Badge tone="red">
                      {p.qty} / {p.minStockLevel}
                    </Badge>
                  </RailListItem>
                ))}
              </RailList>
            )}
            <Link
              href="/products"
              className="mt-3 inline-block text-[13px] font-medium text-accent hover:underline"
            >
              All products →
            </Link>
          </RailBlock>

          {owner && (
            <RailBlock title="Top debtors">
              {topDebtors.length === 0 ? (
                <p className="text-[15px] text-ink-muted">Nobody owes you anything.</p>
              ) : (
                <RailList>
                  {topDebtors.map((d) => (
                    <RailListItem key={d.customerId}>
                      <Link
                        href={`/customers/${d.customerId}`}
                        className="min-w-0 truncate text-ink hover:text-accent hover:underline"
                      >
                        {d.name}
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-mono font-medium">{formatPKR(d.total)}</span>
                        {d.oldestDays !== null && d.oldestDays > 30 && (
                          <Badge tone={d.oldestDays > 90 ? "red" : "amber"}>
                            {d.oldestDays >= 999 ? "opening" : `${d.oldestDays}d`}
                          </Badge>
                        )}
                      </span>
                    </RailListItem>
                  ))}
                </RailList>
              )}
              <Link
                href="/aging"
                className="mt-3 inline-block text-[13px] font-medium text-accent hover:underline"
              >
                Who owes me →
              </Link>
            </RailBlock>
          )}

          {owner && (
            <RailBlock title="Cheques due soon">
              {pendingCheques.length === 0 ? (
                <p className="text-[15px] text-ink-muted">
                  No cheques pending in the next week.
                </p>
              ) : (
                <RailList>
                  {pendingCheques.map((c) => (
                    <RailListItem key={c.id}>
                      <span className="min-w-0">
                        <span className="block truncate font-mono font-medium text-ink">
                          {c.number}
                        </span>
                        <span className="block truncate text-[13px] text-ink-muted">
                          {c.bank}
                          {c.partyName ? ` · ${c.partyName}` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-mono">{formatPKR(c.amountPaisa)}</span>
                        <span className="font-mono text-[13px] text-ink-muted">
                          {c.direction === "RECEIVED" ? "in" : "out"} ·{" "}
                          {c.chequeDate.toLocaleDateString("en-PK")}
                        </span>
                      </span>
                    </RailListItem>
                  ))}
                </RailList>
              )}
              <Link
                href="/cheques"
                className="mt-3 inline-block text-[13px] font-medium text-accent hover:underline"
              >
                All cheques →
              </Link>
            </RailBlock>
          )}

          {!owner && (
            <p className="text-[13px] text-ink-muted">
              Cost, profit and the income statement are visible to the owner only. You can
              manage billing, returns, stock and customer accounts.
            </p>
          )}
        </Rail>
      </div>
    </div>
  );
}
