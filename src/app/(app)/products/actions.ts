"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { PRODUCT_INCLUDE, UNIT_FIELDS, nextProductCode } from "@/lib/products";
import { requireUserApi, requireOwnerApi } from "@/lib/guards";
import { rupeesToPaisa } from "@/lib/money";
import { audit } from "@/lib/audit";
import { PIECE, formatQtyUnit, qtyError, toMilli, unitOf, type Unit } from "@/lib/qty";
import { colorsOf, lineColorError, stockKey } from "@/lib/variants";
import { getColorStockMap } from "@/lib/stock";

// Quantities arrive as typed text ("16000", "2.5") in the category's unit and are
// stored as thousandths (src/lib/qty.ts). Blank = 0.
const qtyText = z.string().optional().transform((s) => (s && s.trim() ? toMilli(s) : 0));

const productFields = {
  size: z.string().optional(),
  variant: z.string().optional(),
  categoryId: z.string().min(1, "Pick a category"),
  minStock: qtyText,
};

const productSchema = z.object({
  ...productFields,
  initialStock: qtyText,
  initialCostRs: z.coerce.number().min(0).default(0),
});

export type ActionResult = { ok: boolean; error?: string; message?: string };

// Color variants ticked on the form (checkboxes named "colorIds"), kept only if they
// are in the shop's list — a stale form can't attach a deleted color.
async function chosenColorIds(formData: FormData): Promise<string[]> {
  const ids = [...new Set(formData.getAll("colorIds").map(String).filter(Boolean))];
  if (ids.length === 0) return [];
  const rows = await prisma.color.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return rows.map((r) => r.id);
}

// The unit a product is counted in comes from its category; none = by the piece.
async function unitForCategory(categoryId: string | null): Promise<Unit> {
  if (!categoryId) return PIECE;
  const c = await prisma.category.findUnique({ where: { id: categoryId }, select: { unit: { select: UNIT_FIELDS } } });
  return c?.unit ?? PIECE;
}

