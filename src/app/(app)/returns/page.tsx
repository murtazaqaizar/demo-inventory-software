import Link from "next/link";
import { sumLines } from "@/lib/receivables";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { formatPKR } from "@/lib/money";
import {
  Badge,
  Button,
  EmptyState,
  GroupBySwitch,
  GroupRow,
  Panel,
  PageHeader,
  rowClass,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  await requireUser();

  const sp = await searchParams;
  const group = sp.group === "cust" ? "cust" : "date";

  const notes = await prisma.creditNote.findMany({
    orderBy:
      group === "cust"
        ? [{ customer: { name: "asc" } }, { date: "desc" }]
        : { date: "desc" },
    take: 50,
    include: { customer: true, items: true },
  });

  const rows = notes.map((n) => ({
    n,
    total: sumLines(n.items),
    key: group === "cust" ? n.customer.name : n.date.toLocaleDateString("en-PK"),
  }));

  const groups = rows.reduce<{ key: string; items: typeof rows }[]>((acc, r) => {
    const last = acc[acc.length - 1];
    if (last && last.key === r.key) last.items.push(r);
    else acc.push({ key: r.key, items: [r] });
    return acc;
  }, []);

  return (
    <div>
      <PageHeader
        title="Returns"
        description="Goods coming back. Stock is restored and the customer is credited (or refunded in cash)."
        action={
          <Link href="/returns/new">
            <Button>+ New return</Button>
          </Link>
        }
      />

      {notes.length === 0 ? (
        <Panel>
          <EmptyState>No returns recorded yet.</EmptyState>
        </Panel>
      ) : (
        <Panel>
          <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-4 md:px-6">
            <GroupBySwitch
              basePath="/returns"
              current={group}
              options={[
                { value: "date", label: "Date" },
                { value: "cust", label: "Customer" },
              ]}
            />
          </div>

          <div className="tablewrap">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>#</th>
                  <th className={thClass}>{group === "cust" ? "Date" : "Customer"}</th>
                  <th className={thClass}>Settled as</th>
                  <th className={thClass}>Reason</th>
                  <th className={thNumClass}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const sum = g.items.reduce((s, r) => s + r.total, 0);
                  return (
                    <GroupRow
                      key={g.key}
                      label={g.key}
                      labelSpan={2}
                      aggregateSpan={3}
                      aggregate={
                        <>
                          {g.items.length} return{g.items.length > 1 ? "s" : ""} ·{" "}
                          {formatPKR(sum)}
                        </>
                      }
                    >
                      {g.items.map(({ n, total }) => (
                        <tr key={n.id} className={rowClass}>
                          <td className={`${tdClass} font-mono`} data-label="Return">
                            #{n.number}
                          </td>
                          <td
                            className={tdClass}
                            data-label={group === "cust" ? "Date" : "Customer"}
                          >
                            {group === "cust" ? (
                              <span className="font-mono text-ink-muted">
                                {n.date.toLocaleDateString("en-PK")}
                              </span>
                            ) : (
                              n.customer.name
                            )}
                          </td>
                          <td className={tdClass} data-label="Settled as">
                            <Badge
                              tone="neutral"
                            >
                              {n.refundMethod === "CASH_REFUND"
                                ? "Cash refund"
                                : "Account credit"}
                            </Badge>
                          </td>
                          <td className={`${tdClass} text-ink-muted`} data-label="Reason">
                            {n.reason ?? "—"}
                          </td>
                          <td className={`${tdNumClass} font-medium`} data-label="Credit">
                            {formatPKR(total)}
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
      )}
    </div>
  );
}
