import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { EmptyState, Panel, PanelHeader, PageHeader } from "@/components/ui";
import type { Unit } from "@/lib/qty";
import { AddCategoryForm, CategoryRow } from "./category-forms";

export default async function CategoriesPage() {
  const user = await requireUser();
  const owner = user.role === "OWNER";

  const [categories, withStock] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    }),
    // Categories whose unit is locked: at least one product with stock history.
    prisma.product.findMany({
      where: { categoryId: { not: null }, movements: { some: {} } },
      distinct: ["categoryId"],
      select: { categoryId: true },
    }),
  ]);
  const locked = new Set(withStock.map((p) => p.categoryId));

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Group products and choose the unit each group is counted and sold in."
      />

      <div className="mb-6">
        <AddCategoryForm />
      </div>

      <Panel>
        <PanelHeader title={`Categories (${categories.length})`} />
        {categories.length === 0 && (
          <EmptyState>No categories yet. Add one above, then pick it when adding a product.</EmptyState>
        )}
        {categories.map((c) => (
          <CategoryRow
            key={c.id}
            category={{ id: c.id, name: c.name, unit: c.unit as Unit }}
            productCount={c._count.products}
            unitLocked={locked.has(c.id)}
            owner={owner}
          />
        ))}
      </Panel>

      <p className="mt-6 max-w-[72ch] text-[15px] text-ink-muted">
        Products without a category are counted by the piece. A category&apos;s unit can&apos;t be
        changed once its products have stock — create a new category instead. A category can only
        be deleted when it has no products.
      </p>
    </div>
  );
}
