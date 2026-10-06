import { requireUser } from "@/lib/guards";
import { listProductTagsWithCounts } from "@/lib/products";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "./product-form";

export default async function NewProductPage() {
  const [user, tags] = await Promise.all([requireUser(), listProductTagsWithCounts()]);
  return (
    <div>
      <PageHeader title="New product" description="Add a product with its size, variant and units." />
      <ProductForm canSeeCost={user.role === "OWNER"} isOwner={user.role === "OWNER"} tags={tags} />
    </div>
  );
}
