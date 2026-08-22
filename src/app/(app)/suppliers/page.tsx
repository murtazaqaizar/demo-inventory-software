import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOwnerPage } from "@/lib/guards";
import { getSupplierBalances } from "@/lib/suppliers";
import { formatPKR } from "@/lib/money";
import {
  Badge,
  EmptyState,
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
import { AddSupplier, RestoreSupplier, SupplierPayment } from "./supplier-forms";
import { deleteSupplier } from "./actions";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await requireOwnerPage(); // money side — OWNER only

  const sp = await searchParams;
  const showHidden = sp.show === "hidden";

  const [suppliers, hiddenCount] = await Promise.all([
    prisma.supplier.findMany({ where: { active: !showHidden }, orderBy: { name: "asc" } }),
    prisma.supplier.count({ where: { active: false } }),
  ]);
  const balances = await getSupplierBalances();
  const totalPayable = suppliers.reduce((s, sup) => s + (balances.get(sup.id) ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Suppliers (Payables)"
        description="What you owe each local credit supplier. Payments reduce the balance."
        action={
          (hiddenCount > 0 || showHidden) && (
            <Link
              href={showHidden ? "/suppliers" : "/suppliers?show=hidden"}
              className="text-[15px] font-medium text-accent hover:underline"
            >
              {showHidden ? "← Back to active suppliers" : `Show hidden (${hiddenCount})`}
            </Link>
          )
        }
      />

      <div className="mb-6">
        <AddSupplier />
      </div>

      {showHidden && (
        <p className="mb-4 max-w-[72ch] text-[15px] text-ink-muted">
          These suppliers were hidden (they had purchases or payments). Their history is
          intact. Restore any of them below.
        </p>
      )}

      <Panel>
        {suppliers.length === 0 ? (
          <EmptyState>{showHidden ? "No hidden suppliers." : "No suppliers yet."}</EmptyState>
        ) : (
          <div className="tablewrap">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Supplier</th>
                  <th className={thClass}>Phone</th>
                  <th className={thNumClass}>Payable</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Record payment</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => {
                  const bal = balances.get(s.id) ?? 0;
                  return (
                    <tr key={s.id} className={rowClass}>
                      <td className={`${tdClass} font-medium text-ink`} data-label="Supplier">
                        {s.name}
                      </td>
                      <td className={`${tdClass} font-mono text-ink-muted`} data-label="Phone">
                        {s.phone ?? "—"}
                      </td>
                      <td className={tdNumClass} data-label="Payable">
                        <span className={bal > 0 ? "font-semibold text-ink" : "text-ink-muted"}>
                          {bal > 0 ? formatPKR(bal) : "—"}
                        </span>
                      </td>
                      <td className={tdClass} data-label="Status">
                        {bal > 0 ? <Badge tone="amber">Payable</Badge> : <Badge tone="green">Settled</Badge>}
                      </td>
                      <td className={tdClass} data-label="Payment">
                        {showHidden ? "—" : <SupplierPayment supplierId={s.id} />}
                      </td>
                      <td className={`${tdClass} text-right`} data-label="Actions">
                        <RowMenu>
                          {showHidden ? (
                            <RestoreSupplier supplierId={s.id} />
                          ) : (
                            <>
                              <Link href={`/suppliers/${s.id}/edit`}>Edit supplier</Link>
                              <DeleteButton
                                action={deleteSupplier}
                                hidden={{ supplierId: s.id }}
                                label="Delete / hide"
                              />
                            </>
                          )}
                        </RowMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td
                    className="border-t border-line-strong bg-surface-alt px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted"
                    colSpan={2}
                  >
                    Total payable
                  </td>
                  <td
                    className="border-t border-line-strong bg-surface-alt px-4 py-3 font-mono font-semibold text-ink" data-label="Total payable"
                    colSpan={4}
                  >
                    {formatPKR(totalPayable)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
