import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { getStockMap } from "@/lib/stock";
import { formatPKR } from "@/lib/money";
import { listCategories } from "@/lib/products";
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
import { DeleteButton } from "@/components/delete-button";
import { StockAdjuster } from "./stock-adjuster";
import { deleteProduct } from "./actions";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 30;
const NO_CATEGORY = "none";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; low?: string; category?: string }>;
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
      { category: { contains: sp.q, mode: "insensitive" } },
    ];
  }
  // ?category=<tag> filters to one category; ?category=none = products without one.
  if (sp.category === NO_CATEGORY) where.category = null;
  else if (sp.category) where.category = sp.category;

  const [categories, products, total] = await Promise.all([
    listCategories(),
    prisma.product.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ]);
  const stock = await getStockMap(products.map((p) => p.id));

  const tagHref = (category?: string) => {
    const qs = new URLSearchParams();
    if (sp.q) qs.set("q", sp.q);
    if (category) qs.set("category", category);
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
          placeholder="Search name, code, size, brand or category"
        >
          {sp.category && <input type="hidden" name="category" value={sp.category} />}
        </SearchBar>

        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 md:px-6">
            <span className="mr-1 text-[13px] font-medium text-ink-muted">Category</span>
            <Link href={tagHref()} className={tagClass(!sp.category)}>
              All
            </Link>
            {categories.map((c) => (
              <Link key={c} href={tagHref(c)} className={tagClass(sp.category === c)}>
                {c}
              </Link>
            ))}
            <Link href={tagHref(NO_CATEGORY)} className={tagClass(sp.category === NO_CATEGORY)}>
              Uncategorised
            </Link>
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
                  <th className={thClass}>Units</th>
                  <th className={thNumClass}>Stock (pcs)</th>
                  {owner && <th className={thNumClass}>Latest cost</th>}
                  <th className={thClass}>Adjust</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const qty = stock.get(p.id) ?? 0;
                  const low = qty <= p.minStockLevel;
                  return (
                    <tr key={p.id} className={rowClass}>
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
                          {p.category && (
                            <div className="mt-1">
                              <Badge>{p.category}</Badge>
                            </div>
                          )}
                        </div>
                      </td>
                      <td
                        className={`${tdClass} font-mono text-[13px] text-ink-muted`}
                        data-label="Units"
                      >
                        1 box = {p.piecesPerBox} pcs
                        {p.piecesPerCarton > 0 && <> · 1 carton = {p.piecesPerCarton} pcs</>}
                      </td>
                      <td className={tdNumClass} data-label="Stock">
                        <span className="font-medium text-ink">{qty}</span>
                        {low && (
                          <span className="ml-2">
                            <Badge tone="red">Low · min {p.minStockLevel}</Badge>
                          </span>
                        )}
                      </td>
                      {owner && (
                        <td className={tdNumClass} data-label="Latest cost">
                          {formatPKR(p.latestCostPaisa)}
                        </td>
                      )}
                      <td className={tdClass} data-label="Adjust">
                        <StockAdjuster productId={p.id} />
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
        params={{ q: sp.q, category: sp.category }}
      />
    </div>
  );
}
