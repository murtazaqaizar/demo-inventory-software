import { prisma } from "@/lib/prisma";

// Balance of each money account = sum of its signed movements (spec feature 24).
export async function getAccountBalances(): Promise<
  { id: string; name: string; kind: "CASH" | "BANK"; balancePaisa: number }[]
> {
  const accounts = await prisma.moneyAccount.findMany({ orderBy: { kind: "asc" } });
  const sums = await prisma.moneyMovement.groupBy({
    by: ["accountId"],
    _sum: { amountPaisa: true },
  });
  const byId = new Map(sums.map((s) => [s.accountId, s._sum.amountPaisa ?? 0]));
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    balancePaisa: byId.get(a.id) ?? 0,
  }));
}
