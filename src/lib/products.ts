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
