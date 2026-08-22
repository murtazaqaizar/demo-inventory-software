import { prisma } from "@/lib/prisma";
import { requireOwnerPage } from "@/lib/guards";
import { getIncomeStatement, resolvePeriod } from "@/lib/reports";
import { getStockMap } from "@/lib/stock";
import { formatPKR } from "@/lib/money";
import { Badge, Panel, EmptyState, PageHeader } from "@/components/ui";

function Row({ label, value, bold, indent }: { label: string; value: string; bold?: boolean; indent?: boolean }) {
  return (
    <div
      className={`flex justify-between py-1.5 ${bold ? "border-t border-line-strong font-semibold text-ink" : "text-ink-muted"}`}
    >
      <span className={indent ? "pl-4 text-ink-muted" : ""}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  await requireOwnerPage();
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const { statement, perProduct } = await getIncomeStatement(period.from, period.to);

  // Stock reports (feature 29) + stock valuation (improvement 9)
  const products = await prisma.product.findMany({ where: { active: true }, orderBy: { code: "asc" } });
  const stock = await getStockMap(products.map((p) => p.id));
  const lowStock = products.filter((p) => (stock.get(p.id) ?? 0) <= p.minStockLevel);
  const stockValuePaisa = products.reduce(
    (s, p) => s + (stock.get(p.id) ?? 0) * p.latestCostPaisa,
    0
  );
  const totalPieces = products.reduce((s, p) => s + (stock.get(p.id) ?? 0), 0);

  const defaultMonth = period.mode === "month" ? `${period.from.getFullYear()}-${String(period.from.getMonth() + 1).padStart(2, "0")}` : "";

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Income statement, per-product profit and stock — for the owner only."
      />

      {/* Period selector */}
      <Panel className="mb-6 p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-ink-muted">
            Month
            <input
              type="month"
              name="month"
              defaultValue={defaultMonth}
              className="block rounded-control border border-line-strong inline-flex h-[34px] items-center px-3.5 text-sm"
            />
          </label>
          <button type="submit" className="rounded-control border border-line-strong inline-flex h-[34px] items-center px-3.5 text-sm hover:bg-surface-alt">
            View month
          </button>
          <span className="text-line-strong">|</span>
          <label className="text-xs text-ink-muted">
            Year
            <input
              type="number"
              name="year"
              placeholder={String(new Date().getFullYear())}
              className="block w-28 rounded-control border border-line-strong inline-flex h-[34px] items-center px-3.5 text-sm"
            />
          </label>
          <button type="submit" className="rounded-control border border-line-strong inline-flex h-[34px] items-center px-3.5 text-sm hover:bg-surface-alt">
            View year
          </button>
          <span className="ml-auto text-sm font-medium text-ink-muted">Showing: {period.label}</span>
        </form>
      </Panel>

      {/* Exports (improvement 9) */}
      <Panel className="mb-6 p-4">
        <p className="mb-2 text-sm font-medium text-ink">Download for Excel / your accountant</p>
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            { href: `/api/export/income-statement?${sp.year ? `year=${sp.year}` : `month=${defaultMonth}`}`, label: "Income statement" },
            { href: "/api/export/stock-valuation", label: "Stock valuation" },
            { href: "/api/export/aging", label: "Who owes me (aging)" },
            { href: "/api/export/customers", label: "Customer balances" },
            { href: "/api/export/invoices", label: "All bills" },
            { href: "/api/export/expenses", label: "Expenses" },
          ].map((x) => (
            <a
              key={x.href}
              href={x.href}
              className="rounded-control border border-line-strong px-3 py-1.5 text-ink-muted hover:bg-surface-alt"
            >
              ↓ {x.label}
            </a>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Income statement */}
        <Panel className="p-6">
          <h2 className="mb-3 font-semibold text-ink">Income statement — {period.label}</h2>
          <div className="text-sm">
            <Row label="Sales" value={formatPKR(statement.salesPaisa)} />
            <Row label="Cost of goods sold" value={"− " + formatPKR(statement.cogsPaisa)} indent />
            <Row label="Gross profit" value={formatPKR(statement.grossPaisa)} bold />
            <Row label="Operating expenses" value={"− " + formatPKR(statement.expensesPaisa)} indent />
            <Row label="Free samples (marketing)" value={"− " + formatPKR(statement.samplesCostPaisa)} indent />
            <Row label="Net profit" value={formatPKR(statement.netPaisa)} bold />
          </div>
          <p className="mt-3 text-[13px] text-ink-muted">
            Profit uses the latest cost method. Owner drawings are excluded.
          </p>
        </Panel>

        {/* Stock summary + valuation */}
        <Panel className="p-6">
          <h2 className="mb-3 font-semibold text-ink">Stock summary</h2>
          <div className="mb-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-ink-muted">Active products</p>
              <p className="text-[22px] font-semibold text-ink">{products.length}</p>
            </div>
            <div>
              <p className="text-ink-muted">Low-stock items</p>
              <p className="text-[22px] font-semibold text-ink">{lowStock.length}</p>
            </div>
            <div>
              <p className="text-ink-muted">Stock value</p>
              <p className="text-[22px] font-semibold text-ink">{formatPKR(stockValuePaisa)}</p>
              <p className="text-xs text-ink-muted">{totalPieces} pcs at latest cost</p>
            </div>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-ink-muted">All items above their minimum.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span className="text-ink">{p.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-ink-muted">{stock.get(p.id) ?? 0} pcs</span>
                    <Badge tone="red">min {p.minStockLevel}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Per-product profit */}
      <Panel className="mt-6">
        <div className="tablewrap">
        <div className="border-b border-line px-4 py-3 font-semibold text-ink">
          Profit per product — {period.label}
        </div>
        {perProduct.length === 0 ? (
          <div className="p-6">
            <EmptyState>No sales in this period.</EmptyState>
          </div>
        ) : (
          <table className="rtable w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-ink-muted">
              <tr>
                <th className="h-11 px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 text-right font-medium">Pieces sold</th>
                <th className="px-4 py-3 text-right font-medium">Revenue</th>
                <th className="px-4 py-3 text-right font-medium">COGS</th>
                <th className="px-4 py-3 text-right font-medium">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {perProduct.map((p) => (
                <tr key={p.productId}>
                  <td className="h-11 px-4 py-3" data-label="Product">
                    <span className="font-mono text-xs text-ink-muted">{p.code}</span>{" "}
                    <span className="font-medium text-ink">{p.name}</span>
                  </td>
                  <td className="h-11 px-4 py-3 text-right font-mono" data-label="Pieces sold">{p.qtyPieces}</td>
                  <td className="h-11 px-4 py-3 text-right font-mono" data-label="Revenue">{formatPKR(p.revenuePaisa)}</td>
                  <td className="px-4 py-3 text-right text-ink-muted" data-label="COGS">{formatPKR(p.cogsPaisa)}</td>
                  <td
                    data-label="Profit"
                    className={`px-4 py-3 text-right font-medium ${
                      p.profitPaisa < 0 ? "text-bad" : "text-ok"
                    }`}
                  >
                    {formatPKR(p.profitPaisa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </Panel>
    </div>
  );
}
