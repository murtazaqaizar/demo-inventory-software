import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { toPickerProducts } from "@/lib/picker";
import { PRODUCT_INCLUDE, listUnits } from "@/lib/products";
import { todayInputValue } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { BillingBuilder } from "../../billing/new/billing-builder";

export default async function NewQuotationPage() {
  await requireUser();

  const [products, customers] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, include: PRODUCT_INCLUDE, orderBy: { code: "asc" } }),
    prisma.customer.findMany({ where: { active: true }, orderBy: [{ isCashCustomer: "desc" }, { name: "asc" }] }),
  ]);

  return (
    <div>
      <PageHeader
        title="New quotation"
        description="Price offer for a customer. Nothing leaves stock and nothing goes on their account until it is accepted and made into a bill."
      />
      <BillingBuilder
        mode="quote"
        products={await toPickerProducts(products)}
        customers={customers.map((c) => ({ id: c.id, name: c.name, isCash: c.isCashCustomer }))}
        units={await listUnits()}
        today={todayInputValue()}
      />
    </div>
  );
}
