"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { PRODUCT_UNIT, UNIT_FIELDS, nextProductCode } from "@/lib/products";
import { requireUserApi, requireOwnerApi } from "@/lib/guards";
import { rupeesToPaisa } from "@/lib/money";
import { audit } from "@/lib/audit";
import { PIECE, formatQtyUnit, qtyError, toMilli, unitOf, type Unit } from "@/lib/qty";

// Quantities arrive as typed text ("16000", "2.5") in the category's unit and are
// stored as thousandths (src/lib/qty.ts). Blank = 0.
const qtyText = z.string().optional().transform((s) => (s && s.trim() ? toMilli(s) : 0));

const productFields = {
  name: z.string().trim().min(1, "Name is required"),
  size: z.string().optional(),
  variant: z.string().optional(),
  colorId: z.string().optional(),
  categoryId: z.string().optional(),
  minStock: qtyText,
};

const productSchema = z.object({
  ...productFields,
  initialStock: qtyText,
  initialCostRs: z.coerce.number().min(0).default(0),
});

export type ActionResult = { ok: boolean; error?: string; message?: string };

// A color must be one of the shop's list; anything else (stale form) becomes none.
async function colorIdOrNull(raw: string | undefined): Promise<string | null> {
  const id = clean(raw);
  if (!id) return null;
  const hit = await prisma.color.findUnique({ where: { id }, select: { id: true } });
  return hit?.id ?? null;
}

// The unit a product is counted in comes from its category; none = by the piece.
async function unitForCategory(categoryId: string | null): Promise<Unit> {
  if (!categoryId) return PIECE;
  const c = await prisma.category.findUnique({ where: { id: categoryId }, select: { unit: { select: UNIT_FIELDS } } });
  return c?.unit ?? PIECE;
}

function clean(s: string | undefined) {
  const t = (s ?? "").trim();
  return t ? t : null;
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireUserApi(); // staff may add products/stock
    const parsed = productSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const d = parsed.data;
    const categoryId = clean(d.categoryId);
    const unit = await unitForCategory(categoryId);

    if (d.initialStock) {
      const e = qtyError(d.initialStock, unit);
      if (e) return { ok: false, error: `Opening stock: ${e}` };
    }
    const minErr = qtyError(d.minStock, unit, { allowZero: true });
    if (minErr) return { ok: false, error: `Low-stock level: ${minErr}` };

    const code = await nextProductCode();
    await prisma.product.create({
      data: {
        code,
        name: d.name,
        size: clean(d.size),
        variant: clean(d.variant),
        colorId: await colorIdOrNull(d.colorId),
        categoryId,
        minStockMilli: d.minStock,
        latestCostPaisa: rupeesToPaisa(d.initialCostRs),
        // First stock count (spec feature 34 note) recorded as an ADJUST movement.
        movements:
          d.initialStock > 0
            ? {
                create: {
                  type: "ADJUST",
                  qtyMilli: d.initialStock,
                  unitCostPaisa: rupeesToPaisa(d.initialCostRs),
                  reason: "Opening stock count",
                },
              }
            : undefined,
      },
    });

    revalidatePath("/products");
    return { ok: true };
  }, (error) => ({ ok: false, error }));
}

const movementSchema = z.object({
  productId: z.string().min(1),
  kind: z.enum(["ADJUST", "RETURN_IN", "SAMPLE_OUT"]),
  qty: z.string().min(1, "Enter a quantity"),
  reason: z.string().optional(),
});

