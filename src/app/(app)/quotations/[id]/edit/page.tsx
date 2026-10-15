import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { toPickerProducts } from "@/lib/picker";
import { PRODUCT_INCLUDE, listUnits } from "@/lib/products";
import { todayInputValue } from "@/lib/dates";
import { quotationSeed } from "@/lib/quotations";
import { PageHeader } from "@/components/ui";
import { BillingBuilder } from "../../../billing/new/billing-builder";

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const q = await prisma.quotation.findUnique({ where: { id }, include: { items: true, payments: true } });
  if (!q) notFound();
  // Only an open quotation can change; an accepted one already has its bill.
  if (q.status !== "OPEN") redirect("/quotations");

  const [products, customers] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, include: PRODUCT_INCLUDE, orderBy: { code: "asc" } }),
    prisma.customer.findMany({ where: { active: true }, orderBy: [{ isCashCustomer: "desc" }, { name: "asc" }] }),
  ]);

  return (
    <div>
      <PageHeader title={`Edit quotation Q-${q.number}`} description="Change prices, items or the customer. The quotation keeps its number." />
      <BillingBuilder
        mode="quote"
        products={await toPickerProducts(products)}
        customers={customers.map((c) => ({ id: c.id, name: c.name, isCash: c.isCashCustomer }))}
        units={await listUnits()}
        today={todayInputValue()}
        seed={quotationSeed(q)}
        quote={{ quotationId: q.id, number: q.number }}
      />
    </div>
  );
}
