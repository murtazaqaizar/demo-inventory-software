import Link from "next/link";
import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { getColorStockMap, getStockMap } from "@/lib/stock";
import { colorsOf, stockKey } from "@/lib/variants";
import { formatPKR } from "@/lib/money";
import { listCategories } from "@/lib/products";
import { formatQty, formatQtyUnit, unitOf, unitShort, type Unit } from "@/lib/qty";
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  PageHeader,
  RowMenu,
  rowClass,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import { SearchBar, Pagination } from "@/components/list-controls";
import { Swatch } from "@/components/color-select";
import { DeleteButton } from "@/components/delete-button";
import { StockAdjuster } from "./stock-adjuster";
import { deleteProduct } from "./actions";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 30;
const NO_CATEGORY = "none";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; low?: string; category?: string; color?: string }>;
}) {
  const user = await requireUser();
  const owner = user.role === "OWNER";
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.ProductWhereInput = { active: true };
  if (sp.q) {
    where.OR = [
      { name: { contains: sp.q, mode: "insensitive" } },
      { code: { contains: sp.q, mode: "insensitive" } },
      { size: { contains: sp.q, mode: "insensitive" } },
      { variant: { contains: sp.q, mode: "insensitive" } },
      { colors: { some: { color: { name: { contains: sp.q, mode: "insensitive" } } } } },
      { category: { name: { contains: sp.q, mode: "insensitive" } } },
    ];
  }
  // ?category=<id> filters to one category; ?category=none = products without one.
  if (sp.category === NO_CATEGORY) where.categoryId = null;
  else if (sp.category) where.categoryId = sp.category;
  // ?color=<id> shows only products that come in that color, and only that color's row.
  if (sp.color) where.colors = { some: { colorId: sp.color } };

  const [categories, usedColors, products, total] = await Promise.all([
    listCategories(),
    // Color chips: only colors some product actually comes in.
    prisma.color.findMany({ where: { variants: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true, hex: true } }),
    prisma.product.findMany({
      where,
      include: { category: { select: { name: true, unit: true } }, colors: { select: { color: { select: { id: true, name: true, hex: true } } } } },
      orderBy: { code: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ]);
  const ids = products.map((p) => p.id);
  const [stock, colorStock] = await Promise.all([getStockMap(ids), getColorStockMap(ids)]);

  const tagHref = (category?: string, color: string | undefined = sp.color) => {
    const qs = new URLSearchParams();
    if (sp.q) qs.set("q", sp.q);
    if (category) qs.set("category", category);
    if (color) qs.set("color", color);
    const query = qs.toString();
    return query ? `/products?${query}` : "/products";
  };
  const tagClass = (on: boolean) =>
    `inline-flex h-8 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-150 ${
      on
        ? "border-accent bg-accent-soft text-ink"
        : "border-line bg-surface text-ink-muted hover:bg-surface-alt"
    }`;

  return (
    <div>
      <PageHeader
        title="Products / Stock"
        description="Catalogue with sizes & variants, live stock levels and low-stock alerts."
        action={
          <Link href="/products/new">
            <Button>+ New product</Button>
          </Link>
        }
      />

      <Panel>
        <SearchBar
          action="/products"
          q={sp.q}
          placeholder="Search name, code, size, brand, color or category"
        >
          {sp.category && <input type="hidden" name="category" value={sp.category} />}
          {sp.color && <input type="hidden" name="color" value={sp.color} />}
        </SearchBar>

        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 md:px-6">
            <span className="mr-1 text-[13px] font-medium text-ink-muted">Product</span>
            <Link href={tagHref()} className={tagClass(!sp.category)}>
              All
            </Link>
            {categories.map((c) => (
              <Link key={c.id} href={tagHref(c.id)} className={tagClass(sp.category === c.id)}>
                {c.name} <span className="ml-1 text-ink-faint">{unitShort(c.unit as Unit)}</span>
              </Link>
            ))}
          </div>
        )}

        {usedColors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 md:px-6">
            <span className="mr-1 text-[13px] font-medium text-ink-muted">Color</span>
            <Link href={tagHref(sp.category, undefined)} className={tagClass(!sp.color)}>
              All
            </Link>
            {usedColors.map((c) => (
              <Link key={c.id} href={tagHref(sp.category, c.id)} className={`${tagClass(sp.color === c.id)} gap-1.5`}>
                <Swatch hex={c.hex} size={12} />
                {c.name}
              </Link>
            ))}
          </div>
        )}

        {products.length === 0 ? (
          <EmptyState>
            {sp.q
              ? "No products match that search."
              : "No products yet. Add your first product to begin."}
          </EmptyState>
        ) : (
          <div className="tablewrap">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Code</th>
                  <th className={thClass}>Product</th>
                  <th className={thNumClass}>Stock</th>
                  {owner && <th className={thNumClass}>Latest cost</th>}
                  <th className={thClass}>Adjust</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const qty = stock.get(p.id) ?? 0;
                  const low = qty <= p.minStockMilli;
                  const unit = unitOf(p);
                  // Color variants: one row per color under the product (filtered to
                  // the chosen color chip, if any). The product row then shows the total.
                  const colors = colorsOf(p).filter((c) => !sp.color || c.id === sp.color);
                  const hasColors = colors.length > 0;
                  return (
                    <Fragment key={p.id}>
                    <tr className={rowClass}>
                      <td
                        className={`${tdClass} font-mono text-[13px] text-ink-muted`}
                        data-label="Code"
                      >
                        {p.code}
                      </td>
                      <td className={tdClass} data-label="Product">
                        <div className="text-right sm:text-left">
                          <div className="font-medium text-ink">{p.name}</div>
                          <div className="text-[13px] text-ink-muted">
                            {[p.size, p.variant].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      </td>
                      <td className={tdNumClass} data-label="Stock">
                        <span className="font-medium text-ink">
                          {hasColors && <span className="mr-1 font-sans text-[13px] font-normal text-ink-muted">Total</span>}
                          {formatQtyUnit(qty, unit)}
                        </span>
                        {low && (
                          <span className="ml-2">
                            <Badge tone="red">Low · min {formatQty(p.minStockMilli)}</Badge>
                          </span>
                        )}
                      </td>
                      {owner && (
                        <td className={tdNumClass} data-label="Latest cost">
                          {formatPKR(p.latestCostPaisa)}
                        </td>
                      )}
                      <td className={tdClass} data-label="Adjust">
                        {hasColors ? (
                          <span className="text-[13px] text-ink-muted">Per color below</span>
                        ) : (
                          <StockAdjuster productId={p.id} unit={unit} />
                        )}
                      </td>
                      <td className={`${tdClass} text-right`} data-label="Actions">
                        <RowMenu>
                          <Link href={`/products/${p.id}/edit`}>Edit product</Link>
                          {owner && (
                            <DeleteButton action={deleteProduct} hidden={{ productId: p.id }} />
                          )}
                        </RowMenu>
                      </td>
                    </tr>
                    {colors.map((c) => (
                      <tr key={c.id} className="bg-surface-alt/40">
                        <td className={tdClass} />
                        <td className={tdClass} data-label="Color">
                          <span className="flex items-center gap-2 pl-4 text-[15px] text-ink sm:justify-start">
                            <Swatch hex={c.hex} size={14} />
                            {c.name}
                          </span>
                        </td>
                        <td className={tdNumClass} data-label={`${c.name} stock`}>
                          {formatQtyUnit(colorStock.get(stockKey(p.id, c.id)) ?? 0, unit)}
                        </td>
                        {owner && <td className={tdClass} />}
                        <td className={tdClass} data-label="Adjust">
                          <StockAdjuster productId={p.id} colorId={c.id} unit={unit} />
                        </td>
                        <td className={tdClass} />
                      </tr>
                    ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Pagination
        basePath="/products"
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        params={{ q: sp.q, category: sp.category, color: sp.color }}
      />
    </div>
  );
}
