import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { getBusinessSettings } from "@/lib/settings";
import { formatQtyTotals, formatQtyUnit } from "@/lib/qty";
import { contactLine, dateFieldOf, drawsTextHeader } from "@/lib/letterhead";
import { PrintSheet } from "@/components/print-sheet";
import { PrintButton } from "@/components/print-button";

// Delivery challan / gate pass (spec feature 17): goods leaving the premises, no prices.
export default async function ChallanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const settings = await getBusinessSettings();

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { customer: true, items: { include: { product: { include: { color: { select: { name: true } } } } } } },
  });
  if (!invoice) notFound();

  const totalQty = formatQtyTotals(invoice.items);

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <a href="/billing" className="text-sm text-ink-muted underline hover:text-ink">
          ← Back to billing
        </a>
        <PrintButton label="Print challan" />
      </div>

      <PrintSheet settings={settings} documentDate={invoice.date}>
        <div className="flex items-start justify-between border-b border-line-strong pb-4">
          {drawsTextHeader(settings) ? (
            <div>
              <h1 className="text-xl font-bold">{settings.name}</h1>
              <p className="text-xs text-ink-muted">{contactLine(settings)}</p>
            </div>
          ) : (
            // The letterhead already carries the shop name; printing it
            // twice looks like a mistake. The spacer keeps the layout.
            <div />
          )}
          <div className="text-right">
            <p className="text-lg font-semibold">DELIVERY CHALLAN</p>
            <p className="text-sm">Ref #{invoice.number}</p>
            {/* The letterhead has its own Date rule; printing a second date
                here would just contradict it. */}
            {!dateFieldOf(settings) && (
              <p className="text-xs text-ink-muted">
                {invoice.date.toLocaleDateString("en-PK", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 text-sm">
          <p className="text-ink-muted">Deliver to</p>
          <p className="font-medium">{invoice.customer.name}</p>
          {invoice.customer.phone && <p className="text-ink-muted">{invoice.customer.phone}</p>}
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-ink-muted">
              <th className="py-2">Item</th>
              <th className="py-2 text-right font-mono">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it) => (
              <tr key={it.id} className="border-b border-line">
                <td className="py-2">
                  <span className="font-medium">{it.product?.name ?? it.description}</span>{" "}
                  {it.product && (
                    <span className="text-ink-muted">
                      {[it.product.size, it.product.variant, it.product.color?.name].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right font-mono">
                  {formatQtyUnit(it.qtyMilli, it.unit)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong font-semibold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right font-mono">{totalQty}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-16 flex justify-between text-xs text-ink-muted">
          <div className="border-t border-line-strong pt-1">Received by (sign)</div>
          <div className="border-t border-line-strong pt-1">Authorised by</div>
        </div>
      </PrintSheet>
    </div>
  );
}
