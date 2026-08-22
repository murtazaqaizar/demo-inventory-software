// The list of heads an expense can be filed under.
//
// Two sources, deliberately: the seven built-ins live in code so a fresh install
// works before anyone has configured anything, and the ExpenseHead table holds
// whatever the shop adds on top. This module is the only place that knows how to
// merge them, so the form, the validation and the manage screen can never
// disagree about what a valid head is.

import { prisma } from "@/lib/prisma";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

export type ExpenseHead = {
  name: string;
  /** Built-ins cannot be renamed or removed — they are the shop's floor. */
  builtIn: boolean;
  /** Present only for custom heads, so the manage screen can act on them. */
  id?: string;
};

/** Case-insensitive, so "labour" and "Labour" are never both offered. */
const key = (name: string) => name.trim().toLowerCase();

export async function getExpenseHeads(): Promise<ExpenseHead[]> {
  let custom: { id: string; name: string }[] = [];
  try {
    custom = await prisma.expenseHead.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  } catch {
    // Table not there yet (migration pending) — the built-ins still work.
  }

  const seen = new Set(EXPENSE_CATEGORIES.map(key));
  const heads: ExpenseHead[] = EXPENSE_CATEGORIES.map((name) => ({ name, builtIn: true }));
  for (const c of custom) {
    if (seen.has(key(c.name))) continue; // a custom head that duplicates a built-in
    seen.add(key(c.name));
    heads.push({ name: c.name, builtIn: false, id: c.id });
  }
  return heads;
}

/**
 * Is this a head an expense may be filed under right now?
 *
 * Checked server-side because the dropdown is only a suggestion — the action has
 * to be the one that decides, or a hand-made request could invent a head that
 * then appears in the books with nothing behind it.
 */
export async function isKnownHead(name: string): Promise<boolean> {
  const heads = await getExpenseHeads();
  return heads.some((h) => key(h.name) === key(name));
}

export function isBuiltIn(name: string): boolean {
  return EXPENSE_CATEGORIES.some((c) => key(c) === key(name));
}
