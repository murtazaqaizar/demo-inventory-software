import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { toPickerProducts } from "@/lib/picker";
import { PRODUCT_INCLUDE, listUnits } from "@/lib/products";
import { todayInputValue } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { BillingBuilder } from "./billing-builder";

export default async function NewBillPage() {
  await requireUser();

  const [products, customers] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, include: PRODUCT_INCLUDE, orderBy: { code: "asc" } }),
    prisma.customer.findMany({ where: { active: true }, orderBy: [{ isCashCustomer: "desc" }, { name: "asc" }] }),
  ]);

  return (
    <div>
      <PageHeader
        title="New bill"
        description="Search a product, set the negotiated rate, and record what the customer pays now — the rest goes on udhaar."
      />
      <BillingBuilder
        products={await toPickerProducts(products)}
        customers={customers.map((c) => ({ id: c.id, name: c.name, isCash: c.isCashCustomer }))}
        units={await listUnits()}
        today={todayInputValue()}
      />
    </div>
  );
}
