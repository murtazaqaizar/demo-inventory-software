// Bill lines, shared by bills and quotations: the form's line shape, and the
// step that turns form lines into stored lines (unit, quantity rules, color,
// cost captured). A quotation line is stored in the same shape as a bill line so
// accepting one copies its lines across unchanged.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rupeesToPaisa } from "@/lib/money";
import { PRODUCT_INCLUDE, unitsById } from "@/lib/products";
import { colorsOf, lineColorError } from "@/lib/variants";
import { PIECE, lineAmount, qtyError, toMilli, unitOf } from "@/lib/qty";
import type { SaleLine } from "@/lib/billing-effects";

// A line is either a stock line (productId set) or a CUSTOM line: free text for
// goods bought from outside for this customer (productId blank, description set).
// qty is in the line's unit and may have decimals when that unit allows them.
export const itemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().trim().max(120).optional(),
  unitId: z.string().optional(), // custom lines only (a Unit id); stock lines use the product's
  colorId: z.string().optional(), // required when the product has colors (one of them)
  qty: z.coerce.number().positive("Quantity must be more than zero"),
  rateRs: z.coerce.number().min(0).default(0),
  costRs: z.coerce.number().min(0).optional(), // custom lines only: what it cost you
  isSample: z.boolean().default(false),
});

export type BuiltLine = SaleLine & { name: string };

// Resolve form lines into stored lines: unit from the product's category (or the
// custom line's own pick), quantity checked against that unit, cost captured.
export async function buildLines(
  items: z.infer<typeof itemSchema>[]
): Promise<{ lines: BuiltLine[] } | { error: string }> {
  const ids = items.map((i) => i.productId).filter((id): id is string => Boolean(id));
  const [products, customUnits] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: ids } }, include: PRODUCT_INCLUDE }),
    unitsById(items.map((i) => i.unitId).filter((id): id is string => Boolean(id))),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines: BuiltLine[] = [];
  for (const it of items) {
    const qtyMilli = toMilli(it.qty);
    const ratePaisa = it.isSample ? 0 : rupeesToPaisa(it.rateRs);
    if (it.productId) {
      const product = byId.get(it.productId);
      if (!product) return { error: "Unknown product on a line." };
      const unit = unitOf(product);
      const e = qtyError(qtyMilli, unit);
      if (e) return { error: `${product.name}: ${e}` };
      const colors = colorsOf(product);
      const colorId = it.colorId || null;
      const ce = lineColorError(product.name, colors.map((c) => c.id), colorId);
      if (ce) return { error: ce };
      const colorName = colors.find((c) => c.id === colorId)?.name;
      lines.push({
        productId: product.id,
        description: null,
        unit: unit.short,
        qtyMilli,
        colorId,
        ratePaisa,
        unitCostPaisa: product.latestCostPaisa,
        isSample: it.isSample,
        name: colorName ? `${product.name} (${colorName})` : product.name,
      });
    } else {
      if (!it.description) return { error: "A custom item needs a name." };
      const unit = (it.unitId && customUnits.get(it.unitId)) || PIECE;
      const e = qtyError(qtyMilli, unit);
      if (e) return { error: `${it.description}: ${e}` };
      lines.push({
        productId: null,
        description: it.description,
        unit: unit.short,
        qtyMilli,
        colorId: null,
        ratePaisa,
        unitCostPaisa: it.costRs ? rupeesToPaisa(it.costRs) : 0,
        isSample: it.isSample,
        name: it.description,
      });
    }
  }
  return { lines };
}

export const billTotal = (lines: { qtyMilli: number; ratePaisa: number; isSample: boolean }[]) =>
  lines.reduce((s, l) => s + (l.isSample ? 0 : lineAmount(l.qtyMilli, l.ratePaisa)), 0);

// Rate below cost (feature 15). Custom lines count only when a cost was typed.
export const belowCostNames = (lines: BuiltLine[]) =>
  lines.filter((l) => !l.isSample && l.unitCostPaisa > 0 && l.ratePaisa < l.unitCostPaisa).map((l) => l.name);

export const itemRows = (lines: BuiltLine[]) =>
  lines.map((l) => ({
    productId: l.productId,
    description: l.description,
    unit: l.unit,
    qtyMilli: l.qtyMilli,
    colorId: l.colorId,
    ratePaisa: l.ratePaisa,
    unitCostPaisa: l.unitCostPaisa,
    isSample: l.isSample,
  }));
