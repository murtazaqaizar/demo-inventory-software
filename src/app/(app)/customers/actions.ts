"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { TX_OPTIONS } from "@/lib/tx";
import { requireUserApi, requireOwnerApi } from "@/lib/guards";
import { formatPKR, rupeesToPaisa } from "@/lib/money";
import { audit } from "@/lib/audit";
import { getCustomerBalance } from "@/lib/receivables";
import { overpaymentWarning, recordCustomerPaymentTx, reverseCustomerPaymentTx } from "@/lib/customer-payments";

// `overpay`: the payment is more than the customer owes; the form shows this and
// asks the user to confirm before sending it again.
export type ActionResult = { ok: boolean; error?: string; message?: string; overpay?: string };

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
  chequeNumber: z.string().trim().optional(),
  chequeBank: z.string().trim().optional(),
  // Set by the form after the user has seen the "more than they owe" warning.
  confirmOverpay: z.string().optional(),
});

// Lump-sum payment against the customer's balance (spec feature 21). No bill matching.
export async function recordCustomerPayment(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const { customerId, amountRs, method, note, chequeNumber, chequeBank, confirmOverpay } = parsed.data;
    const amountPaisa = rupeesToPaisa(amountRs);

    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } });
    if (!customer) return { ok: false, error: "Customer not found." };
    if (!confirmOverpay) {
      const overpay = overpaymentWarning(customer.name, await getCustomerBalance(customerId), amountPaisa);
      if (overpay) return { ok: false, overpay };
    }

    const payment = await prisma.$transaction(
      (tx) =>
        recordCustomerPaymentTx(tx, { customerId, customerName: customer.name, amountPaisa, method, note, chequeNumber, chequeBank }),
      TX_OPTIONS
    );

    await audit(
      { id: user.id, username: user.username },
      "PAYMENT_CREATE",
      "Payment",
      payment.id,
      `Payment from ${customer.name} — ${formatPKR(amountPaisa)} (${method.toLowerCase()})`
    );

    revalidatePath("/customers");
    revalidatePath("/cheques");
    revalidatePath("/cash-bank");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

// Undo a lump-sum payment entered by mistake (owner only) — the money goes back
// out of its account and the customer owes it again. See reverseCustomerPaymentTx.
export async function reverseCustomerPayment(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const paymentId = String(formData.get("paymentId") ?? "");
    if (!paymentId) return { ok: false, error: "Payment not found" };

    const result = await prisma.$transaction((tx) => reverseCustomerPaymentTx(tx, paymentId), TX_OPTIONS);
    if (!result.ok) return { ok: false, error: result.error };

    await audit(
      { id: user.id, username: user.username },
      "PAYMENT_REVERSE",
      "Payment",
      paymentId,
      `Reversed a ${formatPKR(result.amountPaisa)} ${result.method.toLowerCase()} payment`
    );

    revalidatePath("/customers");
    revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/billing");
    revalidatePath("/cheques");
    revalidatePath("/cash-bank");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}
