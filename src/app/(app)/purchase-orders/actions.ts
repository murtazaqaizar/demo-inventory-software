"use server";

// Purchase orders: a slip given to a vendor saying "I am buying this from you".
// A record only — saving, editing or changing the status never touches stock,
// supplier payables, cash/bank or any bill/purchase number. Every user may make
// one (owner and staff).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { TX_OPTIONS } from "@/lib/tx";
import { requireUserApi } from "@/lib/guards";
import { formatPKR, rupeesToPaisa } from "@/lib/money";
import { toMilli } from "@/lib/qty";
import { dateFromInput } from "@/lib/dates";
import { audit } from "@/lib/audit";
import { sumLines } from "@/lib/receivables";
import { poLabel } from "@/lib/purchase-orders";

export type PurchaseOrderResult = { ok: true; id: string; number: number } | { ok: false; error?: string };

const lineSchema = z.object({
  description: z.string().trim().min(1, "Every line needs an item name"),
  unit: z.string().trim().min(1).default("pcs"),
  qty: z.coerce.number().positive("Quantity must be more than 0"),
  rateRs: z.coerce.number().min(0, "Rate can't be negative"),
});

const poSchema = z.object({
  date: z.string().optional(),
  vendorName: z.string().trim().min(1, "Enter the party's name"),
  vendorContact: z.string().optional(),
  vendorPhone: z.string().optional(),
  vendorAddress: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});

const editSchema = poSchema.extend({ id: z.string().min(1) });

export async function savePurchaseOrder(input: unknown): Promise<PurchaseOrderResult> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const editing = typeof input === "object" && input !== null && "id" in input;
    const parsed = (editing ? editSchema : poSchema).safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const d = parsed.data as z.infer<typeof editSchema>;

    const items = d.lines.map((l, i) => ({
      description: l.description,
      unit: l.unit,
      qtyMilli: toMilli(l.qty),
      ratePaisa: rupeesToPaisa(l.rateRs),
      position: i,
    }));
    const vendor = {
      vendorName: d.vendorName,
      vendorContact: d.vendorContact?.trim() || null,
      vendorPhone: d.vendorPhone?.trim() || null,
      vendorAddress: d.vendorAddress?.trim() || null,
      notes: d.notes?.trim() || null,
    };
    const date = dateFromInput(d.date);
    const total = sumLines(items);

    if (editing) {
      const old = await prisma.purchaseOrder.findUnique({ where: { id: d.id } });
      if (!old) return { ok: false, error: "Purchase order not found." };
      if (old.status !== "OPEN") {
        return { ok: false, error: `${poLabel(old.number)} is ${old.status.toLowerCase()} and can't be changed. Reopen it first.` };
      }
      await prisma.$transaction(async (tx) => {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: old.id } });
        await tx.purchaseOrder.update({
          where: { id: old.id },
          data: { ...vendor, ...(date ? { date } : {}), items: { create: items } },
        });
      }, TX_OPTIONS);
      await audit(user, "PO_EDIT", "PurchaseOrder", old.id, `Edited ${poLabel(old.number)} (${vendor.vendorName}) — now ${formatPKR(total)}`);
      revalidatePath("/purchase-orders");
      return { ok: true, id: old.id, number: old.number };
    }

    const po = await prisma.purchaseOrder.create({
      data: { ...vendor, createdById: user.id, ...(date ? { date } : {}), items: { create: items } },
    });
    await audit(user, "PO_CREATE", "PurchaseOrder", po.id, `${poLabel(po.number)} to ${vendor.vendorName} — ${formatPKR(total)}`);
    revalidatePath("/purchase-orders");
    return { ok: true, id: po.id, number: po.number };
  }, (error) => ({ ok: false as const, error }));
}

// Open → Received / Cancelled, and back to Open (reopen) from either.
export async function setPurchaseOrderStatus(
  id: string,
  status: "OPEN" | "RECEIVED" | "CANCELLED"
): Promise<{ ok: boolean; error?: string }> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const parsed = z.enum(["OPEN", "RECEIVED", "CANCELLED"]).safeParse(status);
    if (!parsed.success) return { ok: false, error: "Unknown status." };
    const po = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) return { ok: false, error: "Purchase order not found." };
    if (po.status === parsed.data) return { ok: false, error: `${poLabel(po.number)} is already ${po.status.toLowerCase()}.` };
    if (parsed.data !== "OPEN" && po.status !== "OPEN") {
      return { ok: false, error: `${poLabel(po.number)} is ${po.status.toLowerCase()}. Reopen it first.` };
    }

    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: parsed.data === "OPEN" ? { status: "OPEN", closedAt: null } : { status: parsed.data, closedAt: new Date() },
    });
    const word = { OPEN: "Reopened", RECEIVED: "Marked received", CANCELLED: "Cancelled" }[parsed.data];
    await audit(user, `PO_${parsed.data}`, "PurchaseOrder", po.id, `${word} ${poLabel(po.number)} (${po.vendorName})`);
    revalidatePath("/purchase-orders");
    return { ok: true };
  }, (error) => ({ ok: false, error }));
}
