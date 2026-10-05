"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { nextProductCode, resolveCategory } from "@/lib/products";
import { requireUserApi, requireOwnerApi } from "@/lib/guards";
import { rupeesToPaisa } from "@/lib/money";
import { audit } from "@/lib/audit";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  size: z.string().optional(),
  variant: z.string().optional(),
  category: z.string().optional(),
  piecesPerBox: z.coerce.number().int().min(1).default(1),
  piecesPerCarton: z.coerce.number().int().min(0).default(0),
  minStockLevel: z.coerce.number().int().min(0).default(0),
  initialStock: z.coerce.number().int().min(0).default(0),
  initialCostRs: z.coerce.number().min(0).default(0),
});

export type ActionResult = { ok: boolean; error?: string; message?: string };

export async function createProduct(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireUserApi(); // staff may add products/stock
    const parsed = productSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const d = parsed.data;
    const code = await nextProductCode();

    await prisma.product.create({
      data: {
        code,
        name: d.name,
        size: d.size || null,
        variant: d.variant || null,
        category: await resolveCategory(d.category),
        piecesPerBox: d.piecesPerBox,
        piecesPerCarton: d.piecesPerCarton,
        minStockLevel: d.minStockLevel,
        latestCostPaisa: rupeesToPaisa(d.initialCostRs),
        // First stock count (spec feature 34 note) recorded as an ADJUST movement.
        movements:
          d.initialStock > 0
            ? {
                create: {
                  type: "ADJUST",
                  piecesDelta: d.initialStock,
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

const adjustSchema = z.object({
  productId: z.string().min(1),
  delta: z.coerce.number().int(),
  reason: z.string().optional(),
});

// Manual stock correction (ADJUST). Can be positive or negative.
export async function adjustStock(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireUserApi();
    const parsed = adjustSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    const { productId, delta, reason } = parsed.data;
    if (delta === 0) return { ok: false, error: "Enter a non-zero quantity" };

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return { ok: false, error: "Product not found" };

    await prisma.stockMovement.create({
      data: {
        productId,
        type: "ADJUST",
        piecesDelta: delta,
        unitCostPaisa: product.latestCostPaisa,
        reason: reason || "Manual adjustment",
      },
    });
    revalidatePath("/products");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

const movementSchema = z.object({
  productId: z.string().min(1),
  kind: z.enum(["ADJUST", "RETURN_IN", "SAMPLE_OUT"]),
  qty: z.coerce.number().int(),
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
    if (qty === 0) return { ok: false, error: "Enter a non-zero quantity" };

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return { ok: false, error: "Product not found" };

    const delta =
      kind === "RETURN_IN" ? Math.abs(qty) : kind === "SAMPLE_OUT" ? -Math.abs(qty) : qty;

    const defaultReason =
      kind === "RETURN_IN" ? "Customer return" : kind === "SAMPLE_OUT" ? "Free sample / bonus" : "Manual adjustment";

    await prisma.stockMovement.create({
      data: {
        productId,
        type: kind,
        piecesDelta: delta,
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
      `${defaultReason}: ${delta > 0 ? "+" : ""}${delta} pcs of ${product.name}${reason ? ` — ${reason}` : ""}`
    );

    revalidatePath("/products");
    revalidatePath("/");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

// --- Edit an existing product (client request) ----------------------------
const editSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  size: z.string().optional(),
  variant: z.string().optional(),
  category: z.string().optional(),
  piecesPerBox: z.coerce.number().int().min(1).default(1),
  piecesPerCarton: z.coerce.number().int().min(0).default(0),
  minStockLevel: z.coerce.number().int().min(0).default(0),
  latestCostRs: z.coerce.number().min(0).optional(),
});

export async function updateProduct(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const parsed = editSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const d = parsed.data;

    const existing = await prisma.product.findUnique({ where: { id: d.productId } });
    if (!existing) return { ok: false, error: "Product not found" };

    await prisma.product.update({
      where: { id: d.productId },
      data: {
        name: d.name,
        size: d.size || null,
        variant: d.variant || null,
        category: await resolveCategory(d.category),
        piecesPerBox: d.piecesPerBox,
        piecesPerCarton: d.piecesPerCarton,
        minStockLevel: d.minStockLevel,
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

const minSchema = z.object({
  productId: z.string().min(1),
  minStockLevel: z.coerce.number().int().min(0),
});

export async function setMinLevel(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireOwnerApi();
    const parsed = minSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    await prisma.product.update({
      where: { id: parsed.data.productId },
      data: { minStockLevel: parsed.data.minStockLevel },
    });
    revalidatePath("/products");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}
