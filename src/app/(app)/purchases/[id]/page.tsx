import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwnerPage } from "@/lib/guards";
import { formatPKR } from "@/lib/money";
import { getSupplierBalance } from "@/lib/suppliers";
import { Badge, Button, Panel, PageHeader } from "@/components/ui";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-ink-muted">{label}</span>
      <span className={strong ? "font-semibold text-ink" : "font-medium text-ink"}>
        {value}
      </span>
    </div>
  );
}

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOwnerPage(); // purchases carry cost — OWNER only
  const { id } = await params;

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: { include: { product: true } },
      movements: true,
    },
  });
  if (!purchase) notFound();

  // The payable this purchase raised, if it was on credit. Read from the ledger
  // rather than recomputed, so what's shown is what the supplier balance uses.
  const charge = await prisma.supplierLedgerEntry.findFirst({
    where: {
      direction: "CHARGE",
      OR: [
        { purchaseId: purchase.id },
        ...(purchase.supplierId
          ? [
              {
                purchaseId: null,
                supplierId: purchase.supplierId,
                note: `Purchase ${purchase.id.slice(-6)}`,
              },
            ]
          : []),
      ],
    },
  });

  const goods = purchase.items.reduce((s, it) => s + it.supplierUnitCostPaisa * it.pieces, 0);
  const extras =
    purchase.freightPaisa + purchase.dutyPaisa + purchase.clearingPaisa + purchase.transportPaisa;
  const totalPieces = purchase.items.reduce((s, it) => s + it.pieces, 0);

  const supplierBalance = purchase.supplierId
    ? await getSupplierBalance(purchase.supplierId)
    : 0;

  return (
    <div>
      <PageHeader
        title={`Purchase #${purchase.number}`}
        description={`${purchase.supplier?.name ?? "Cash purchase"} · received ${purchase.date.toLocaleDateString(
          "en-PK",
          { day: "numeric", month: "long", year: "numeric" }
        )}`}
        action={
          <div className="flex gap-2">
            <Link href="/purchases">
              <Button variant="secondary">← All purchases</Button>
            </Link>
            <Link href={`/purchases/${purchase.id}/edit`}>
              <Button>Edit</Button>
            </Link>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {purchase.isImport ? (
          <Badge tone="neutral">Import — landed cost applied</Badge>
        ) : (
          <Badge tone="neutral">Local purchase</Badge>
        )}
        {purchase.onCredit ? (
          <Badge tone="amber">On credit — added to payables</Badge>
        ) : (
          <Badge tone="green">Paid / cash purchase</Badge>
        )}
      </div>

      <Panel className="mb-6">
        <div className="tablewrap">
        <table className="rtable w-full min-w-[720px] text-[15px]">
          <thead className="border-b border-line text-left text-ink-muted">
            <tr>
              <th className="h-11 px-4 py-3 font-medium">Product</th>
              <th className="h-11 px-4 py-3 font-medium">Pieces</th>
              <th className="h-11 px-4 py-3 font-medium">Supplier cost /pc</th>
              <th className="h-11 px-4 py-3 font-medium">Landed cost /pc</th>
              <th className="h-11 px-4 py-3 font-medium">Line total (landed)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {purchase.items.map((it) => (
              <tr key={it.id}>
                <td className="h-11 px-4 py-3" data-label="Product">
                  <Link
                    href={`/products/${it.productId}/edit`}
                    className="font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {it.product.code} — {it.product.name}
                  </Link>
                  {it.product.size && <span className="text-ink-muted"> {it.product.size}</span>}
                </td>
                <td className="px-4 py-3 text-ink-muted" data-label="Pieces">{it.pieces}</td>
                <td className="px-4 py-3 text-ink-muted" data-label="Supplier cost /pc">
                  {formatPKR(it.supplierUnitCostPaisa)}
                </td>
                <td className="h-11 px-4 py-3" data-label="Landed cost /pc">
                  <span className="font-medium">{formatPKR(it.landedUnitCostPaisa)}</span>
                  {it.landedUnitCostPaisa > it.supplierUnitCostPaisa && (
                    <span className="ml-1 text-xs text-ink-muted">
                      (+{formatPKR(it.landedUnitCostPaisa - it.supplierUnitCostPaisa)})
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink" data-label="Line total (landed)">
                  {formatPKR(it.landedUnitCostPaisa * it.pieces)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-surface-alt">
            <tr>
              <td className="h-11 px-4 py-3 font-medium">
                {purchase.items.length} line{purchase.items.length === 1 ? "" : "s"}
              </td>
              <td className="h-11 px-4 py-3 font-medium">{totalPieces} pcs</td>
              <td className="h-11 px-4 py-3" colSpan={2} />
              <td className="px-4 py-3 font-semibold text-ink">
                {formatPKR(goods + extras)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="mb-3 font-semibold text-ink">Cost breakdown</h2>
          <div className="text-[15px]">
            <Row label="Goods value" value={formatPKR(goods)} />
            {purchase.freightPaisa > 0 && (
              <Row label="Freight" value={formatPKR(purchase.freightPaisa)} />
            )}
            {purchase.dutyPaisa > 0 && (
              <Row label="Customs duty" value={formatPKR(purchase.dutyPaisa)} />
            )}
            {purchase.clearingPaisa > 0 && (
              <Row label="Clearing" value={formatPKR(purchase.clearingPaisa)} />
            )}
            {purchase.transportPaisa > 0 && (
              <Row label="Local transport" value={formatPKR(purchase.transportPaisa)} />
            )}
            <div className="mt-2 border-t border-line pt-2">
              <Row label="Total landed cost" value={formatPKR(goods + extras)} strong />
            </div>
          </div>
          {extras > 0 && (
            <p className="mt-3 text-xs text-ink-muted">
              Extras are spread across the lines by value, which is where each line&apos;s landed
              cost per piece comes from.
            </p>
          )}
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-3 font-semibold text-ink">Payment & stock</h2>
          <div className="text-[15px]">
            {purchase.onCredit && purchase.supplier ? (
              <>
                <Row
                  label="Added to payables"
                  value={charge ? formatPKR(charge.amountPaisa) : "—"}
                />
                <Row
                  label={`Owed to ${purchase.supplier.name} now`}
                  value={supplierBalance > 0 ? formatPKR(supplierBalance) : "Settled"}
                />
                <Link
                  href="/suppliers"
                  className="mt-2 inline-block text-ink-muted underline hover:text-ink"
                >
                  Record a payment →
                </Link>
              </>
            ) : (
              <p className="text-ink-muted">
                Not on credit — nothing was added to supplier payables.
              </p>
            )}

            <div className="mt-4 border-t border-line pt-3">
              <Row label="Pieces added to stock" value={`${totalPieces} pcs`} />
              <Row
                label="Stock movements recorded"
                value={String(purchase.movements.length)}
              />
            </div>
          </div>

          {purchase.notes && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-xs font-medium text-ink-muted">Notes</p>
              <p className="mt-1 text-sm text-ink">{purchase.notes}</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
