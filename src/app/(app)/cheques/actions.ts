"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { TX_OPTIONS } from "@/lib/tx";
import { requireOwnerApi } from "@/lib/guards";
import { rupeesToPaisa } from "@/lib/money";

export type ActionResult = { ok: boolean; error?: string };

const chequeSchema = z.object({
  number: z.string().min(1, "Cheque number is required"),
  bank: z.string().min(1, "Bank is required"),
  amountRs: z.coerce.number().positive("Enter an amount"),
  chequeDate: z.string().optional(),
  direction: z.enum(["RECEIVED", "ISSUED"]),
  partyName: z.string().optional(),
});

export async function createCheque(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireOwnerApi();
    const parsed = chequeSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const d = parsed.data;
    await prisma.cheque.create({
      data: {
        number: d.number,
        bank: d.bank,
        amountPaisa: rupeesToPaisa(d.amountRs),
        chequeDate: d.chequeDate ? new Date(d.chequeDate) : new Date(),
        direction: d.direction,
        status: "PENDING",
        partyName: d.partyName || null,
      },
    });
    revalidatePath("/cheques");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

const statusSchema = z.object({
  chequeId: z.string().min(1),
  status: z.enum(["CLEARED", "BOUNCED"]),
  // Where the money landed when cleared: cashed at the bank counter (CASH in hand)
  // or deposited to the bank account. Ignored on BOUNCE.
  destination: z.enum(["CASH", "BANK"]).default("BANK"),
});

// Follow a cheque to cleared/bounced (feature 23). On CLEAR, move money in/out of the
// bank account (received = inflow, issued = outflow). BOUNCE moves nothing.
export async function setChequeStatus(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireOwnerApi();
    const parsed = statusSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    const { chequeId, status, destination } = parsed.data;

    const cheque = await prisma.cheque.findUnique({ where: { id: chequeId } });
    if (!cheque) return { ok: false, error: "Cheque not found" };
    if (cheque.status !== "PENDING") return { ok: false, error: "Cheque is not pending" };

    await prisma.$transaction(async (tx) => {
      await tx.cheque.update({
        where: { id: chequeId },
        data: { status, clearedAt: status === "CLEARED" ? new Date() : null },
      });
      if (status === "CLEARED") {
        // Cash the cheque into hand, or deposit it to the bank — the owner chooses.
        const account = await tx.moneyAccount.findFirst({ where: { kind: destination } });
        if (account) {
          await tx.moneyMovement.create({
            data: {
              accountId: account.id,
              type: "CHEQUE_CLEAR",
              amountPaisa: cheque.direction === "RECEIVED" ? cheque.amountPaisa : -cheque.amountPaisa,
              note: `Cheque ${cheque.number} (${cheque.direction}) → ${destination === "CASH" ? "cash" : "bank"}`,
            },
          });
        }
      }
    }, TX_OPTIONS);
    revalidatePath("/cheques");
    revalidatePath("/cash-bank");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}
