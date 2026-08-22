import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { formatPKR } from "@/lib/money";
import { sumLines } from "@/lib/receivables";
import {
  Badge,
  Button,
  EmptyState,
  GroupBySwitch,
  GroupRow,
  Panel,
  PageHeader,
  RowMenu,
  rowClass,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import { SearchBar, Pagination } from "@/components/list-controls";
import { VoidButton } from "./void-button";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 25;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    from?: string;
    to?: string;
    page?: string;
    group?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  // Group-by is a user control; date is the default and matches the sort order.
  const group = sp.group === "cust" ? "cust" : "date";

  const where: Prisma.InvoiceWhereInput = {};
  if (sp.q) {
    const asNumber = parseInt(sp.q, 10);
    where.OR = [
      { customer: { name: { contains: sp.q, mode: "insensitive" } } },
      ...(isNaN(asNumber) ? [] : [{ number: asNumber }]),
    ];
  }
  if (sp.from || sp.to) {
    where.date = {};
    if (sp.from) where.date.gte = new Date(sp.from);
    if (sp.to) {
      const end = new Date(sp.to);
      end.setHours(23, 59, 59, 999);
      where.date.lte = end;
    }
  }

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      // Grouping by customer needs the rows clustered by customer first,
      // otherwise a customer would appear under several group headers.
      orderBy:
        group === "cust"
          ? [{ customer: { name: "asc" } }, { date: "desc" }]
          : { date: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customer: true, items: true, payments: true },
    }),
    prisma.invoice.count({ where }),
  ]);

  const owner = user.role === "OWNER";

  // Decorate once so the group aggregates and the rows agree.
  const rows = invoices.map((inv) => {
    const totalPaisa = sumLines(inv.items);
    const paid = inv.payments.reduce((s, p) => s + p.amountPaisa, 0);
    const voided = inv.status === "VOIDED";
    return {
      inv,
      totalPaisa,
      owing: voided ? 0 : totalPaisa - paid,
      voided,
      key: group === "cust" ? inv.customer.name : inv.date.toLocaleDateString("en-PK"),
    };
  });

  // Preserve insertion order — the query already clustered the rows.
  const groups = rows.reduce<{ key: string; items: typeof rows }[]>((acc, r) => {
    const last = acc[acc.length - 1];
    if (last && last.key === r.key) last.items.push(r);
    else acc.push({ key: r.key, items: [r] });
    return acc;
  }, []);

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Every bill is saved here. Search by customer or bill number."
        action={
          <Link href="/billing/new">
            <Button>+ New bill</Button>
          </Link>
        }
      />

      {invoices.length === 0 ? (
        <Panel>
          <SearchBar
            action="/billing"
            q={sp.q}
            from={sp.from}
            to={sp.to}
            withDates
            placeholder="Customer name or bill #"
          />
          <EmptyState>No bills match. Try clearing the search.</EmptyState>
        </Panel>
      ) : (
        <>
          <Panel>
            <SearchBar
              action="/billing"
              q={sp.q}
              from={sp.from}
              to={sp.to}
              withDates
              placeholder="Customer name or bill #"
            >
              <GroupBySwitch
                basePath="/billing"
                current={group}
                params={{ q: sp.q, from: sp.from, to: sp.to }}
                options={[
                  { value: "date", label: "Date" },
                  { value: "cust", label: "Customer" },
                ]}
              />
            </SearchBar>

            <div className="tablewrap">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Bill</th>
                    <th className={thClass}>{group === "cust" ? "Date" : "Customer"}</th>
                    <th className={thClass}>Paid / Owing</th>
                    <th className={thNumClass}>Total</th>
                    <th className={thClass} />
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
                        aggregateSpan={3}
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
                          <tr key={inv.id} className={`${rowClass} ${voided ? "opacity-55" : ""}`}>
                            <td className={`${tdClass} font-mono`} data-label="Bill">
                              #{inv.number}
                            </td>
                            <td className={tdClass} data-label={group === "cust" ? "Date" : "Customer"}>
                              {group === "cust" ? (
                                <span className="font-mono text-ink-muted">
                                  {inv.date.toLocaleDateString("en-PK")}
                                </span>
                              ) : (
                                inv.customer.name
                              )}
                            </td>
                            <td className={tdClass} data-label="Paid / Owing">
                              {voided ? (
                                <Badge tone="red">
                                  Voided{inv.voidReason ? ` — ${inv.voidReason}` : ""}
                                </Badge>
                              ) : owing > 0 ? (
                                <Badge tone="amber">{formatPKR(owing)} owing</Badge>
                              ) : (
                                <Badge tone="green">Paid</Badge>
                              )}
                            </td>
                            <td className={`${tdNumClass} font-medium`} data-label="Total">
                              <span className={voided ? "line-through" : ""}>
                                {formatPKR(totalPaisa)}
                              </span>
                            </td>
                            <td className={`${tdClass} text-right`} data-label="Actions">
                              <RowMenu>
                                <Link href={`/billing/${inv.id}/print`}>Print invoice</Link>
                                <Link href={`/billing/${inv.id}/challan`}>Print challan</Link>
                                {owner && !voided && (
                                  <>
                                    <Link href={`/billing/${inv.id}/edit`}>Edit bill</Link>
                                    <VoidButton invoiceId={inv.id} number={inv.number} />
                                  </>
                                )}
                              </RowMenu>
                            </td>
                          </tr>
                        ))}
                      </GroupRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Pagination
            basePath="/billing"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            params={{ q: sp.q, from: sp.from, to: sp.to, group: sp.group }}
          />
        </>
      )}
    </div>
  );
}
