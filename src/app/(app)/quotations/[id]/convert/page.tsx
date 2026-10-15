import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { toPickerProducts } from "@/lib/picker";
import { PRODUCT_INCLUDE, listUnits } from "@/lib/products";
import { todayInputValue } from "@/lib/dates";
import { quotationSeed } from "@/lib/quotations";
import { PageHeader } from "@/components/ui";
import { BillingBuilder } from "../../../billing/new/billing-builder";

// Accepting a quotation: the normal bill form, filled from the quotation and
// dated today. Saving it is an ordinary bill — stock goes out, payments are
// taken, the rest goes on credit — and the quotation is marked accepted.
export default async function ConvertQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const q = await prisma.quotation.findUnique({ where: { id }, include: { items: true, payments: true } });
  if (!q) notFound();
  if (q.status === "ACCEPTED" && q.invoiceId) redirect(`/billing/${q.invoiceId}/print`);
  if (q.status !== "OPEN") redirect("/quotations");

  const [products, customers] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, include: PRODUCT_INCLUDE, orderBy: { code: "asc" } }),
    prisma.customer.findMany({ where: { active: true }, orderBy: [{ isCashCustomer: "desc" }, { name: "asc" }] }),
  ]);
  const today = todayInputValue();

  return (
    <div>
      <PageHeader
        title={`Make bill from quotation Q-${q.number}`}
        description="Check the items and prices, enter what the customer pays now, and save. Stock goes out and the rest goes on credit, like any bill."
      />
      <BillingBuilder
        products={await toPickerProducts(products)}
        customers={customers.map((c) => ({ id: c.id, name: c.name, isCash: c.isCashCustomer }))}
        units={await listUnits()}
        today={today}
        seed={quotationSeed(q, today)}
        fromQuote={{ quotationId: q.id, number: q.number }}
      />
    </div>
  );
}
