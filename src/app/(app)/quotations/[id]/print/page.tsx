import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { formatPKR } from "@/lib/money";
import { formatQtyUnit } from "@/lib/qty";
import { lineTotal, sumLines } from "@/lib/receivables";
import { docTitle } from "@/lib/doc-title";
import { getBusinessSettings } from "@/lib/settings";
import { contactLine, dateFieldOf, drawsTextHeader } from "@/lib/letterhead";
import { PrintSheet } from "@/components/print-sheet";
import { PrintButton } from "@/components/print-button";
import { WhatsAppButton } from "@/components/whatsapp-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await prisma.quotation.findUnique({ where: { id }, select: { number: true, customer: true } });
  return docTitle("Quotation", `Q-${q?.number ?? ""}`, q?.customer);
}

export default async function QuotationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const settings = await getBusinessSettings();

  const quote = await prisma.quotation.findUnique({
    where: { id },
    include: {
      customer: true,
      items: { include: { product: true, color: { select: { name: true } } } },
      invoice: { select: { number: true } },
      payments: true,
    },
  });
  if (!quote) notFound();

  const total = sumLines(quote.items);
  // Terms only — what will be paid on order. The rest is shown as going on udhaar.
  const payNow = quote.payments.reduce((s, p) => s + p.amountPaisa, 0);
  const onCredit = total - payNow;
  const waText = `Assalam-o-Alaikum ${quote.customer.name}, here is our quotation Q-${quote.number} from ${settings.name} for ${formatPKR(total)}. JazakAllah.`;

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <a href="/quotations" className="text-sm text-ink-muted underline hover:text-ink">
          ← Back to quotations
        </a>
        <div className="flex items-center gap-2">
          {quote.status === "OPEN" && (
            <a href={`/quotations/${quote.id}/convert`} className="text-sm font-medium text-ink underline">
              Accept — make bill
            </a>
          )}
          <WhatsAppButton phone={quote.customer.phone} text={waText} />
          <PrintButton label="Print / Save as PDF" />
        </div>
      </div>

      <PrintSheet settings={settings} documentDate={quote.date}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-line-strong pb-4">
          {drawsTextHeader(settings) ? (
            <div>
              <h1 className="text-xl font-bold">{settings.name}</h1>
              <p className="text-xs text-ink-muted">{settings.tagline}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {contactLine(settings)}
              </p>
            </div>
          ) : (
            // The letterhead already carries the shop name; printing it
            // twice looks like a mistake. The spacer keeps the layout.
            <div />
          )}
          <div className="text-right">
            <p className="text-lg font-semibold">QUOTATION</p>
            <p className="text-sm">Q-{quote.number}</p>
            {/* The letterhead has its own Date rule; printing a second date
                here would just contradict it. */}
            {!dateFieldOf(settings) && (
              <p className="text-xs text-ink-muted">
                {quote.date.toLocaleDateString("en-PK", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
        </div>

        {/* Quotation for */}
        <div className="mt-4 flex justify-between text-sm">
          <div>
            <p className="text-ink-muted">Quotation for</p>
            <p className="font-medium">{quote.customer.isCashCustomer ? "Walk-in customer" : quote.customer.name}</p>
            {quote.customer.phone && <p className="text-ink-muted">{quote.customer.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-ink-muted">Payment</p>
            {quote.payments.length === 0 ? (
              <p className="font-medium">UDHAAR</p>
            ) : (
              quote.payments.map((p) => (
                <p key={p.id} className="font-medium">
                  {p.method} {formatPKR(p.amountPaisa)}
                </p>
              ))
            )}
          </div>
        </div>

        {quote.status !== "OPEN" && (
          // Screen only: the owner sees where it stands; a reprint for the
          // customer stays a clean quotation.
          <p className="no-print mt-4 border border-line-strong px-3 py-2 text-center text-sm font-semibold">
            {quote.status === "ACCEPTED" ? `Accepted — bill #${quote.invoice?.number}` : "Rejected"}
          </p>
        )}

        {/* Items */}
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-ink-muted">
              <th className="py-2">Item</th>
              <th className="py-2 text-right font-mono">Qty</th>
              <th className="py-2 text-right font-mono">Rate</th>
              <th className="py-2 text-right font-mono">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((it) => (
              <tr key={it.id} className="border-b border-line">
                <td className="py-2">
                  <span className="font-medium">{it.product?.name ?? it.description}</span>{" "}
                  {it.product && (
                    <span className="text-ink-muted">
                      {[it.product.size, it.product.variant, it.color?.name].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {it.isSample && (
                    <span className="ml-1 text-xs font-medium text-ok">(free sample)</span>
                  )}
                </td>
                <td className="py-2 text-right font-mono">
                  {formatQtyUnit(it.qtyMilli, it.unit)}
                </td>
                <td className="py-2 text-right font-mono">
                  {it.isSample ? "—" : formatPKR(it.ratePaisa)}
                </td>
                <td className="py-2 text-right font-mono">
                  {it.isSample ? "Free" : formatPKR(lineTotal(it))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between border-t border-line-strong pt-2 text-base font-semibold">
              <span>Total</span>
              <span>{formatPKR(total)}</span>
            </div>
            {payNow > 0 && (
              <div className="flex justify-between text-ink-muted">
                <span>Payment on order</span>
                <span>{formatPKR(payNow)}</span>
              </div>
            )}
            {onCredit > 0 && (
              <div className="flex justify-between font-semibold text-ink">
                <span>Balance (udhaar)</span>
                <span>{formatPKR(onCredit)}</span>
              </div>
            )}
          </div>
        </div>

        {quote.notes && <p className="mt-6 text-xs text-ink-muted">Note: {quote.notes}</p>}
        <p className="mt-8 text-center text-xs text-ink-faint">
          This is a quotation, not a bill. Prices are subject to stock at the time of order.
        </p>
      </PrintSheet>
    </div>
  );
}
