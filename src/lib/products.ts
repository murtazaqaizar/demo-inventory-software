import { prisma } from "@/lib/prisma";

// Auto product code (spec feature 2): ABR-0001, ABR-0002, ... No barcode hardware;
// codes are generated and picked on screen.
export async function nextProductCode(): Promise<string> {
  const last = await prisma.product.findFirst({
    where: { code: { startsWith: "ABR-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNum = last ? parseInt(last.code.replace("ABR-", ""), 10) || 0 : 0;
  return `ABR-${String(lastNum + 1).padStart(4, "0")}`;
}

// Product category = a free-text tag. This is the distinct set IN USE across active
// products — it drives the filter chips on the Products page. The form's dropdown
// uses listProductTags() instead, which also includes tags no product has yet.
export async function listCategories(): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { active: true, category: { not: null } },
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category as string);
}

export type ProductTagRow = { id: string; name: string; productCount: number };

// The managed tag list (ProductTag table) — what the product form's dropdown offers.
// Tags created on the Tags screen show here even before any product uses them.
export async function listProductTags(): Promise<string[]> {
  try {
    const rows = await prisma.productTag.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { name: true },
    });
    return rows.map((r) => r.name);
  } catch {
    // Table not there yet (migration pending) — fall back to the tags in use.
    return listCategories();
  }
}

// For the Tags screen: each active tag with how many active products carry it.
export async function listProductTagsWithCounts(): Promise<ProductTagRow[]> {
  const [tags, counts] = await Promise.all([
    prisma.productTag.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.groupBy({
      by: ["category"],
      where: { active: true, category: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const byName = new Map(counts.map((c) => [c.category as string, c._count._all]));
  return tags.map((t) => ({ ...t, productCount: byName.get(t.name) ?? 0 }));
}

export const cleanTagName = (raw: string | undefined) =>
  (raw ?? "").trim().replace(/\s+/g, " ").slice(0, 40);

// Tidy typed input and reuse an existing tag's spelling (case-insensitive) so
// "cutting discs" and "Cutting Discs" never become two tags. A brand-new name
// typed in the product form is added to the tag list too, so it is offered next time.
export async function resolveCategory(raw: string | undefined): Promise<string | null> {
  const clean = cleanTagName(raw);
  if (!clean) return null;

  const tag = await prisma.productTag.findFirst({
    where: { name: { equals: clean, mode: "insensitive" } },
  });
  if (tag) {
    if (!tag.active) await prisma.productTag.update({ where: { id: tag.id }, data: { active: true } });
    return tag.name;
  }

  const existing = await prisma.product.findFirst({
    where: { category: { equals: clean, mode: "insensitive" } },
    select: { category: true },
  });
  const name = existing?.category ?? clean;
  // upsert, not create: two people saving the same new tag at once must not clash.
  await prisma.productTag.upsert({ where: { name }, update: { active: true }, create: { name } });
  return name;
}
