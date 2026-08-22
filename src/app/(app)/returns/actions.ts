"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { TX_OPTIONS } from "@/lib/tx";
import { requireUserApi } from "@/lib/guards";
import { rupeesToPaisa, formatPKR } from "@/lib/money";
import { piecesFor } from "@/lib/stock";
import { audit } from "@/lib/audit";

export type ReturnResult =
  | { ok: true; creditNoteId: string; number: number }
  | { ok: false; error?: string };

const itemSchema = z.object({
  productId: z.string().min(1),
  unit: z.enum(["PIECE", "BOX", "CARTON"]).default("PIECE"),
  quantity: z.coerce.number().int().positive(),
  rateRs: z.coerce.number().min(0).default(0),
});

const schema = z.object({
  customerId: z.string().min(1),
  invoiceId: z.string().optional(),
  refundMethod: z.enum(["CREDIT_TO_ACCOUNT", "CASH_REFUND"]).default("CREDIT_TO_ACCOUNT"),
  reason: z.string().optional(),
  items: z.array(itemSchema).min(1, "Add at least one line"),
});

// A return puts goods back into stock AND settles the money — either as credit on the
// customer's account or a cash refund (improvement 3). Previously stock moved but the
// ledger was left wrong.
export async function createReturn(input: unknown): Promise<ReturnResult> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const d = parsed.data;

    const products = await prisma.product.findMany({
      where: { id: { in: d.items.map((i) => i.productId) } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    if (d.items.some((i) => !byId.has(i.productId))) {
      return { ok: false, error: "Unknown product on a line." };
    }

    const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
    if (!customer) return { ok: false, error: "Customer not found." };

    const lines = d.items.map((it) => {
      const product = byId.get(it.productId)!;
      return {
        ...it,
        pieces: piecesFor(it.unit, it.quantity, product),
        ratePaisa: rupeesToPaisa(it.rateRs),
        unitCostPaisa: product.latestCostPaisa,
      };
    });
    const total = lines.reduce((s, l) => s + l.ratePaisa * l.quantity, 0);

    const result = await prisma.$transaction(async (tx) => {
      const note = await tx.creditNote.create({
        data: {
          customerId: d.customerId,
          invoiceId: d.invoiceId || null,
          refundMethod: d.refundMethod,
          reason: d.reason || null,
          createdById: user.id,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              unit: l.unit,
              quantity: l.quantity,
              pieces: l.pieces,
              ratePaisa: l.ratePaisa,
              unitCostPaisa: l.unitCostPaisa,
            })),
          },
        },
      });

      // Goods come back into stock at the cost they left at. One insert for every
      // line — a create per line is what blew the transaction limit on purchases.
      await tx.stockMovement.createMany({
        data: lines.map((l) => ({
          productId: l.productId,
          type: "RETURN_IN" as const,
          piecesDelta: l.pieces,
          unitCostPaisa: l.unitCostPaisa,
          reason: `Return — credit note #${note.number}`,
          creditNoteId: note.id,
        })),
      });

      // Cash refund physically pays money out. Account credit just reduces the balance
      // (handled by the receivables engine, no money movement needed).
      if (d.refundMethod === "CASH_REFUND" && total > 0) {
        const cash = await tx.moneyAccount.findFirst({ where: { kind: "CASH" } });
        if (cash) {
          await tx.moneyMovement.create({
            data: {
              accountId: cash.id,
              type: "REFUND",
              amountPaisa: -total,
              note: `Refund on credit note #${note.number}`,
            },
          });
        }
      }

      return { id: note.id, number: note.number };
    }, TX_OPTIONS);

    await audit(
      { id: user.id, username: user.username },
      "RETURN_CREATE",
      "CreditNote",
      result.id,
      `Return #${result.number} from ${customer.name} — ${formatPKR(total)} (${
        d.refundMethod === "CASH_REFUND" ? "cash refund" : "credit to account"
      })`
    );

    revalidatePath("/returns");
    revalidatePath("/products");
    revalidatePath("/customers");
    revalidatePath("/");
    return { ok: true, creditNoteId: result.id, number: result.number };
}, (error) => ({ ok: false as const, error }));
}
