import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { getStockMap } from "@/lib/stock";
import { PageHeader } from "@/components/ui";
import { ReturnBuilder } from "../return-builder";

export default async function NewReturnPage() {
  await requireUser();

  const [products, customers] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.customer.findMany({ where: { active: true }, orderBy: [{ isCashCustomer: "desc" }, { name: "asc" }] }),
  ]);
  const stock = await getStockMap(products.map((p) => p.id));

  return (
    <div>
      <PageHeader
        title="New return"
        description="Record goods coming back. Stock is restored and the money is settled properly."
      />
      <ReturnBuilder
        products={products.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          size: p.size,
          variant: p.variant,
          stock: stock.get(p.id) ?? 0,
        }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name, isCash: c.isCashCustomer }))}
      />
    </div>
  );
}
