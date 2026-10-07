// Color variants (client B, 2026-10-07): one product, stock tracked per color.
// A product either has colors — then every stock line names one of them — or it
// has none, and its lines never carry a color. Safe to import from client code.

export type ColorRef = { id: string; name: string; hex: string };

/** Map key for per-color stock: product + color ("" = no color). */
export const stockKey = (productId: string, colorId: string | null | undefined) =>
  `${productId}|${colorId ?? ""}`;

/** Flatten Prisma's `colors: [{ color }]` into a name-sorted list. */
export function colorsOf(product: { colors?: { color: ColorRef }[] | null }): ColorRef[] {
  return (product.colors ?? []).map((c) => c.color).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Server-side check that a line's color fits its product. Returns an error message
 * naming the product, or null when fine.
 */
export function lineColorError(
  productName: string,
  productColorIds: string[],
  colorId: string | null | undefined
): string | null {
  if (productColorIds.length === 0) return colorId ? `${productName} has no colors to pick from.` : null;
  if (!colorId) return `${productName}: pick a color.`;
  if (!productColorIds.includes(colorId)) return `${productName}: that color isn't one of its colors.`;
  return null;
}
