"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { TX_OPTIONS } from "@/lib/tx";
import { requireOwnerApi } from "@/lib/guards";
import { rupeesToPaisa } from "@/lib/money";
import { audit } from "@/lib/audit";
import { isBuiltIn, isKnownHead } from "@/lib/expense-heads";

export type ActionResult = { ok: boolean; error?: string };

const expenseSchema = z.object({
  category: z.string().min(1, "Category is required"),
  amountRs: z.coerce.number().positive("Enter an amount"),
  date: z.string().optional(),
  note: z.string().optional(),
});

// Record a running expense (spec feature 26) and reduce cash so money stays accurate.
export async function createExpense(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    await requireOwnerApi();
    const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const d = parsed.data;

    // The dropdown is only a suggestion; the server decides what counts as a
    // head, or a hand-made request could file an expense under anything.
    if (!(await isKnownHead(d.category))) {
      return { ok: false, error: `"${d.category}" is not one of your expense heads.` };
    }

    const amountPaisa = rupeesToPaisa(d.amountRs);
    const when = d.date ? new Date(d.date) : new Date();

    await prisma.$transaction(async (tx) => {
      await tx.expense.create({
        data: { category: d.category, amountPaisa, note: d.note || null, date: when },
      });
      const cash = await tx.moneyAccount.findFirst({ where: { kind: "CASH" } });
      if (cash) {
        await tx.moneyMovement.create({
          data: { accountId: cash.id, type: "EXPENSE", amountPaisa: -amountPaisa, note: d.category, date: when },
        });
      }
    }, TX_OPTIONS);

    revalidatePath("/expenses");
    revalidatePath("/cash-bank");
    revalidatePath("/reports");
    return { ok: true };
}, (error) => ({ ok: false, error }));
}

// --- Expense heads the shop adds itself ------------------------------------
// The built-in seven cover the usual running costs; a shop always has one or two
// of its own (chai, packing, mobile load). Adding one here makes it available on
// the form from then on.

const headSchema = z.object({ name: z.string().min(1, "Type a name for the head").max(40) });

export async function addExpenseHead(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const parsed = headSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const name = parsed.data.name.trim();

    if (isBuiltIn(name)) return { ok: false, error: `"${name}" is already a built-in head.` };
    // Case-insensitive, so the list never shows "Chai" and "chai" side by side.
    const clash = await prisma.expenseHead.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (clash) {
      if (clash.active) return { ok: false, error: `"${clash.name}" is already on the list.` };
      // Retired earlier — bring it back rather than refusing on the unique index.
      await prisma.expenseHead.update({ where: { id: clash.id }, data: { active: true } });
      await audit(user, "EXPENSE_HEAD_RESTORE", "ExpenseHead", clash.id, `Restored expense head "${clash.name}"`);
      revalidatePath("/expenses");
      return { ok: true };
    }

    const created = await prisma.expenseHead.create({ data: { name } });
    await audit(user, "EXPENSE_HEAD_ADD", "ExpenseHead", created.id, `Added expense head "${name}"`);
    revalidatePath("/expenses");
    return { ok: true };
  }, (error) => ({ ok: false, error }));
}

export async function removeExpenseHead(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const id = String(formData.get("id") ?? "");
    if (!id) return { ok: false, error: "Which head?" };

    const head = await prisma.expenseHead.findUnique({ where: { id } });
    if (!head) return { ok: false, error: "That head no longer exists." };

    // Delete-or-hide, the same rule Products, Customers and Suppliers follow:
    // an expense stores the head's NAME, so hiding keeps old rows readable while
    // taking it off the form.
    const used = await prisma.expense.count({ where: { category: head.name } });
    if (used > 0) {
      await prisma.expenseHead.update({ where: { id }, data: { active: false } });
      await audit(user, "EXPENSE_HEAD_HIDE", "ExpenseHead", id, `Retired expense head "${head.name}" (${used} expenses keep it)`);
    } else {
      await prisma.expenseHead.delete({ where: { id } });
      await audit(user, "EXPENSE_HEAD_DELETE", "ExpenseHead", id, `Deleted unused expense head "${head.name}"`);
    }
    revalidatePath("/expenses");
    return { ok: true };
  }, (error) => ({ ok: false, error }));
}
