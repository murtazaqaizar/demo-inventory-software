import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "../../new/product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) notFound();

  return (
    <div>
      <PageHeader title={`Edit ${product.code}`} description="Change this product's details." />
      <ProductForm
        canSeeCost={user.role === "OWNER"}
        initial={{
          id: product.id,
          name: product.name,
          size: product.size,
          variant: product.variant,
          piecesPerBox: product.piecesPerBox,
          piecesPerCarton: product.piecesPerCarton,
          minStockLevel: product.minStockLevel,
          latestCostRs: product.latestCostPaisa / 100,
        }}
      />
    </div>
  );
}
