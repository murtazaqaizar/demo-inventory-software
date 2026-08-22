import { requireUser } from "@/lib/guards";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "./product-form";

export default async function NewProductPage() {
  const user = await requireUser();
  return (
    <div>
      <PageHeader title="New product" description="Add a product with its size, variant and units." />
      <ProductForm canSeeCost={user.role === "OWNER"} />
    </div>
  );
}
