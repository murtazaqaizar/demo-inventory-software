import { prisma } from "@/lib/prisma";
import { requireOwnerPage } from "@/lib/guards";
import { formatPKR } from "@/lib/money";
import {
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
import { ExpenseForm } from "./expense-form";
import { getExpenseHeads } from "@/lib/expense-heads";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  await requireOwnerPage();

  const sp = await searchParams;
  const group = sp.group === "cat" ? "cat" : "month";

  const heads = await getExpenseHeads();

  const expenses = await prisma.expense.findMany({
    orderBy:
      group === "cat" ? [{ category: "asc" }, { date: "desc" }] : { date: "desc" },
    take: 100,
  });
  const total = expenses.reduce((s, e) => s + e.amountPaisa, 0);

  const rows = expenses.map((e) => ({
    e,
    key:
      group === "cat"
        ? e.category
        : e.date.toLocaleDateString("en-PK", { month: "long", year: "numeric" }),
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
        title="Expenses"
        description="Running costs — electricity, water, labour, transport, salaries — so profit reflects the full cost of the business."
      />

      <div className="mb-6">
        <ExpenseForm heads={heads} />
      </div>

      {expenses.length === 0 ? (
        <Panel>
          <EmptyState>No expenses recorded yet.</EmptyState>
        </Panel>
      ) : (
        <Panel>
          <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-4 md:px-6">
            <GroupBySwitch
              basePath="/expenses"
              current={group}
              options={[
                { value: "month", label: "Month" },
                { value: "cat", label: "Category" },
              ]}
            />
          </div>

          <div className="tablewrap">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>{group === "cat" ? "Date" : "Category"}</th>
                  <th className={thClass}>Note</th>
                  <th className={thNumClass}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const sum = g.items.reduce((s, r) => s + r.e.amountPaisa, 0);
                  return (
                    <GroupRow
                      key={g.key}
                      label={g.key}
                      labelSpan={1}
                      aggregateSpan={2}
                      aggregate={
                        <>
                          {g.items.length} item{g.items.length > 1 ? "s" : ""} ·{" "}
                          {formatPKR(sum)}
                        </>
                      }
                    >
                      {g.items.map(({ e }) => (
                        <tr key={e.id} className={rowClass}>
                          {/* Never repeat the grouping key in a column. */}
                          <td
                            className={`${tdClass} ${group === "cat" ? "font-mono text-ink-muted" : "font-medium"}`}
                            data-label={group === "cat" ? "Date" : "Category"}
                          >
                            {group === "cat" ? e.date.toLocaleDateString("en-PK") : e.category}
                          </td>
                          <td className={`${tdClass} text-ink-muted`} data-label="Note">
                            {e.note ?? "—"}
                          </td>
                          <td className={`${tdNumClass} font-medium`} data-label="Amount">
                            {formatPKR(e.amountPaisa)}
                          </td>
                        </tr>
                      ))}
                    </GroupRow>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td
                    className="border-t border-line-strong bg-surface-alt px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted"
                    colSpan={2}
                  >
                    Total (last {expenses.length})
                  </td>
                  <td className="border-t border-line-strong bg-surface-alt px-4 py-3 text-right font-mono font-semibold text-ink">
                    {formatPKR(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
