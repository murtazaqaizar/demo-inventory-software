import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { toPickerProducts } from "@/lib/picker";
import { PRODUCT_INCLUDE, listUnits } from "@/lib/products";
import { PageHeader } from "@/components/ui";
import { ReturnBuilder } from "../return-builder";

export default async function NewReturnPage() {
  await requireUser();

  const [products, customers] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, include: PRODUCT_INCLUDE, orderBy: { code: "asc" } }),
    prisma.customer.findMany({ where: { active: true }, orderBy: [{ isCashCustomer: "desc" }, { name: "asc" }] }),
  ]);

  return (
    <div>
      <PageHeader
        title="New return"
        description="Record goods coming back. Stock is restored and the money is settled properly."
      />
      <ReturnBuilder
        products={await toPickerProducts(products)}
        customers={customers.map((c) => ({ id: c.id, name: c.name, isCash: c.isCashCustomer }))}
        units={await listUnits()}
      />
    </div>
  );
}
