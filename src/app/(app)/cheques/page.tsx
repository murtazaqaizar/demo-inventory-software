import { prisma } from "@/lib/prisma";
import { requireOwnerPage } from "@/lib/guards";
import { formatPKR } from "@/lib/money";
import {
  Badge,
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
import { AddCheque, ChequeStatusButtons } from "./cheque-forms";

const statusTone = { PENDING: "amber", CLEARED: "green", BOUNCED: "red" } as const;
const statusLabel = { PENDING: "Pending", CLEARED: "Cleared", BOUNCED: "Bounced" } as const;

export default async function ChequesPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  await requireOwnerPage();

  const sp = await searchParams;
  const group = sp.group === "month" ? "month" : "status";

  const cheques = await prisma.cheque.findMany({
    orderBy:
      group === "month"
        ? { chequeDate: "desc" }
        : [{ status: "asc" }, { chequeDate: "desc" }],
  });

  const rows = cheques.map((c) => ({
    c,
    key:
      group === "month"
        ? c.chequeDate.toLocaleDateString("en-PK", { month: "long", year: "numeric" })
        : statusLabel[c.status],
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
        title="Cheques"
        description="Track every cheque — received and issued — through pending → cleared / bounced. Clearing a cheque moves money in/out of the bank."
      />

      <div className="mb-6">
        <AddCheque />
      </div>

      {cheques.length === 0 ? (
        <Panel>
          <EmptyState>No cheques recorded yet.</EmptyState>
        </Panel>
      ) : (
        <Panel>
          <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-4 md:px-6">
            <GroupBySwitch
              basePath="/cheques"
              current={group}
              options={[
                { value: "status", label: "Status" },
                { value: "month", label: "Month" },
              ]}
            />
          </div>

          <div className="tablewrap">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Cheque #</th>
                  <th className={thClass}>Bank</th>
                  <th className={thClass}>Party</th>
                  <th className={thClass}>{group === "month" ? "Status" : "Date"}</th>
                  <th className={thNumClass}>Amount</th>
                  <th className={thClass}>Action</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const sum = g.items.reduce((s, r) => s + r.c.amountPaisa, 0);
                  return (
                    <GroupRow
                      key={g.key}
                      label={g.key}
                      labelSpan={4}
                      aggregateSpan={3}
                      aggregate={
                        <>
                          {g.items.length} cheque{g.items.length > 1 ? "s" : ""} ·{" "}
                          {formatPKR(sum)}
                        </>
                      }
                    >
                      {g.items.map(({ c }) => (
                        <tr key={c.id} className={rowClass}>
                          <td className={tdClass} data-label="Type">
                            <Badge tone="neutral">
                              {c.direction === "RECEIVED" ? "In" : "Out"}
                            </Badge>
                          </td>
                          <td className={`${tdClass} font-mono`} data-label="Cheque #">
                            {c.number}
                          </td>
                          <td className={tdClass} data-label="Bank">
                            {c.bank}
                          </td>
                          <td className={`${tdClass} text-ink-muted`} data-label="Party">
                            {c.partyName ?? "—"}
                          </td>
                          {/* Never repeat the grouping key in a column. */}
                          <td
                            className={`${tdClass} ${group === "month" ? "" : "font-mono text-ink-muted"}`}
                            data-label={group === "month" ? "Status" : "Date"}
                          >
                            {group === "month" ? (
                              <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>
                            ) : (
                              c.chequeDate.toLocaleDateString("en-PK")
                            )}
                          </td>
                          <td className={`${tdNumClass} font-medium`} data-label="Amount">
                            {formatPKR(c.amountPaisa)}
                          </td>
                          <td className={tdClass} data-label="Action">
                            {c.status === "PENDING" ? (
                              <ChequeStatusButtons chequeId={c.id} direction={c.direction} />
                            ) : (
                              <span className="text-ink-faint">—</span>
                            )}
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
