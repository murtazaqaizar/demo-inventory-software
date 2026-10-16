// Lump-sum payments on a customer's account (spec feature 21): recording one,
// warning when it is more than they owe, and reversing one entered by mistake.
// The server actions in customers/actions.ts call these inside a transaction.

import type { Prisma } from "@/generated/prisma/client";
import { formatPKR } from "@/lib/money";
import { refundClearedCheques } from "@/lib/billing-effects";

type Tx = Prisma.TransactionClient;

export type CustomerPaymentInput = {
  customerId: string;
  customerName: string;
  amountPaisa: number;
  method: "CASH" | "CHEQUE" | "ONLINE";
  note?: string;
  chequeNumber?: string;
  chequeBank?: string;
  chequeDate?: Date;
};

// Cash/online move money straight into an account (feature 24). A cheque goes
// into the cheque register as PENDING, linked to the payment, so it can clear
// into the bank — or bounce, which puts the amount back on the customer.
export async function recordCustomerPaymentTx(tx: Tx, p: CustomerPaymentInput) {
  const cheque =
    p.method === "CHEQUE"
      ? await tx.cheque.create({
          data: {
            number: p.chequeNumber || "(no number)",
            bank: p.chequeBank || "(bank)",
            amountPaisa: p.amountPaisa,
            chequeDate: p.chequeDate ?? new Date(),
            direction: "RECEIVED",
            status: "PENDING",
            partyName: p.customerName,
          },
          select: { id: true },
        })
      : null;

  const payment = await tx.payment.create({
    data: {
      customerId: p.customerId,
      amountPaisa: p.amountPaisa,
      method: p.method,
      chequeId: cheque?.id ?? null,
      note: p.note || "Payment received",
    },
  });

  if (p.method !== "CHEQUE") {
    const account = await tx.moneyAccount.findFirst({ where: { kind: p.method === "CASH" ? "CASH" : "BANK" } });
    if (account) {
      await tx.moneyMovement.create({
        data: { accountId: account.id, type: "CUSTOMER_PAYMENT", amountPaisa: p.amountPaisa, note: `Payment from ${p.customerName}` },
      });
    }
  }
  return payment;
}

// A payment bigger than what the customer owes leaves them in advance, and that
// advance silently settles their next bills. Usually that's a typo or a payment
// meant for someone else, so the form asks once before saving it.
export function overpaymentWarning(name: string, balancePaisa: number, amountPaisa: number): string | null {
  if (amountPaisa <= Math.max(0, balancePaisa)) return null;
  const owes = balancePaisa > 0 ? `owes only ${formatPKR(balancePaisa)}` : "owes nothing";
  return `${name} ${owes}. ${formatPKR(amountPaisa)} would leave ${formatPKR(amountPaisa - Math.max(0, balancePaisa))} as an advance that settles their next bills.`;
}

// Undo a lump-sum payment entered by mistake. The payment row goes; its money
// goes back out of the account it came into (dated now, with a note), so the
// cash book still shows both sides. A PENDING cheque is removed from the register
// (it was never presented), a CLEARED one is refunded, a BOUNCED one is left as
// the history it is.
export async function reverseCustomerPaymentTx(
  tx: Tx,
  paymentId: string
): Promise<{ ok: true; customerId: string; amountPaisa: number; method: string } | { ok: false; error: string }> {
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { cheque: true, customer: { select: { name: true } } } });
  if (!payment) return { ok: false, error: "Payment not found" };
  const note = `Payment from ${payment.customer.name} reversed`;

  if (payment.method === "CHEQUE" && payment.cheque) {
    if (payment.cheque.status === "CLEARED") await refundClearedCheques(tx, [payment.cheque.id], note);
    await tx.payment.delete({ where: { id: payment.id } });
    if (payment.cheque.status === "PENDING") await tx.cheque.delete({ where: { id: payment.cheque.id } });
  } else {
    if (payment.method === "CASH" || payment.method === "ONLINE") {
      const account = await tx.moneyAccount.findFirst({ where: { kind: payment.method === "CASH" ? "CASH" : "BANK" } });
      if (account) {
        await tx.moneyMovement.create({
          data: { accountId: account.id, type: "CUSTOMER_PAYMENT", amountPaisa: -payment.amountPaisa, note },
        });
      }
    }
    await tx.payment.delete({ where: { id: payment.id } });
  }
  return { ok: true, customerId: payment.customerId, amountPaisa: payment.amountPaisa, method: payment.method };
}
