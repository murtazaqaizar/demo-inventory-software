import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { formatPKR } from "@/lib/money";
import { sumLines } from "@/lib/receivables";
import { poLabel } from "@/lib/purchase-orders";
import {
  Badge,
  Button,
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
import { StatusButton } from "./status-button";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 25;

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; page?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.PurchaseOrderWhereInput = {};
  if (sp.q) {
    // "PO-12", "po12" and "12" all find purchase order 12.
    const asNumber = parseInt(sp.q.replace(/^po-?/i, ""), 10);
    where.OR = [
      { vendorName: { contains: sp.q, mode: "insensitive" } },
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

  const [orders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: [{ date: "desc" }, { number: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { items: true },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  const search = (
    <SearchBar action="/purchase-orders" q={sp.q} from={sp.from} to={sp.to} withDates placeholder="Party name or PO-number" />
  );

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="Slips you give a vendor for what you are buying from them. A record only — stock and accounts are not changed."
        action={
          <Link href="/purchase-orders/new">
            <Button>+ New purchase order</Button>
          </Link>
        }
      />

      {orders.length === 0 ? (
        <Panel>
          {search}
          <EmptyState>{sp.q || sp.from || sp.to ? "No purchase orders match. Try clearing the search." : "No purchase orders yet."}</EmptyState>
        </Panel>
      ) : (
        <>
          <Panel>
            {search}
            <div className="tablewrap">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>PO</th>
                    <th className={thClass}>Date</th>
                    <th className={thClass}>Party</th>
                    <th className={thClass}>Status</th>
                    <th className={thNumClass}>Total</th>
                    <th className={thClass} />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((po) => (
                    <tr key={po.id} className={`${rowClass} ${po.status === "CANCELLED" ? "opacity-55" : ""}`}>
                      <td className={`${tdClass} font-mono`} data-label="PO">
                        {poLabel(po.number)}
                      </td>
                      <td className={`${tdClass} font-mono text-ink-muted`} data-label="Date">
                        {po.date.toLocaleDateString("en-PK")}
                      </td>
                      <td className={tdClass} data-label="Party">
                        {po.vendorName}
                      </td>
                      <td className={tdClass} data-label="Status">
                        {po.status === "OPEN" ? (
                          <Badge tone="amber">Open</Badge>
                        ) : po.status === "RECEIVED" ? (
                          <Badge tone="green">Received</Badge>
                        ) : (
                          <Badge tone="red">Cancelled</Badge>
                        )}
                      </td>
                      <td className={`${tdNumClass} font-medium`} data-label="Total">
                        {formatPKR(sumLines(po.items))}
                      </td>
                      <td className={`${tdClass} text-right`} data-label="Actions">
                        <RowMenu>
                          <Link href={`/purchase-orders/${po.id}/print`}>Print purchase order</Link>
                          {po.status === "OPEN" ? (
                            <>
                              <Link href={`/purchase-orders/${po.id}/edit`}>Edit purchase order</Link>
                              <StatusButton id={po.id} to="RECEIVED" />
                              <StatusButton id={po.id} to="CANCELLED" />
                            </>
                          ) : (
                            <StatusButton id={po.id} to="OPEN" />
                          )}
                        </RowMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Pagination
            basePath="/purchase-orders"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            params={{ q: sp.q, from: sp.from, to: sp.to }}
          />
        </>
      )}
    </div>
  );
}