// Products have no name of their own (client B, 2026-10-08): the category is the
// product, and size + variant tell items apart. `Product.name` stores the category's
// name so every screen, search and report keeps reading it unchanged; renaming a
// category renames its products (categories/actions.ts).
async function nameAndClash(
  categoryId: string,
  size: string | null,
  variant: string | null,
  exceptId?: string
): Promise<{ name: string } | { error: string }> {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { name: true } });
  if (!category) return { error: "That category no longer exists. Refresh the page." };
  // Same category + size + variant would print identically on a bill.
  const twin = await prisma.product.findFirst({
    where: {
      active: true,
      categoryId,
      size: size ? { equals: size, mode: "insensitive" } : null,
      variant: variant ? { equals: variant, mode: "insensitive" } : null,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { code: true },
  });
  if (twin) {
    return {
      error: `${category.name}${size ? " " + size : ""}${variant ? " · " + variant : ""} already exists (${twin.code}). Change the size or variant to tell them apart.`,
    };
  }
  return { name: category.name };
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
    const colorIds = await chosenColorIds(formData);

    // With colors, opening stock is entered per color ("opening_<colorId>");
    // without, it's the single opening-stock field.
    const openings: { colorId: string | null; qtyMilli: number }[] = colorIds.length
      ? colorIds.map((id) => {
          const v = String(formData.get(`opening_${id}`) ?? "").trim();
          return { colorId: id, qtyMilli: v ? toMilli(v) : 0 };
        })
      : [{ colorId: null, qtyMilli: d.initialStock }];
    for (const o of openings) {
      if (!o.qtyMilli) continue;
      const e = qtyError(o.qtyMilli, unit);
      if (e) return { ok: false, error: `Opening stock: ${e}` };
    }
    const minErr = qtyError(d.minStock, unit, { allowZero: true });
    if (minErr) return { ok: false, error: `Low-stock level: ${minErr}` };

    const named = await nameAndClash(categoryId!, clean(d.size), clean(d.variant));
    if ("error" in named) return { ok: false, error: named.error };

    const code = await nextProductCode();
    await prisma.product.create({
      data: {
        code,
        name: named.name,
        size: clean(d.size),
        variant: clean(d.variant),
        categoryId,
        colors: colorIds.length ? { create: colorIds.map((colorId) => ({ colorId })) } : undefined,
        minStockMilli: d.minStock,
        latestCostPaisa: rupeesToPaisa(d.initialCostRs),
        // First stock count (spec feature 34 note) recorded as an ADJUST movement.
        movements: openings.some((o) => o.qtyMilli > 0)
          ? {
              create: openings
                .filter((o) => o.qtyMilli > 0)
                .map((o) => ({
                  type: "ADJUST" as const,
                  qtyMilli: o.qtyMilli,
                  colorId: o.colorId,
                  unitCostPaisa: rupeesToPaisa(d.initialCostRs),
                  reason: "Opening stock count",
                })),
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
  colorId: z.string().optional(), // required when the product has colors
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
    const { productId, colorId: rawColorId, kind, qty, reason } = parsed.data;
    const colorId = rawColorId || null;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: PRODUCT_INCLUDE,
    });
    if (!product) return { ok: false, error: "Product not found" };
    const unit = unitOf(product);
    const colors = colorsOf(product);
    const ce = lineColorError(product.name, colors.map((c) => c.id), colorId);
    if (ce) return { ok: false, error: ce };
    const colorName = colors.find((c) => c.id === colorId)?.name;

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
        colorId,
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
      `${defaultReason}: ${delta > 0 ? "+" : "−"}${formatQtyUnit(Math.abs(delta), unit)} of ${product.name}${colorName ? ` (${colorName})` : ""}${reason ? ` — ${reason}` : ""}`
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
      include: PRODUCT_INCLUDE,
    });
    if (!existing) return { ok: false, error: "Product not found" };

    // Colors: a color can only be removed when none of it is in stock, and a
    // product holding stock without colors can't switch to colors (that stock
    // would belong to no color). Zero it first with Adjust.
    const newColorIds = await chosenColorIds(formData);
    const oldColors = colorsOf(existing);
    const removed = oldColors.filter((c) => !newColorIds.includes(c.id));
    const added = newColorIds.filter((id) => !oldColors.some((c) => c.id === id));
    if (removed.length || added.length) {
      const cs = await getColorStockMap([existing.id]);
      const stillHeld = removed.filter((c) => (cs.get(stockKey(existing.id, c.id)) ?? 0) !== 0);
      if (stillHeld.length) {
        return {
          ok: false,
          error: `${stillHeld.map((c) => c.name).join(", ")} still has stock. Bring it to zero with Adjust before removing the color.`,
        };
      }
      if (oldColors.length === 0 && added.length && (cs.get(stockKey(existing.id, null)) ?? 0) !== 0) {
        return {
          ok: false,
          error: "This product has stock that isn't assigned to a color. Bring it to zero with Adjust, then add colors and enter each color's stock.",
        };
      }
    }

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

    const named = await nameAndClash(categoryId!, clean(d.size), clean(d.variant), d.productId);
    if ("error" in named) return { ok: false, error: named.error };

    await prisma.product.update({
      where: { id: d.productId },
      data: {
        name: named.name,
        size: clean(d.size),
        variant: clean(d.variant),
        categoryId,
        minStockMilli: d.minStock,
        colors: {
          deleteMany: removed.length ? { colorId: { in: removed.map((c) => c.id) } } : undefined,
          create: added.length ? added.map((colorId) => ({ colorId })) : undefined,
        },
        // Only the owner may change cost; staff edits leave it untouched.
        ...(user.role === "OWNER" && d.latestCostRs !== undefined
          ? { latestCostPaisa: rupeesToPaisa(d.latestCostRs) }
          : {}),
      },
    });

    await audit({ id: user.id, username: user.username }, "PRODUCT_EDIT", "Product", d.productId, `Edited product ${existing.code} — ${named.name}`);
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
