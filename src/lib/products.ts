import { prisma } from "@/lib/prisma";

// Auto product code (spec feature 2): PRD-0001, PRD-0002, ... No barcode hardware;
// codes are generated and picked on screen.
export async function nextProductCode(): Promise<string> {
  const last = await prisma.product.findFirst({
    where: { code: { startsWith: "PRD-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNum = last ? parseInt(last.code.replace("PRD-", ""), 10) || 0 : 0;
  return `PRD-${String(lastNum + 1).padStart(4, "0")}`;
}

// Categories are their own records (client B feedback, 2026-10-06): each one sets
// the unit its products are counted and sold in. Managed on /categories.
export async function listCategories() {
  return prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: { select: UNIT_FIELDS } },
  });
}

// Units picked on custom (free-text) bill/return lines, by id, in one query.
export async function unitsById(ids: string[]) {
  const rows = await prisma.unit.findMany({ where: { id: { in: ids } }, select: { id: true, ...UNIT_FIELDS } });
  return new Map(rows.map((u) => [u.id, u]));
}

// The shop's own units (piece, meter, kg, dozen…), for dropdowns.
export async function listUnits() {
  return prisma.unit.findMany({
    orderBy: { name: "asc" },
    select: { id: true, ...UNIT_FIELDS },
  });
}

// Include for any product query whose page shows quantities: the unit comes from the category.
export const UNIT_FIELDS = { name: true, short: true, decimals: true } as const;
export const PRODUCT_UNIT = { category: { select: { unit: { select: UNIT_FIELDS } } } } as const;
export const COLOR_FIELDS = { id: true, name: true, hex: true } as const;
// Unit + color variants: what any screen listing products needs. Flatten with colorsOf().
export const PRODUCT_INCLUDE = {
  ...PRODUCT_UNIT,
  colors: { select: { color: { select: COLOR_FIELDS } } },
} as const;

// The shop's color list, for the product form's swatch dropdown.
export async function listColors() {
  return prisma.color.findMany({ orderBy: { name: "asc" }, select: COLOR_FIELDS });
}
