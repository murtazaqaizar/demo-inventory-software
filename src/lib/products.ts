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
    select: { id: true, name: true, unit: true },
  });
}

// Include for any product query whose page shows quantities: the unit comes from the category.
export const PRODUCT_UNIT = { category: { select: { unit: true } } } as const;
