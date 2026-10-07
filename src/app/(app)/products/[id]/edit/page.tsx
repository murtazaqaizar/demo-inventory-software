import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { listCategories, listColors } from "@/lib/products";
import { fromMilli } from "@/lib/qty";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "../../new/product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [product, categories, colors] = await Promise.all([
    prisma.product.findUnique({ where: { id }, include: { colors: { select: { colorId: true } } } }),
    listCategories(),
    listColors(),
  ]);
  if (!product) notFound();

  return (
    <div>
      <PageHeader title={`Edit ${product.code}`} description="Change this product's details." />
      <ProductForm
        canSeeCost={user.role === "OWNER"}
        categories={categories}
        colors={colors}
        initial={{
          id: product.id,
          name: product.name,
          size: product.size,
          variant: product.variant,
          colorIds: product.colors.map((c) => c.colorId),
          categoryId: product.categoryId,
          minStock: fromMilli(product.minStockMilli),
          latestCostRs: product.latestCostPaisa / 100,
        }}
      />
    </div>
  );
}
