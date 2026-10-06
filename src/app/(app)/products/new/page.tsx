import { requireUser } from "@/lib/guards";
import { listCategories, listColors } from "@/lib/products";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "./product-form";

export default async function NewProductPage() {
  const [user, categories, colors] = await Promise.all([requireUser(), listCategories(), listColors()]);
  return (
    <div>
      <PageHeader title="New product" description="Add a product with its size, variant and units." />
      <ProductForm canSeeCost={user.role === "OWNER"} categories={categories} colors={colors} />
    </div>
  );
}
