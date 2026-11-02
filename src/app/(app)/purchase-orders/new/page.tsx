import { requireUser } from "@/lib/guards";
import { listUnits } from "@/lib/products";
import { todayInputValue } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { PurchaseOrderForm } from "../po-form";

export default async function NewPurchaseOrderPage() {
  await requireUser();
  const units = await listUnits();

  return (
    <div>
      <PageHeader
        title="New purchase order"
        description="A slip for the vendor saying what you are buying from them. Stock and accounts are not changed."
      />
      <PurchaseOrderForm
        units={units.map((u) => u.short)}
        seed={{ date: todayInputValue(), vendorName: "", vendorContact: "", vendorPhone: "", vendorAddress: "", notes: "", lines: [] }}
      />
    </div>
  );
}
