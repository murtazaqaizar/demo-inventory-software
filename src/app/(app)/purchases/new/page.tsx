import { prisma } from "@/lib/prisma";
import { requireOwnerPage } from "@/lib/guards";
import { getStockMap } from "@/lib/stock";
import { PRODUCT_INCLUDE } from "@/lib/products";
import { unitOf } from "@/lib/qty";
import { PageHeader } from "@/components/ui";
import { PurchaseBuilder } from "./purchase-builder";

export default async function NewPurchasePage() {
  await requireOwnerPage();

  const [products, suppliers] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, include: PRODUCT_INCLUDE, orderBy: { code: "asc" } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  // Stock is shown in the picker so you can see what you already hold while
  // entering what just arrived.
  const stock = await getStockMap(products.map((p) => p.id));

  return (
    <div>
      <PageHeader
        title="New purchase"
        description="Record received goods with cost. For imports, add freight/duty/clearing to get the true landed cost per unit."
      />
      <PurchaseBuilder
        products={products.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          size: p.size,
          variant: p.variant,
          color: p.color?.name,
          colorHex: p.color?.hex,
          stock: stock.get(p.id) ?? 0,
          unit: unitOf(p),
          latestCostPaisa: p.latestCostPaisa,
        }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
