import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { toPickerProducts } from "@/lib/picker";
import { PRODUCT_INCLUDE, listUnits } from "@/lib/products";
import { fromMilli } from "@/lib/qty";
import { dateInputValue, todayInputValue } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { BillingBuilder } from "../../new/billing-builder";

export default async function EditBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { items: true, payments: true },
  });
  if (!invoice) notFound();
  if (invoice.status === "VOIDED") redirect("/billing");

  const [products, customers] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, include: PRODUCT_INCLUDE, orderBy: { code: "asc" } }),
    prisma.customer.findMany({ where: { active: true }, orderBy: [{ isCashCustomer: "desc" }, { name: "asc" }] }),
  ]);

  return (
    <div>
      <PageHeader
        title={`Edit bill #${invoice.number}`}
        description="Change the date, the items or the payment. Stock and the customer's balance are corrected automatically."
      />
      <BillingBuilder
        products={await toPickerProducts(products)}
        customers={customers.map((c) => ({ id: c.id, name: c.name, isCash: c.isCashCustomer }))}
        units={await listUnits()}
        today={todayInputValue()}
        edit={{
          invoiceId: invoice.id,
          number: invoice.number,
          customerId: invoice.customerId,
          date: dateInputValue(invoice.date),
          lines: invoice.items.map((it) => ({
            productId: it.productId,
            colorId: it.colorId,
            description: it.description,
            unit: it.unit,
            qty: fromMilli(it.qtyMilli),
            rateRs: it.ratePaisa / 100,
            costRs: it.unitCostPaisa / 100,
            isSample: it.isSample,
          })),
          payments: invoice.payments.map((p) => ({ method: p.method as "CASH" | "CHEQUE" | "ONLINE", amountRs: p.amountPaisa / 100 })),
        }}
      />
    </div>
  );
}
