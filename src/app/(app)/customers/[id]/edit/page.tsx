import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { Panel, PageHeader } from "@/components/ui";
import { CustomerEditForm } from "./edit-form";
import { PermanentDeleteCustomer } from "../../permanent-delete";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer || customer.isCashCustomer) notFound();

  const billCount = await prisma.invoice.count({ where: { customerId: customer.id } });

  return (
    <div>
      <PageHeader title={`Edit ${customer.name}`} description="Change this customer's details." />
      <CustomerEditForm
        canSeeMoney={user.role === "OWNER"}
        initial={{
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          openingBalanceRs: customer.openingBalancePaisa / 100,
          creditLimitRs: customer.creditLimitPaisa / 100,
        }}
      />

      {user.role === "OWNER" && (
        <Panel className="mt-6 max-w-2xl border-bad/30 p-6">
          <h2 className="text-sm font-semibold text-bad">Danger zone</h2>
          <p className="mt-1 mb-3 text-sm text-ink-muted">
            Permanently delete this customer and all their bills. This cannot be undone. To just
            remove them from your list while keeping their history, use “Delete / hide” instead.
          </p>
          <PermanentDeleteCustomer customerId={customer.id} customerName={customer.name} billCount={billCount} />
        </Panel>
      )}
    </div>
  );
}
