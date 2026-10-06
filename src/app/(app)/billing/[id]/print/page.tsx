import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { formatPKR } from "@/lib/money";
import { formatQtyUnit } from "@/lib/qty";
import { lineTotal, sumLines } from "@/lib/receivables";
import { getBusinessSettings } from "@/lib/settings";
import { contactLine, dateFieldOf, drawsTextHeader } from "@/lib/letterhead";
import { PrintSheet } from "@/components/print-sheet";
import { PrintButton } from "@/components/print-button";
import { WhatsAppButton } from "@/components/whatsapp-button";

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const settings = await getBusinessSettings();

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { customer: true, items: { include: { product: { include: { color: { select: { name: true } } } } } }, payments: true },
  });
  if (!invoice) notFound();

  const total = sumLines(invoice.items);

  const paid = invoice.payments.reduce((s, p) => s + p.amountPaisa, 0);
  const owing = total - paid;

  const waText = `Assalam-o-Alaikum ${invoice.customer.name}, here is your invoice #${invoice.number} from ${settings.name} for ${formatPKR(total)}${
    owing > 0 ? ` (balance ${formatPKR(owing)})` : ""
  }. JazakAllah.`;

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <a href="/billing" className="text-sm text-ink-muted underline hover:text-ink">
          ← Back to billing
        </a>
        <div className="flex items-center gap-2">
          <WhatsAppButton phone={invoice.customer.phone} text={waText} />
          <PrintButton label="Print / Save as PDF" />
        </div>
      </div>

      <PrintSheet settings={settings} documentDate={invoice.date}>
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
            <p className="text-lg font-semibold">INVOICE</p>
            <p className="text-sm">#{invoice.number}</p>
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

        {/* Bill to */}
        <div className="mt-4 flex justify-between text-sm">
          <div>
            <p className="text-ink-muted">Bill to</p>
            <p className="font-medium">{invoice.customer.name}</p>
            {invoice.customer.phone && (
              <p className="text-ink-muted">{invoice.customer.phone}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-ink-muted">Payment</p>
            {invoice.payments.length === 0 ? (
              <p className="font-medium">UDHAAR</p>
            ) : (
              invoice.payments.map((p) => (
                <p key={p.id} className="font-medium">
                  {p.method} {formatPKR(p.amountPaisa)}
                </p>
              ))
            )}
          </div>
        </div>

        {invoice.status === "VOIDED" && (
          <p className="mt-4 border border-bad/40 bg-bad-soft px-3 py-2 text-center text-sm font-bold tracking-widest text-bad">
            VOIDED{invoice.voidReason ? ` — ${invoice.voidReason}` : ""}
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
            {invoice.items.map((it) => (
              <tr key={it.id} className="border-b border-line">
                <td className="py-2">
                  <span className="font-medium">{it.product?.name ?? it.description}</span>{" "}
                  {it.product && (
                    <span className="text-ink-muted">
                      {[it.product.size, it.product.variant, it.product.color?.name].filter(Boolean).join(" · ")}
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
            {paid > 0 && (
              <div className="flex justify-between text-ink-muted">
                <span>Paid</span>
                <span>{formatPKR(paid)}</span>
              </div>
            )}
            {owing > 0 && (
              <div className="flex justify-between font-semibold text-ink">
                <span>Balance (udhaar)</span>
                <span>{formatPKR(owing)}</span>
              </div>
            )}
          </div>
        </div>

        {invoice.notes && (
          <p className="mt-6 text-xs text-ink-muted">Note: {invoice.notes}</p>
        )}
        <p className="mt-8 text-center text-xs text-ink-faint">
          Thank you for your business.
        </p>
      </PrintSheet>
    </div>
  );
}
