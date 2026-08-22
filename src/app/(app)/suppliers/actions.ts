"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { TX_OPTIONS } from "@/lib/tx";
import { requireOwnerApi } from "@/lib/guards";
import { rupeesToPaisa } from "@/lib/money";
import { audit } from "@/lib/audit";
import { supplierHasHistory } from "@/lib/suppliers";

export type ActionResult = { ok: boolean; error?: string; message?: string };

const supplierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export async function createSupplier(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi(); // payables are money-side — OWNER only
    const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const supplier = await prisma.supplier.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        notes: parsed.data.notes || null,
      },
    });
    await audit(
      { id: user.id, username: user.username },
      "SUPPLIER_CREATE",
      "Supplier",
      supplier.id,
      `Added supplier ${supplier.name}`
    );
    revalidatePath("/suppliers");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

// --- Edit an existing supplier -------------------------------------------
const editSchema = supplierSchema.extend({ supplierId: z.string().min(1) });

export async function updateSupplier(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const parsed = editSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const d = parsed.data;

    const existing = await prisma.supplier.findUnique({ where: { id: d.supplierId } });
    if (!existing) return { ok: false, error: "Supplier not found" };

    await prisma.supplier.update({
      where: { id: d.supplierId },
      data: {
        name: d.name,
        phone: d.phone || null,
        notes: d.notes || null,
      },
    });

    await audit(
      { id: user.id, username: user.username },
      "SUPPLIER_EDIT",
      "Supplier",
      d.supplierId,
      `Edited supplier ${existing.name}${existing.name !== d.name ? ` → ${d.name}` : ""}`
    );
    revalidatePath("/suppliers");
    revalidatePath("/purchases");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

// --- Delete a supplier ----------------------------------------------------
// Hard-delete only when the supplier has never been used; otherwise hide it so
// purchases, payables and landed-cost history stay intact.
export async function deleteSupplier(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const supplierId = String(formData.get("supplierId") ?? "");
    if (!supplierId) return { ok: false, error: "Missing supplier" };

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) return { ok: false, error: "Supplier not found" };

    if (await supplierHasHistory(prisma, supplierId)) {
      await prisma.supplier.update({ where: { id: supplierId }, data: { active: false } });
      await audit(
        { id: user.id, username: user.username },
        "SUPPLIER_HIDE",
        "Supplier",
        supplierId,
        `Hid supplier ${supplier.name} (has purchase/payable history)`
      );
      revalidatePath("/suppliers");
      return {
        ok: true,
        message: `${supplier.name} had purchases or payments, so it was hidden instead of deleted.`,
      };
    }

    await prisma.supplier.delete({ where: { id: supplierId } });
    await audit(
      { id: user.id, username: user.username },
      "SUPPLIER_DELETE",
      "Supplier",
      supplierId,
      `Deleted supplier ${supplier.name}`
    );
    revalidatePath("/suppliers");
    return { ok: true, message: `${supplier.name} deleted.` };
}, (error) => ({ ok: false, error }));
}

// Bring a hidden supplier back.
export async function restoreSupplier(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireOwnerApi();
    const supplierId = String(formData.get("supplierId") ?? "");
    if (!supplierId) return { ok: false, error: "Missing supplier" };
    await prisma.supplier.update({ where: { id: supplierId }, data: { active: true } });
    revalidatePath("/suppliers");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

const paymentSchema = z.object({
  supplierId: z.string().min(1),
  amountRs: z.coerce.number().positive("Enter an amount"),
  note: z.string().optional(),
});

// Payment to a supplier reduces the payable (spec feature 10).
export async function recordSupplierPayment(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireOwnerApi();
    const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const amountPaisa = rupeesToPaisa(parsed.data.amountRs);

    await prisma.$transaction(async (tx) => {
      // Reduce the payable (feature 10) ...
      await tx.supplierLedgerEntry.create({
        data: {
          supplierId: parsed.data.supplierId,
          direction: "PAYMENT",
          amountPaisa,
          note: parsed.data.note || "Payment",
        },
      });
      // ... and reduce cash so the money position stays accurate (feature 24).
      const cash = await tx.moneyAccount.findFirst({ where: { kind: "CASH" } });
      if (cash) {
        await tx.moneyMovement.create({
          data: {
            accountId: cash.id,
            type: "SUPPLIER_PAYMENT",
            amountPaisa: -amountPaisa,
            note: "Payment to supplier",
          },
        });
      }
    }, TX_OPTIONS);

    revalidatePath("/suppliers");
    revalidatePath("/cash-bank");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}
