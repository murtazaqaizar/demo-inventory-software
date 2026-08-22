"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { requireOwnerApi } from "@/lib/guards";
import { rupeesToPaisa } from "@/lib/money";

export type ActionResult = { ok: boolean; error?: string };

const drawingSchema = z.object({
  accountId: z.string().min(1),
  amountRs: z.coerce.number().positive("Enter an amount"),
  note: z.string().optional(),
});

// Owner withdrawal (spec feature 25): reduces money, excluded from expenses/profit.
export async function recordDrawing(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireOwnerApi();
    const parsed = drawingSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    await prisma.moneyMovement.create({
      data: {
        accountId: parsed.data.accountId,
        type: "DRAWING",
        amountPaisa: -rupeesToPaisa(parsed.data.amountRs),
        note: parsed.data.note || "Owner withdrawal",
      },
    });
    revalidatePath("/cash-bank");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

const transferSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amountRs: z.coerce.number().positive("Enter an amount"),
});

export async function recordTransfer(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireOwnerApi();
    const parsed = transferSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const { fromAccountId, toAccountId, amountRs } = parsed.data;
    if (fromAccountId === toAccountId) return { ok: false, error: "Pick two different accounts" };
    const amountPaisa = rupeesToPaisa(amountRs);
    await prisma.$transaction([
      prisma.moneyMovement.create({
        data: { accountId: fromAccountId, type: "TRANSFER", amountPaisa: -amountPaisa, note: "Transfer out" },
      }),
      prisma.moneyMovement.create({
        data: { accountId: toAccountId, type: "TRANSFER", amountPaisa: amountPaisa, note: "Transfer in" },
      }),
    ]);
    revalidatePath("/cash-bank");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

const adjustSchema = z.object({
  accountId: z.string().min(1),
  amountRs: z.coerce.number(),
  note: z.string().optional(),
});

// Opening balance / manual correction for an account (signed).
export async function adjustAccount(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireOwnerApi();
    const parsed = adjustSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    if (parsed.data.amountRs === 0) return { ok: false, error: "Enter a non-zero amount" };
    await prisma.moneyMovement.create({
      data: {
        accountId: parsed.data.accountId,
        type: "ADJUST",
        amountPaisa: rupeesToPaisa(parsed.data.amountRs),
        note: parsed.data.note || "Opening / adjustment",
      },
    });
    revalidatePath("/cash-bank");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}
