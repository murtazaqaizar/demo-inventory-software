import { requireUser } from "@/lib/guards";
import { listCategories } from "@/lib/products";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "./product-form";

export default async function NewProductPage() {
  const [user, categories] = await Promise.all([requireUser(), listCategories()]);
  return (
    <div>
      <PageHeader title="New product" description="Add a product with its size, variant and units." />
      <ProductForm canSeeCost={user.role === "OWNER"} categories={categories} />
    </div>
  );
}
