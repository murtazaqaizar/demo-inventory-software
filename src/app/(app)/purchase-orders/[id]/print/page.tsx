import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { formatPKR } from "@/lib/money";
import { formatQtyUnit } from "@/lib/qty";
import { lineTotal, sumLines } from "@/lib/receivables";
import { docTitle } from "@/lib/doc-title";
import { poLabel } from "@/lib/purchase-orders";
import { getBusinessSettings } from "@/lib/settings";
import { dateFieldOf } from "@/lib/letterhead";
import { PrintSheet } from "@/components/print-sheet";
import { PrintButton } from "@/components/print-button";
import { WhatsAppButton } from "@/components/whatsapp-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { number: true, vendorName: true } });
  return docTitle("Purchase Order", po ? poLabel(po.number) : "", po ? { name: po.vendorName } : null);
}

export default async function PurchaseOrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const settings = await getBusinessSettings();

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!po) notFound();

  const label = poLabel(po.number);
  const total = sumLines(po.items);

  const waText = `Assalam-o-Alaikum ${po.vendorContact || po.vendorName}, here is our purchase order ${label} from ${settings.name} for ${formatPKR(total)}. JazakAllah.`;

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <a href="/purchase-orders" className="text-sm text-ink-muted underline hover:text-ink">
          ← Back to purchase orders
        </a>
        <div className="flex items-center gap-2">
          {po.status === "OPEN" && (
            <a href={`/purchase-orders/${po.id}/edit`} className="text-sm font-medium text-ink underline">
              Edit
            </a>
          )}
          <WhatsAppButton phone={po.vendorPhone} text={waText} />
          <PrintButton label="Print / Save as PDF" />
        </div>
      </div>

      <PrintSheet settings={settings} documentDate={po.date}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-line-strong pb-4">
          <p className="text-lg font-semibold">PURCHASE ORDER</p>
          <div className="text-right">
            <p className="text-sm">{label}</p>
            {/* The letterhead has its own Date rule; printing a second date
                here would just contradict it. */}
            {!dateFieldOf(settings) && (
              <p className="text-xs text-ink-muted">
                {po.date.toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })}
              </p>
            )}
          </div>
        </div>

        {/* Vendor on the left, the business issuing the order on the right */}
        <div className="mt-4 flex justify-between gap-6 text-sm">
          <div className="min-w-0">
            <p className="text-ink-muted">Purchase order to</p>
            <p className="font-medium">{po.vendorName}</p>
            {po.vendorContact && <p>Attn: {po.vendorContact}</p>}
            {po.vendorPhone && <p className="text-ink-muted">{po.vendorPhone}</p>}
            {po.vendorAddress && <p className="text-ink-muted">{po.vendorAddress}</p>}
          </div>
          <div className="min-w-0 text-right">
            <p className="text-ink-muted">Made by</p>
            <p className="font-medium">{settings.name}</p>
            {settings.phone && <p className="text-ink-muted">{settings.phone}</p>}
            {settings.email && <p className="text-ink-muted">{settings.email}</p>}
          </div>
        </div>

        {po.status !== "OPEN" && (
          // Screen only: the owner sees where it stands; a reprint stays clean.
          <p className="no-print mt-4 border border-line-strong px-3 py-2 text-center text-sm font-semibold">
            {po.status === "RECEIVED" ? "Received" : "Cancelled"}
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
            {po.items.map((it) => (
              <tr key={it.id} className="border-b border-line">
                <td className="py-2 font-medium">{it.description}</td>
                <td className="py-2 text-right font-mono">{formatQtyUnit(it.qtyMilli, it.unit)}</td>
                <td className="py-2 text-right font-mono">{formatPKR(it.ratePaisa)}</td>
                <td className="py-2 text-right font-mono">{formatPKR(lineTotal(it))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between border-t border-line-strong pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="font-mono">{formatPKR(total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-ink-muted">
          {po.notes && <p>Note: {po.notes}</p>}
          <p className="mt-1">This purchase order is issued in the name of {settings.name}.</p>
        </div>
      </PrintSheet>
    </div>
  );
}