// One control for the three hand-entered movements:
//  - RETURN_IN: customer return back into stock (feature 6) → +qty
//  - SAMPLE_OUT: free sample / bonus (feature 18) → −qty, cost still captured
//  - ADJUST: manual correction → signed qty
export async function recordMovement(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const parsed = movementSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    const { productId, kind, qty, reason } = parsed.data;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: PRODUCT_UNIT,
    });
    if (!product) return { ok: false, error: "Product not found" };
    const unit = unitOf(product);

    const milli = toMilli(qty);
    const e = qtyError(Math.abs(milli), unit);
    if (e) return { ok: false, error: e };

    const delta =
      kind === "RETURN_IN" ? Math.abs(milli) : kind === "SAMPLE_OUT" ? -Math.abs(milli) : milli;

    const defaultReason =
      kind === "RETURN_IN" ? "Customer return" : kind === "SAMPLE_OUT" ? "Free sample / bonus" : "Manual adjustment";

    await prisma.stockMovement.create({
      data: {
        productId,
        type: kind,
        qtyMilli: delta,
        // cost captured so profit stays honest even on samples/returns (feature 18)
        unitCostPaisa: product.latestCostPaisa,
        reason: reason || defaultReason,
      },
    });

    await audit(
      { id: user.id, username: user.username },
      "STOCK_MOVEMENT",
      "Product",
      productId,
      `${defaultReason}: ${delta > 0 ? "+" : "−"}${formatQtyUnit(Math.abs(delta), unit)} of ${product.name}${reason ? ` — ${reason}` : ""}`
    );

    revalidatePath("/products");
    revalidatePath("/");
    return { ok: true };
  }, (error) => ({ ok: false, error }));
}

// --- Edit an existing product (client request) ----------------------------
const editSchema = z.object({
  productId: z.string().min(1),
  ...productFields,
  latestCostRs: z.coerce.number().min(0).optional(),
});

export async function updateProduct(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const parsed = editSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const d = parsed.data;

    const existing = await prisma.product.findUnique({
      where: { id: d.productId },
      include: PRODUCT_UNIT,
    });
    if (!existing) return { ok: false, error: "Product not found" };

    const categoryId = clean(d.categoryId);
    const oldUnit = unitOf(existing);
    const newUnit = await unitForCategory(categoryId);

    // Moving to a category with a different unit would reinterpret the stock already
    // counted (200 pieces would become 200 m). Only allowed before any stock moves.
    if (newUnit.short !== oldUnit.short) {
      const history = await prisma.stockMovement.count({ where: { productId: d.productId } });
      if (history > 0) {
        return {
          ok: false,
          error: `This product's stock is counted in ${oldUnit.name} (${oldUnit.short}), so it can only move to a category with the same unit. Add a new product for the ${newUnit.name} version instead.`,
        };
      }
    }
    const minErr = qtyError(d.minStock, newUnit, { allowZero: true });
    if (minErr) return { ok: false, error: `Low-stock level: ${minErr}` };

    await prisma.product.update({
      where: { id: d.productId },
      data: {
        name: d.name,
        size: clean(d.size),
        variant: clean(d.variant),
        colorId: await colorIdOrNull(d.colorId),
        categoryId,
        minStockMilli: d.minStock,
        // Only the owner may change cost; staff edits leave it untouched.
        ...(user.role === "OWNER" && d.latestCostRs !== undefined
          ? { latestCostPaisa: rupeesToPaisa(d.latestCostRs) }
          : {}),
      },
    });

    await audit({ id: user.id, username: user.username }, "PRODUCT_EDIT", "Product", d.productId, `Edited product ${existing.code} — ${d.name}`);
    revalidatePath("/products");
    return { ok: true };
  }, (error) => ({ ok: false, error }));
}

// --- Delete a product -----------------------------------------------------
// Hard-delete only if it has never been used; otherwise deactivate (hide) it so
// bills, purchases and profit history stay intact.
export async function deleteProduct(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const productId = String(formData.get("productId") ?? "");
    if (!productId) return { ok: false, error: "Missing product" };

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return { ok: false, error: "Product not found" };

    const [movements, invoiceItems, purchaseItems] = await Promise.all([
      prisma.stockMovement.count({ where: { productId } }),
      prisma.invoiceItem.count({ where: { productId } }),
      prisma.purchaseItem.count({ where: { productId } }),
    ]);
    const used = movements + invoiceItems + purchaseItems > 0;

    if (used) {
      await prisma.product.update({ where: { id: productId }, data: { active: false } });
      await audit({ id: user.id, username: user.username }, "PRODUCT_HIDE", "Product", productId, `Hid product ${product.code} (has history)`);
      revalidatePath("/products");
      return { ok: true, message: `${product.name} had history, so it was hidden instead of deleted.` };
    }

    await prisma.product.delete({ where: { id: productId } });
    await audit({ id: user.id, username: user.username }, "PRODUCT_DELETE", "Product", productId, `Deleted product ${product.code} — ${product.name}`);
    revalidatePath("/products");
    return { ok: true, message: `${product.name} deleted.` };
  }, (error) => ({ ok: false, error }));
}
