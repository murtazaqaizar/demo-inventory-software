import Link from "next/link";
import { requireOwnerPage } from "@/lib/guards";
import { getAging } from "@/lib/receivables";
import { formatPKR } from "@/lib/money";
import {
  Badge,
  EmptyState,
  Panel,
  PageHeader,
  Rail,
  RailBlock,
  RailStat,
  rowClass,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";

export default async function AgingPage() {
  await requireOwnerPage();
  const rows = await getAging();

  const totals = rows.reduce(
    (t, r) => ({
      current: t.current + r.current,
      d30: t.d30 + r.d30,
      d60: t.d60 + r.d60,
      d90: t.d90 + r.d90,
      total: t.total + r.total,
    }),
    { current: 0, d30: 0, d60: 0, d90: 0, total: 0 },
  );
  const overLimit = rows.filter((r) => r.overLimit);
  const overdue = totals.d30 + totals.d60 + totals.d90;

  return (
    <div>
      <PageHeader
        title="Who owes me"
        description="Outstanding udhaar broken down by how old it is. Chase the right-hand columns first."
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {/* Urgent items belong in the working panel, not the rail. */}
          {overLimit.length > 0 && (
            <div className="mb-4 rounded-panel border border-bad/30 bg-bad-soft p-5">
              <p className="text-[15px] font-semibold text-bad">
                {overLimit.length} customer{overLimit.length > 1 ? "s are" : " is"} over
                their credit limit
              </p>
              <p className="mt-1 text-[15px] text-ink">
                {overLimit.map((r) => r.name).join(", ")}
              </p>
            </div>
          )}
          <Panel>
            {rows.length === 0 ? (
              <EmptyState>Nobody owes you anything right now.</EmptyState>
            ) : (
              <div className="tablewrap">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Customer</th>
                      <th className={thNumClass}>0–30</th>
                      <th className={thNumClass}>31–60</th>
                      <th className={thNumClass}>61–90</th>
                      <th className={thNumClass}>90+</th>
                      <th className={thNumClass}>Total</th>
                      <th className={thClass}>Oldest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.customerId} className={rowClass}>
                        <td
                          className={`${tdClass} font-medium text-ink`}
                          data-label="Customer"
                        >
                          <Link
                            href={`/customers/${r.customerId}`}
                            className="hover:text-accent hover:underline"
                          >
                            {r.name}
                          </Link>
                          {r.overLimit && (
                            <span className="ml-2">
                              <Badge tone="red">Over limit</Badge>
                            </span>
                          )}
                        </td>
                        <td className={tdNumClass} data-label="0–30">
                          {r.current ? formatPKR(r.current) : "—"}
                        </td>
                        <td className={`${tdNumClass} text-warn`} data-label="31–60">
                          {r.d30 ? formatPKR(r.d30) : "—"}
                        </td>
                        <td className={`${tdNumClass} text-warn`} data-label="61–90">
                          {r.d60 ? formatPKR(r.d60) : "—"}
                        </td>
                        <td
                          className={`${tdNumClass} font-medium text-bad`}
                          data-label="90+"
                        >
                          {r.d90 ? formatPKR(r.d90) : "—"}
                        </td>
                        <td
                          className={`${tdNumClass} font-semibold text-ink`}
                          data-label="Total"
                        >
                          {formatPKR(r.total)}
                        </td>
                        <td
                          className={`${tdClass} font-mono text-ink-muted`}
                          data-label="Oldest"
                        >
                          {r.oldestDays === null
                            ? "—"
                            : r.oldestDays >= 999
                              ? "opening"
                              : `${r.oldestDays} days`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <Rail>
          <RailBlock title="Outstanding">
            <RailStat
              label="Total owed"
              value={formatPKR(totals.total)}
              note={overdue > 0 ? `${formatPKR(overdue)} over 30 days` : "nothing overdue"}
              tone={overdue > 0 ? "warn" : "good"}
            />
          </RailBlock>

          <RailBlock title="By age">
            <RailStat label="0–30 days" value={formatPKR(totals.current)} />
            <RailStat label="31–60 days" value={formatPKR(totals.d30)} tone="warn" />
            <RailStat label="61–90 days" value={formatPKR(totals.d60)} tone="warn" />
            <RailStat label="Over 90 days" value={formatPKR(totals.d90)} tone="bad" />
          </RailBlock>

        </Rail>
      </div>
    </div>
  );
}
