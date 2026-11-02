import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { listUnits } from "@/lib/products";
import { poLabel, purchaseOrderSeed } from "@/lib/purchase-orders";
import { PageHeader } from "@/components/ui";
import { PurchaseOrderForm } from "../../po-form";

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [po, units] = await Promise.all([
    prisma.purchaseOrder.findUnique({ where: { id }, include: { items: { orderBy: { position: "asc" } } } }),
    listUnits(),
  ]);
  if (!po) notFound();
  // Only an open order can change; received/cancelled ones are reopened first.
  if (po.status !== "OPEN") redirect(`/purchase-orders/${po.id}/print`);

  return (
    <div>
      <PageHeader title={`Edit ${poLabel(po.number)}`} description="Change the party or the items. Stock and accounts are not changed." />
      <PurchaseOrderForm id={po.id} units={units.map((u) => u.short)} seed={purchaseOrderSeed(po)} />
    </div>
  );
}
