"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { TX_OPTIONS } from "@/lib/tx";
import { requireOwnerApi } from "@/lib/guards";
import { formatPKR, rupeesToPaisa } from "@/lib/money";
import {
  allocateLandedCost,
  applyPurchaseEffects,
  findShortProducts,
  recomputeLatestCosts,
  reversePurchaseEffects,
  stockDelta,
} from "@/lib/purchasing";
import { audit } from "@/lib/audit";
import { qtyError, toMilli, type Unit } from "@/lib/qty";

// `purchaseId` is returned on create so the form can send you straight to the
// new purchase's detail page instead of back to the list.
export type ActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  purchaseId?: string;
};

const itemSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().positive("Quantity must be more than zero"), // in the product's unit
  unitCostRs: z.coerce.number().min(0),
});

const purchaseSchema = z.object({
  supplierId: z.string().optional(),
  isImport: z.coerce.boolean().default(false),
  onCredit: z.coerce.boolean().default(false),
  freightRs: z.coerce.number().min(0).default(0),
  dutyRs: z.coerce.number().min(0).default(0),
  clearingRs: z.coerce.number().min(0).default(0),
  transportRs: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "Add at least one line"),
});

const editPurchaseSchema = purchaseSchema.extend({ purchaseId: z.string().min(1) });

// Landed-cost extras (spec feature 8), allocated across lines BY VALUE.
function computeLines(d: z.infer<typeof purchaseSchema>) {
  const extrasPaisa =
    rupeesToPaisa(d.freightRs) +
    rupeesToPaisa(d.dutyRs) +
    rupeesToPaisa(d.clearingRs) +
    rupeesToPaisa(d.transportRs);

  return allocateLandedCost(
    d.items.map((it) => ({
      productId: it.productId,
      qtyMilli: toMilli(it.qty),
      supplierUnitCostPaisa: rupeesToPaisa(it.unitCostRs),
    })),
    extrasPaisa
  );
}

// Each line's quantity must suit its product's unit: whole pieces, up to 3 decimals
// for meter/feet. Returns an error message naming the product, or null.
async function lineUnitError(items: { productId: string; qty: number }[]): Promise<string | null> {
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    select: { id: true, name: true, category: { select: { unit: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const it of items) {
    const p = byId.get(it.productId);
    if (!p) return "A product on this purchase no longer exists";
    const e = qtyError(toMilli(it.qty), (p.category?.unit as Unit | undefined) ?? "PIECE");
    if (e) return `${p.name}: ${e}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createPurchase(input: unknown): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi(); // purchases carry cost — OWNER only
    const parsed = purchaseSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const d = parsed.data;

    if (d.onCredit && !d.supplierId) {
      return { ok: false, error: "Credit purchases need a supplier." };
    }
    const unitErr = await lineUnitError(d.items);
    if (unitErr) return { ok: false, error: unitErr };

    const { lines: computed, totalValuePaisa: totalValue } = computeLines(d);

    const created = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          supplierId: d.supplierId || null,
          isImport: d.isImport,
          onCredit: d.onCredit,
          freightPaisa: rupeesToPaisa(d.freightRs),
          dutyPaisa: rupeesToPaisa(d.dutyRs),
          clearingPaisa: rupeesToPaisa(d.clearingRs),
          transportPaisa: rupeesToPaisa(d.transportRs),
          notes: d.notes || null,
        },
      });

      await applyPurchaseEffects(tx, purchase, computed, totalValue);
      await recomputeLatestCosts(tx, computed.map((c) => c.productId));
      return purchase;
    }, TX_OPTIONS);

    await audit(
      { id: user.id, username: user.username },
      "PURCHASE_CREATE",
      "Purchase",
      created.id,
      `Recorded purchase #${created.number} — ${computed.length} line(s), goods value ${formatPKR(totalValue)}`
    );

    revalidatePath("/purchases");
    revalidatePath("/products");
    revalidatePath("/suppliers");
    return { ok: true, purchaseId: created.id };
}, (error) => ({ ok: false, error }));
}

