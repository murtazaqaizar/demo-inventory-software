import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwnerPage } from "@/lib/guards";
import { getStockMap } from "@/lib/stock";
import { PRODUCT_UNIT } from "@/lib/products";
import { fromMilli, unitOf } from "@/lib/qty";
import { Button, Panel, PageHeader } from "@/components/ui";
import { PurchaseBuilder } from "../../new/purchase-builder";
import { DeletePurchase } from "../../delete-purchase";

export default async function EditPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOwnerPage();
  const { id } = await params;

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!purchase) notFound();

  const [products, suppliers] = await Promise.all([
    // Products already on this purchase stay listed even if they were later
    // hidden, otherwise their line would render with nothing selected.
    prisma.product.findMany({
      where: { OR: [{ active: true }, { id: { in: purchase.items.map((it) => it.productId) } }] },
      include: PRODUCT_UNIT,
      orderBy: { code: "asc" },
    }),
    // The purchase's own supplier stays selectable even if it was later hidden.
    prisma.supplier.findMany({
      where: purchase.supplierId
        ? { OR: [{ active: true }, { id: purchase.supplierId }] }
        : { active: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const stock = await getStockMap(products.map((p) => p.id));

  return (
    <div>
      <PageHeader
        title={`Edit purchase #${purchase.number}`}
        description="Saving re-does this purchase: stock, landed cost and the supplier payable are all corrected to match."
        action={
          <Link href={`/purchases/${purchase.id}`}>
            <Button variant="secondary">← Back to details</Button>
          </Link>
        }
      />
      <PurchaseBuilder
        products={products.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          size: p.size,
          variant: p.variant,
          color: p.color,
          stock: stock.get(p.id) ?? 0,
          unit: unitOf(p),
          latestCostPaisa: p.latestCostPaisa,
        }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        initial={{
          id: purchase.id,
          supplierId: purchase.supplierId ?? "",
          isImport: purchase.isImport,
          onCredit: purchase.onCredit,
          freightRs: String(purchase.freightPaisa / 100),
          dutyRs: String(purchase.dutyPaisa / 100),
          clearingRs: String(purchase.clearingPaisa / 100),
          transportRs: String(purchase.transportPaisa / 100),
          notes: purchase.notes ?? "",
          lines: purchase.items.map((it) => ({
            productId: it.productId,
            qty: String(fromMilli(it.qtyMilli)),
            unitCostRs: String(it.supplierUnitCostPaisa / 100),
          })),
        }}
      />

      <Panel className="mt-6 max-w-2xl border-bad/30 p-6">
        <h2 className="text-sm font-semibold text-bad">Danger zone</h2>
        <p className="mt-1 mb-3 text-sm text-ink-muted">
          Delete this purchase. The stock it brought in is taken back out, any payable it raised is
          removed, and each product&apos;s cost falls back to its previous purchase. Blocked if the
          goods have already been sold.
        </p>
        <DeletePurchase purchaseId={purchase.id} />
      </Panel>
    </div>
  );
}
