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

// Product category = a free-text tag. The distinct set across active products is the
// dropdown list; no separate table, so a category disappears when its last product does.
export async function listCategories(): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { active: true, category: { not: null } },
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category as string);
}

// Tidy typed input and reuse an existing tag's spelling (case-insensitive) so
// "cutting discs" and "Cutting Discs" never become two tags.
export async function resolveCategory(raw: string | undefined): Promise<string | null> {
  const clean = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean) return null;
  const existing = await prisma.product.findFirst({
    where: { category: { equals: clean, mode: "insensitive" } },
    select: { category: true },
  });
  return existing?.category ?? clean;
}
