"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { TX_OPTIONS } from "@/lib/tx";
import { requireUserApi, requireOwnerApi } from "@/lib/guards";
import { rupeesToPaisa } from "@/lib/money";
import { audit } from "@/lib/audit";

export type ActionResult = { ok: boolean; error?: string; message?: string };

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  openingBalanceRs: z.coerce.number().min(0).default(0),
  creditLimitRs: z.coerce.number().min(0).default(0),
});

export async function createCustomer(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUserApi(); // staff can add customers
    const parsed = customerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

    // Only the owner may seed an opening udhaar balance or set a credit limit (money side).
    const owner = user.role === "OWNER";

    await prisma.customer.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        openingBalancePaisa: owner ? rupeesToPaisa(parsed.data.openingBalanceRs) : 0,
        creditLimitPaisa: owner ? rupeesToPaisa(parsed.data.creditLimitRs) : 0,
      },
    });
    revalidatePath("/customers");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

// --- Edit a customer ------------------------------------------------------
const editSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  openingBalanceRs: z.coerce.number().min(0).optional(),
  creditLimitRs: z.coerce.number().min(0).optional(),
});

export async function updateCustomer(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const parsed = editSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const d = parsed.data;

    const existing = await prisma.customer.findUnique({ where: { id: d.customerId } });
    if (!existing) return { ok: false, error: "Customer not found" };
    if (existing.isCashCustomer) return { ok: false, error: "The Cash Sale customer cannot be edited" };

    const owner = user.role === "OWNER";
    await prisma.customer.update({
      where: { id: d.customerId },
      data: {
        name: d.name,
        phone: d.phone || null,
        // Opening balance & credit limit are money-side — owner only.
        ...(owner && d.openingBalanceRs !== undefined ? { openingBalancePaisa: rupeesToPaisa(d.openingBalanceRs) } : {}),
        ...(owner && d.creditLimitRs !== undefined ? { creditLimitPaisa: rupeesToPaisa(d.creditLimitRs) } : {}),
      },
    });
    revalidatePath("/customers");
    revalidatePath("/aging");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

// --- Delete a customer ----------------------------------------------------
// Only allowed if they have no bills, payments or returns — otherwise their
// history (and your ledger) would be broken.
export async function deleteCustomer(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireOwnerApi();
    const customerId = String(formData.get("customerId") ?? "");
    if (!customerId) return { ok: false, error: "Missing customer" };

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return { ok: false, error: "Customer not found" };
    if (customer.isCashCustomer) return { ok: false, error: "The Cash Sale customer cannot be deleted" };

    const [invoices, payments, creditNotes] = await Promise.all([
      prisma.invoice.count({ where: { customerId } }),
      prisma.payment.count({ where: { customerId } }),
      prisma.creditNote.count({ where: { customerId } }),
    ]);

    // Has history → hide it (keeps their bills for your records). No history → delete fully.
    if (invoices + payments + creditNotes > 0) {
      await prisma.customer.update({ where: { id: customerId }, data: { active: false } });
      revalidatePath("/customers");
      revalidatePath("/aging");
      return { ok: true, message: `${customer.name} had bills, so it was hidden instead of deleted.` };
    }

    await prisma.customerProductPrice.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    revalidatePath("/customers");
    return { ok: true, message: `${customer.name} deleted.` };
}, (error) => ({ ok: false, error }));
}

// Bring a hidden customer back.
export async function restoreCustomer(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireOwnerApi();
    const customerId = String(formData.get("customerId") ?? "");
    if (!customerId) return { ok: false, error: "Missing customer" };
    await prisma.customer.update({ where: { id: customerId }, data: { active: true } });
    revalidatePath("/customers");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

// PERMANENT delete — the customer and ALL their bills, payments and returns are
// erased for good. Owner-only, confirmed in the UI. Stock and cash are left as-is
// (those already happened); void the bills first if you want them reversed.
export async function permanentlyDeleteCustomer(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const actor = await requireOwnerApi();
    const customerId = String(formData.get("customerId") ?? "");
    if (!customerId) return { ok: false, error: "Missing customer" };

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return { ok: false, error: "Customer not found" };
    if (customer.isCashCustomer) return { ok: false, error: "The Cash Sale customer cannot be deleted" };

    await prisma.$transaction(async (tx) => {
      const invoices = await tx.invoice.findMany({ where: { customerId }, select: { id: true } });
      const creditNotes = await tx.creditNote.findMany({ where: { customerId }, select: { id: true } });
      const invIds = invoices.map((i) => i.id);
      const cnIds = creditNotes.map((c) => c.id);

      // Keep the stock movements as historical fact — just unlink them from the deleted docs.
      await tx.stockMovement.updateMany({
        where: { OR: [{ invoiceId: { in: invIds } }, { creditNoteId: { in: cnIds } }] },
        data: { invoiceId: null, creditNoteId: null },
      });

      // Delete records (invoice items/payments and credit-note items cascade automatically).
      await tx.invoice.deleteMany({ where: { customerId } });
      await tx.payment.deleteMany({ where: { customerId } });
      await tx.creditNote.deleteMany({ where: { customerId } });
      await tx.customerProductPrice.deleteMany({ where: { customerId } });
      await tx.customer.delete({ where: { id: customerId } });
    }, TX_OPTIONS);

    await audit(
      { id: actor.id, username: actor.username },
      "CUSTOMER_PURGE",
      "Customer",
      customerId,
      `Permanently deleted customer “${customer.name}” and all their bills`
    );
    revalidatePath("/customers");
    revalidatePath("/aging");
    revalidatePath("/billing");
    return { ok: true, message: `${customer.name} and all their records were permanently deleted.` };
}, (error) => ({ ok: false, error }));
}

const limitSchema = z.object({
  customerId: z.string().min(1),
  creditLimitRs: z.coerce.number().min(0),
});

// Credit limit (improvement 7): 0 means no limit.
export async function setCreditLimit(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireOwnerApi();
    const parsed = limitSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    await prisma.customer.update({
      where: { id: parsed.data.customerId },
      data: { creditLimitPaisa: rupeesToPaisa(parsed.data.creditLimitRs) },
    });
    revalidatePath("/customers");
    revalidatePath("/aging");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

const paymentSchema = z.object({
  customerId: z.string().min(1),
  amountRs: z.coerce.number().positive("Enter an amount"),
  method: z.enum(["CASH", "CHEQUE", "ONLINE"]).default("CASH"),
  note: z.string().optional(),
});

// Lump-sum payment against the customer's balance (spec feature 21). No bill matching.
export async function recordCustomerPayment(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireUserApi();
    const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const { customerId, amountRs, method, note } = parsed.data;
    const amountPaisa = rupeesToPaisa(amountRs);

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: { customerId, amountPaisa, method, note: note || "Payment received" },
      });
      // Cash/online receipts move money into an account (feature 24). Cheque payments
      // are tracked via the cheque register (Step 12) and clear later.
      if (method === "CASH" || method === "ONLINE") {
        const kind = method === "CASH" ? "CASH" : "BANK";
        const account = await tx.moneyAccount.findFirst({ where: { kind } });
        if (account) {
          await tx.moneyMovement.create({
            data: {
              accountId: account.id,
              type: "CUSTOMER_PAYMENT",
              amountPaisa,
              note: `Payment from customer`,
            },
          });
        }
      }
    }, TX_OPTIONS);

    revalidatePath("/customers");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}
