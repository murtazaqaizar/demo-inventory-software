"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { TX_OPTIONS } from "@/lib/tx";
import { requireUserApi } from "@/lib/guards";
import { rupeesToPaisa, formatPKR } from "@/lib/money";
import { PRODUCT_UNIT, unitsById } from "@/lib/products";
import { PIECE, lineAmount, qtyError, toMilli, unitOf } from "@/lib/qty";
import { audit } from "@/lib/audit";

export type ReturnResult =
  | { ok: true; creditNoteId: string; number: number }
  | { ok: false; error?: string };

// Stock line (productId set): goods come back onto the shelf, in the product's unit.
// Custom line (productId blank): credits a free-text bill line — money only, never stock.
const itemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().trim().max(120).optional(),
  unitId: z.string().optional(), // custom lines only (a Unit id); stock lines use the product's
  qty: z.coerce.number().positive("Quantity must be more than zero"),
  rateRs: z.coerce.number().min(0).default(0),
  costRs: z.coerce.number().min(0).optional(), // custom lines only
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

    const ids = d.items.map((i) => i.productId).filter((id): id is string => Boolean(id));
    const [products, customUnits] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: ids } }, include: PRODUCT_UNIT }),
      unitsById(d.items.map((i) => i.unitId).filter((id): id is string => Boolean(id))),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));

    const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
    if (!customer) return { ok: false, error: "Customer not found." };

    type Line = {
      productId: string | null;
      description: string | null;
      unit: string; // short label snapshot
      qtyMilli: number;
      ratePaisa: number;
      unitCostPaisa: number;
    };
    const lines: Line[] = [];
    for (const it of d.items) {
      const qtyMilli = toMilli(it.qty);
      if (it.productId) {
        const product = byId.get(it.productId);
        if (!product) return { ok: false, error: "Unknown product on a line." };
        const unit = unitOf(product);
        const e = qtyError(qtyMilli, unit);
        if (e) return { ok: false, error: `${product.name}: ${e}` };
        lines.push({
          productId: product.id,
          description: null,
          unit: unit.short,
          qtyMilli,
          ratePaisa: rupeesToPaisa(it.rateRs),
          unitCostPaisa: product.latestCostPaisa,
        });
      } else {
        if (!it.description) return { ok: false, error: "A custom item needs a name." };
        const unit = (it.unitId && customUnits.get(it.unitId)) || PIECE;
        const e = qtyError(qtyMilli, unit);
        if (e) return { ok: false, error: `${it.description}: ${e}` };
        lines.push({
          productId: null,
          description: it.description,
          unit: unit.short,
          qtyMilli,
          ratePaisa: rupeesToPaisa(it.rateRs),
          unitCostPaisa: it.costRs ? rupeesToPaisa(it.costRs) : 0,
        });
      }
    }
    const total = lines.reduce((s, l) => s + lineAmount(l.qtyMilli, l.ratePaisa), 0);

    const result = await prisma.$transaction(async (tx) => {
      const note = await tx.creditNote.create({
        data: {
          customerId: d.customerId,
          invoiceId: d.invoiceId || null,
          refundMethod: d.refundMethod,
          reason: d.reason || null,
          createdById: user.id,
          items: { create: lines },
        },
      });

      // Goods come back into stock at the cost they left at. One insert for every
      // line — a create per line is what blew the transaction limit on purchases.
      // Custom lines were never in stock, so only product lines come back.
      const stocked = lines.filter((l): l is Line & { productId: string } => l.productId !== null);
      if (stocked.length > 0) await tx.stockMovement.createMany({
        data: stocked.map((l) => ({
          productId: l.productId,
          type: "RETURN_IN" as const,
          qtyMilli: l.qtyMilli,
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
