import { prisma } from "@/lib/prisma";
import { requireOwnerPage } from "@/lib/guards";
import { toPickerProducts } from "@/lib/picker";
import { PRODUCT_INCLUDE } from "@/lib/products";
import { PageHeader } from "@/components/ui";
import { PurchaseBuilder } from "./purchase-builder";

export default async function NewPurchasePage() {
  await requireOwnerPage();

  const [products, suppliers] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, include: PRODUCT_INCLUDE, orderBy: { code: "asc" } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  
  return (
    <div>
      <PageHeader
        title="New purchase"
        description="Record received goods with cost. For imports, add freight/duty/clearing to get the true landed cost per unit."
      />
      <PurchaseBuilder
        products={await toPickerProducts(products, { withCost: true })}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
