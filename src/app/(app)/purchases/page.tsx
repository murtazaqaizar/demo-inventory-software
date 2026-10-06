import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOwnerPage } from "@/lib/guards";
import { PRODUCT_UNIT } from "@/lib/products";
import { formatQtyTotals, lineAmount, unitOf } from "@/lib/qty";
import { formatPKR } from "@/lib/money";
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
import { DeleteButton } from "@/components/delete-button";
import { deletePurchase } from "./actions";

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  await requireOwnerPage();

  const sp = await searchParams;
  const group = sp.group === "sup" ? "sup" : "date";

  const purchases = await prisma.purchase.findMany({
    // Clustered by the grouping key so a supplier cannot appear twice.
    orderBy:
      group === "sup"
        ? [{ supplier: { name: "asc" } }, { number: "desc" }]
        : { number: "desc" },
    take: 50,
    // Product names are pulled so each row can say what's actually in it —
    // two purchases from the same supplier on the same day look identical
    // otherwise.
    include: { supplier: true, items: { include: { product: { include: PRODUCT_UNIT } } } },
  });

  const rows = purchases.map((p) => {
    const goods = p.items.reduce((s, it) => s + lineAmount(it.qtyMilli, it.supplierUnitCostPaisa), 0);
    const extras = p.freightPaisa + p.dutyPaisa + p.clearingPaisa + p.transportPaisa;
    return {
      p,
      goods,
      extras,
      key:
        group === "sup"
          ? (p.supplier?.name ?? "Cash purchase")
          : p.date.toLocaleDateString("en-PK"),
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
        title="Purchases"
        description="Received stock with cost. Latest cost feeds the profit calculation."
        action={
          <Link href="/purchases/new">
            <Button>+ New purchase</Button>
          </Link>
        }
      />

      {purchases.length === 0 ? (
        <Panel>
          <EmptyState>No purchases recorded yet.</EmptyState>
        </Panel>
      ) : (
        <Panel>
          <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-4 md:px-6">
            <GroupBySwitch
              basePath="/purchases"
              current={group}
              options={[
                { value: "date", label: "Date" },
                { value: "sup", label: "Supplier" },
              ]}
            />
          </div>

          <div className="tablewrap">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>No.</th>
                  <th className={thClass}>{group === "sup" ? "Date" : "Supplier"}</th>
                  <th className={thClass}>What was received</th>
                  <th className={thNumClass}>Goods value</th>
                  <th className={thNumClass}>Extras</th>
                  <th className={thClass}>Flags</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const sum = g.items.reduce((s, r) => s + r.goods + r.extras, 0);
                  return (
                    <GroupRow
                      key={g.key}
                      label={g.key}
                      labelSpan={3}
                      aggregateSpan={4}
                      aggregate={
                        <>
                          {g.items.length} purchase{g.items.length > 1 ? "s" : ""} ·{" "}
                          {formatPKR(sum)}
                        </>
                      }
                    >
                      {g.items.map(({ p, goods, extras }) => {
                        const [first, ...rest] = p.items;
                        const totalQty = formatQtyTotals(
                          p.items.map((it) => ({ qtyMilli: it.qtyMilli, unit: unitOf(it.product) }))
                        );
                        return (
                          <tr key={p.id} className={rowClass}>
                            <td className={`${tdClass} font-mono`} data-label="No.">
                              <Link
                                href={`/purchases/${p.id}`}
                                className="font-medium hover:text-accent hover:underline"
                              >
                                #{p.number}
                              </Link>
                            </td>
                            <td
                              className={tdClass}
                              data-label={group === "sup" ? "Date" : "Supplier"}
                            >
                              {group === "sup" ? (
                                <span className="font-mono text-ink-muted">
                                  {p.date.toLocaleDateString("en-PK")}
                                </span>
                              ) : (
                                (p.supplier?.name ?? "Cash purchase")
                              )}
                            </td>
                            <td className={tdClass} data-label="What was received">
                              {first ? (
                                <>
                                  <span className="text-ink">
                                    <span className="font-mono text-[13px] text-ink-muted">
                                      {first.product.code}
                                    </span>{" "}
                                    — {first.product.name}
                                  </span>
                                  {rest.length > 0 && (
                                    <span className="text-ink-muted"> +{rest.length} more</span>
                                  )}
                                  <span className="block font-mono text-[13px] text-ink-muted">
                                    {totalQty} in {p.items.length} line
                                    {p.items.length === 1 ? "" : "s"}
                                  </span>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className={tdNumClass} data-label="Goods value">
                              {formatPKR(goods)}
                            </td>
                            <td className={tdNumClass} data-label="Extras">
                              {extras > 0 ? formatPKR(extras) : "—"}
                            </td>
                            <td className={`${tdClass} space-x-1`} data-label="Flags">
                              {p.isImport && <Badge tone="neutral">Import</Badge>}
                              {p.onCredit && <Badge tone="amber">Credit</Badge>}
                            </td>
                            <td className={`${tdClass} text-right`} data-label="Actions">
                              <RowMenu>
                                <Link href={`/purchases/${p.id}`}>View purchase</Link>
                                <Link href={`/purchases/${p.id}/edit`}>Edit purchase</Link>
                                <DeleteButton
                                  action={deletePurchase}
                                  hidden={{ purchaseId: p.id }}
                                />
                              </RowMenu>
                            </td>
                          </tr>
                        );
                      })}
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
