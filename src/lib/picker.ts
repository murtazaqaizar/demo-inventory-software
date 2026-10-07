import { getColorStockMap, getStockMap } from "@/lib/stock";
import { unitOf, type Unit } from "@/lib/qty";
import { colorsOf, stockKey, type ColorRef } from "@/lib/variants";
import type { PickerProduct } from "@/components/product-picker";

type ProductRow = {
  id: string;
  code: string;
  name: string;
  size: string | null;
  variant: string | null;
  latestCostPaisa: number;
  category: { unit: Unit } | null;
  colors: { color: ColorRef }[];
};

/**
 * Products as the bill / purchase / return pickers need them: unit, color
 * variants and stock (total and per color). Query the products with
 * PRODUCT_INCLUDE. `withCost` adds the latest cost — purchases only, so cost
 * never reaches a staff member's browser on the billing screen.
 */
export async function toPickerProducts(
  products: ProductRow[],
  { withCost = false } = {}
): Promise<(PickerProduct & { latestCostPaisa?: number })[]> {
  const ids = products.map((p) => p.id);
  const [stock, colorStock] = await Promise.all([getStockMap(ids), getColorStockMap(ids)]);
  return products.map((p) => {
    const colors = colorsOf(p);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      size: p.size,
      variant: p.variant,
      unit: unitOf(p),
      stock: stock.get(p.id) ?? 0,
      colors,
      colorStock: Object.fromEntries(colors.map((c) => [c.id, colorStock.get(stockKey(p.id, c.id)) ?? 0])),
      ...(withCost ? { latestCostPaisa: p.latestCostPaisa } : {}),
    };
  });
}
