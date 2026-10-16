import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { dayEnd, dayStart } from "@/lib/dates";
import { formatPKR } from "@/lib/money";
import { sumLines } from "@/lib/receivables";
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
import { RejectButton } from "./reject-button";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 25;

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; page?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.QuotationWhereInput = {};
  if (sp.q) {
    // "Q-12", "q12" and "12" all find quotation 12.
    const asNumber = parseInt(sp.q.replace(/^q-?/i, ""), 10);
    where.OR = [
      { customer: { name: { contains: sp.q, mode: "insensitive" } } },
      ...(isNaN(asNumber) ? [] : [{ number: asNumber }]),
    ];
  }
  if (sp.from || sp.to) {
    where.date = {};
    if (sp.from) where.date.gte = dayStart(sp.from);
    if (sp.to) where.date.lte = dayEnd(sp.to);
  }

  const [quotes, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      orderBy: [{ date: "desc" }, { number: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customer: true, items: true, invoice: { select: { id: true, number: true } } },
    }),
    prisma.quotation.count({ where }),
  ]);

  const search = (
    <SearchBar action="/quotations" q={sp.q} from={sp.from} to={sp.to} withDates placeholder="Customer name or Q-number" />
  );

  return (
    <div>
      <PageHeader
        title="Quotations"
        description="Price offers. Nothing leaves stock until a quotation is accepted and made into a bill."
        action={
          <Link href="/quotations/new">
            <Button>+ New quotation</Button>
          </Link>
        }
      />

      {quotes.length === 0 ? (
        <Panel>
          {search}
          <EmptyState>{sp.q || sp.from || sp.to ? "No quotations match. Try clearing the search." : "No quotations yet."}</EmptyState>
        </Panel>
      ) : (
        <>
          <Panel>
            {search}
            <div className="tablewrap">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Quotation</th>
                    <th className={thClass}>Date</th>
                    <th className={thClass}>Customer</th>
                    <th className={thClass}>Status</th>
                    <th className={thNumClass}>Total</th>
                    <th className={thClass} />
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr key={q.id} className={`${rowClass} ${q.status === "REJECTED" ? "opacity-55" : ""}`}>
                      <td className={`${tdClass} font-mono`} data-label="Quotation">
                        Q-{q.number}
                      </td>
                      <td className={`${tdClass} font-mono text-ink-muted`} data-label="Date">
                        {q.date.toLocaleDateString("en-PK")}
                      </td>
                      <td className={tdClass} data-label="Customer">
                        {q.customer.isCashCustomer ? "Cash Sale (walk-in)" : q.customer.name}
                      </td>
                      <td className={tdClass} data-label="Status">
                        {q.status === "OPEN" ? (
                          <Badge tone="amber">Open</Badge>
                        ) : q.status === "ACCEPTED" ? (
                          <Badge tone="green">Accepted{q.invoice ? ` — bill #${q.invoice.number}` : ""}</Badge>
                        ) : (
                          <Badge tone="red">Rejected</Badge>
                        )}
                      </td>
                      <td className={`${tdNumClass} font-medium`} data-label="Total">
                        {formatPKR(sumLines(q.items))}
                      </td>
                      <td className={`${tdClass} text-right`} data-label="Actions">
                        <RowMenu>
                          <Link href={`/quotations/${q.id}/print`}>Print quotation</Link>
                          {q.status === "OPEN" && (
                            <>
                              <Link href={`/quotations/${q.id}/convert`}>Accept — make bill</Link>
                              <Link href={`/quotations/${q.id}/edit`}>Edit quotation</Link>
                              <RejectButton quotationId={q.id} />
                            </>
                          )}
                          {q.status === "ACCEPTED" && q.invoice && (
                            <Link href={`/billing/${q.invoice.id}/print`}>Open bill #{q.invoice.number}</Link>
                          )}
                          {q.status === "REJECTED" && <RejectButton quotationId={q.id} reopen />}
                        </RowMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Pagination
            basePath="/quotations"
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