// Edit = reverse the old effects and re-apply the new ones in one transaction,
// so stock, landed cost and the payable all end up matching the corrected entry.
export async function updatePurchase(input: unknown): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const parsed = editPurchaseSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const d = parsed.data;

    if (d.onCredit && !d.supplierId) {
      return { ok: false, error: "Credit purchases need a supplier." };
    }
    const unitErr = await lineUnitError(d.items);
    if (unitErr) return { ok: false, error: unitErr };

    const existing = await prisma.purchase.findUnique({
      where: { id: d.purchaseId },
      include: { items: true },
    });
    if (!existing) return { ok: false, error: "Purchase not found" };

    const { lines: computed, totalValuePaisa: totalValue } = computeLines(d);

    const delta = stockDelta(existing.items, computed);
    const short = await findShortProducts(prisma, delta);
    if (short.length > 0) {
      return {
        ok: false,
        error: `Those pieces are already sold, so stock would go negative for: ${short.join(", ")}. Void the bills or adjust stock first.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      await reversePurchaseEffects(tx, existing);

      const purchase = await tx.purchase.update({
        where: { id: d.purchaseId },
        data: {
          supplierId: d.supplierId || null,
          isImport: d.isImport,
          onCredit: d.onCredit,
          freightPaisa: rupeesToPaisa(d.freightRs),
          dutyPaisa: rupeesToPaisa(d.dutyRs),
          clearingPaisa: rupeesToPaisa(d.clearingRs),
          transportPaisa: rupeesToPaisa(d.transportRs),
          notes: d.notes || null,
        },
      });

      await applyPurchaseEffects(tx, purchase, computed, totalValue);

      // Both the products that left the purchase and the ones now on it.
      await recomputeLatestCosts(tx, [...delta.keys()]);
    }, TX_OPTIONS);

    await audit(
      { id: user.id, username: user.username },
      "PURCHASE_EDIT",
      "Purchase",
      d.purchaseId,
      `Edited purchase #${existing.number} — now ${computed.length} line(s), goods value ${formatPKR(totalValue)}`
    );

    revalidatePath("/purchases");
    revalidatePath(`/purchases/${d.purchaseId}`);
    revalidatePath("/products");
    revalidatePath("/suppliers");
    revalidatePath("/reports");
    return { ok: true, purchaseId: d.purchaseId };
}, (error) => ({ ok: false, error }));
}

// Delete = full reversal. Stock goes back out, the payable is removed and the
// latest cost falls back to the previous purchase.
export async function deletePurchase(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const purchaseId = String(formData.get("purchaseId") ?? "");
    if (!purchaseId) return { ok: false, error: "Missing purchase" };

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { items: true, supplier: true },
    });
    if (!purchase) return { ok: false, error: "Purchase not found" };

    const delta = stockDelta(purchase.items);
    const short = await findShortProducts(prisma, delta);
    if (short.length > 0) {
      return {
        ok: false,
        error: `Those pieces are already sold, so stock would go negative for: ${short.join(", ")}. Void the bills or adjust stock first.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      await reversePurchaseEffects(tx, purchase);
      await tx.purchase.delete({ where: { id: purchaseId } });
      await recomputeLatestCosts(tx, [...delta.keys()]);
    }, TX_OPTIONS);

    await audit(
      { id: user.id, username: user.username },
      "PURCHASE_DELETE",
      "Purchase",
      purchaseId,
      `Deleted purchase #${purchase.number} (${purchase.supplier?.name ?? "cash purchase"}) — stock and payable reversed`
    );

    revalidatePath("/purchases");
    revalidatePath("/products");
    revalidatePath("/suppliers");
    revalidatePath("/reports");
    return { ok: true, message: "Purchase deleted and its stock reversed." };
}, (error) => ({ ok: false, error }));
}
