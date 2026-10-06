import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { getStockMap } from "@/lib/stock";
import { PRODUCT_UNIT } from "@/lib/products";
import { unitOf } from "@/lib/qty";
import { todayInputValue } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { BillingBuilder } from "./billing-builder";

export default async function NewBillPage() {
  await requireUser();

  const [products, customers] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, include: PRODUCT_UNIT, orderBy: { code: "asc" } }),
    prisma.customer.findMany({ where: { active: true }, orderBy: [{ isCashCustomer: "desc" }, { name: "asc" }] }),
  ]);
  const stock = await getStockMap(products.map((p) => p.id));

  return (
    <div>
      <PageHeader
        title="New bill"
        description="Search a product, set the negotiated rate, and record what the customer pays now — the rest goes on udhaar."
      />
      <BillingBuilder
        products={products.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          size: p.size,
          variant: p.variant,
          color: p.color,
          stock: stock.get(p.id) ?? 0,
          unit: unitOf(p),
        }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name, isCash: c.isCashCustomer }))}
        today={todayInputValue()}
      />
    </div>
  );
}
