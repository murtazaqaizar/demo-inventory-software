import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { getCustomerBalances, getTotalReceivable } from "@/lib/customers";
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
import { SearchBar, Pagination } from "@/components/list-controls";
import { DeleteButton } from "@/components/delete-button";
import { AddCustomer, CustomerPayment, RestoreCustomer } from "./customer-forms";
import { PermanentDeleteCustomer } from "./permanent-delete";
import { deleteCustomer } from "./actions";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 30;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; show?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const showHidden = sp.show === "hidden";

  const where: Prisma.CustomerWhereInput = { isCashCustomer: false, active: !showHidden };
  if (sp.q) {
    where.OR = [
      { name: { contains: sp.q, mode: "insensitive" } },
      { phone: { contains: sp.q, mode: "insensitive" } },
    ];
  }

  const [customers, total, hiddenCount, totalReceivable] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.customer.count({ where }),
    prisma.customer.count({ where: { isCashCustomer: false, active: false } }),
    // Footer total is one scalar from Postgres, not every customer's ledger.
    getTotalReceivable(),
  ]);
  // Balances only for the rows actually rendered on this page.
  const balances = await getCustomerBalances(customers.map((c) => c.id));

  return (
    <div>
      <PageHeader
        title="Customers (Udhaar)"
        description="Running balance per customer. Record lump-sum payments and open statements."
        action={
          (hiddenCount > 0 || showHidden) && (
            <Link
              href={showHidden ? "/customers" : "/customers?show=hidden"}
              className="text-[15px] font-medium text-accent hover:underline"
            >
              {showHidden ? "← Back to active customers" : `Show hidden (${hiddenCount})`}
            </Link>
          )
        }
      />

      <div className="mb-6">
        <AddCustomer canSetOpening={user.role === "OWNER"} />
      </div>

      {showHidden && (
        <p className="mb-4 max-w-[72ch] text-[15px] text-ink-muted">
          These customers were hidden (they had bills). Their history is intact. Restore any
          of them below.
        </p>
      )}

      <Panel>
        <SearchBar action="/customers" q={sp.q} placeholder="Search by name or phone" />

        {customers.length === 0 ? (
          <EmptyState>
            {showHidden
              ? "No hidden customers."
              : sp.q
                ? "No customers match that search."
                : "No customers yet. Add one to start billing on udhaar."}
          </EmptyState>
        ) : (
          <div className="tablewrap">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Customer</th>
                  <th className={thClass}>Phone</th>
                  <th className={thNumClass}>Balance (owes)</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Record payment</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const bal = balances.get(c.id) ?? 0;
                  const overLimit = c.creditLimitPaisa > 0 && bal > c.creditLimitPaisa;
                  return (
                    <tr key={c.id} className={rowClass}>
                      <td className={`${tdClass} font-medium text-ink`} data-label="Customer">
                        <Link href={`/customers/${c.id}`} className="hover:text-accent hover:underline">
                          {c.name}
                        </Link>
                        {overLimit && (
                          <span className="ml-2">
                            <Badge tone="red">Over limit</Badge>
                          </span>
                        )}
                      </td>
                      <td
                        className={`${tdClass} font-mono text-ink-muted`}
                        data-label="Phone"
                      >
                        {c.phone ?? "—"}
                      </td>
                      {/* The figure is the column, not the pill — a column of
                          pills cannot be compared down the page. */}
                      <td className={tdNumClass} data-label="Balance">
                        <span className={bal > 0 ? "font-semibold text-ink" : "text-ink-muted"}>
                          {bal === 0 ? "—" : formatPKR(Math.abs(bal))}
                        </span>
                        {c.creditLimitPaisa > 0 && (
                          <span className="block text-[13px] text-ink-muted">
                            limit {formatPKR(c.creditLimitPaisa)}
                          </span>
                        )}
                      </td>
                      <td className={tdClass} data-label="Status">
                        {bal > 0 ? (
                          <Badge tone="amber">Owing</Badge>
                        ) : bal < 0 ? (
                          <Badge tone="green">In credit</Badge>
                        ) : (
                          <Badge tone="green">Settled</Badge>
                        )}
                      </td>
                      <td className={tdClass} data-label="Payment">
                        <CustomerPayment customerId={c.id} />
                      </td>
                      <td className={`${tdClass} text-right`} data-label="Actions">
                        <RowMenu>
                          <Link href={`/customers/${c.id}`}>Open ledger</Link>
                          {showHidden ? (
                            user.role === "OWNER" && (
                              <>
                                <RestoreCustomer customerId={c.id} />
                                <PermanentDeleteCustomer
                                  customerId={c.id}
                                  customerName={c.name}
                                  compact
                                />
                              </>
                            )
                          ) : (
                            <>
                              <Link href={`/customers/${c.id}/edit`}>Edit customer</Link>
                              {user.role === "OWNER" && (
                                <DeleteButton
                                  action={deleteCustomer}
                                  hidden={{ customerId: c.id }}
                                  label="Delete / hide"
                                />
                              )}
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
                    Total receivable
                  </td>
                  <td
                    className="border-t border-line-strong bg-surface-alt px-4 py-3 font-mono font-semibold text-ink" data-label="Total receivable"
                    colSpan={4}
                  >
                    {formatPKR(totalReceivable)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      <Pagination
        basePath="/customers"
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        params={{ q: sp.q, show: sp.show }}
      />
    </div>
  );
}
