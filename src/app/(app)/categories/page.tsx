import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { EmptyState, Panel, PanelHeader, PageHeader } from "@/components/ui";
import { UNIT_FIELDS } from "@/lib/products";
import { AddCategoryForm, AddColorForm, AddUnitForm, CategoryRow, ColorRow, UnitRow } from "./category-forms";

export default async function CategoriesPage() {
  const user = await requireUser();
  const owner = user.role === "OWNER";

  const [categories, units, colors, withStock] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { unit: { select: { id: true, ...UNIT_FIELDS } }, _count: { select: { products: true } } },
    }),
    prisma.unit.findMany({
      orderBy: { name: "asc" },
      select: { id: true, ...UNIT_FIELDS, _count: { select: { categories: true } } },
    }),
    prisma.color.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, hex: true, _count: { select: { variants: true } } },
    }),
    // Categories whose unit is locked: at least one product with stock history.
    prisma.product.findMany({
      where: { categoryId: { not: null }, movements: { some: {} } },
      distinct: ["categoryId"],
      select: { categoryId: true },
    }),
  ]);
  const locked = new Set(withStock.map((p) => p.categoryId));
  const unitOptions = units.map((u) => ({ id: u.id, name: u.name, short: u.short, decimals: u.decimals }));

  return (
    <div>
      <PageHeader
        title="Categories, units & colors"
        description="Group products, choose the unit each group is counted and sold in, and keep the color list."
      />

      <div className="mb-6">
        <AddCategoryForm units={unitOptions} />
      </div>

      <Panel>
        <PanelHeader title={`Categories (${categories.length})`} />
        {categories.length === 0 && (
          <EmptyState>No categories yet. Add one above, then pick it when adding a product.</EmptyState>
        )}
        {categories.map((c) => (
          <CategoryRow
            key={c.id}
            category={{ id: c.id, name: c.name, unit: c.unit }}
            units={unitOptions}
            productCount={c._count.products}
            unitLocked={locked.has(c.id)}
            owner={owner}
          />
        ))}
      </Panel>

      <Panel className="mt-6">
        <PanelHeader title={`Units (${units.length})`} />
        {owner && <AddUnitForm />}
        {units.map((u) => (
          <UnitRow key={u.id} unit={unitOptions.find((o) => o.id === u.id)!} categoryCount={u._count.categories} owner={owner} />
        ))}
      </Panel>

      <Panel className="mt-6">
        <PanelHeader title={`Colors (${colors.length})`} />
        <AddColorForm />
        {colors.map(({ _count, ...c }) => (
          <ColorRow key={c.id} color={c} productCount={_count.variants} owner={owner} />
        ))}
      </Panel>

      <p className="mt-6 max-w-[72ch] text-[15px] text-ink-muted">
        Products without a category are counted by the piece. A category&apos;s unit can&apos;t be
        changed once its products have stock — create a new category instead. Categories, units and colors
        can only be deleted when nothing uses them.
      </p>
    </div>
  );
}
