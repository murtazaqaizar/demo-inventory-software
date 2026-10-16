import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

// Why a return cannot be recorded against `invoiceId`, or null when it can.
//
// A return linked to a voided bill would credit the customer and restock goods
// that were never charged (the void already put the whole bill back), and one
// linked to another customer's bill would credit the wrong account. A return
// with no bill is fine — it is credited against the customer's balance.
export async function returnBillError(tx: Tx, customerId: string, invoiceId?: string | null): Promise<string | null> {
  if (!invoiceId) return null;
  const bill = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { number: true, status: true, customerId: true } });
  if (!bill) return "Bill not found.";
  if (bill.customerId !== customerId) return `Bill #${bill.number} belongs to a different customer.`;
  if (bill.status === "VOIDED") return `Bill #${bill.number} is voided — its goods are already back in stock and its charge removed.`;
  return null;
}
