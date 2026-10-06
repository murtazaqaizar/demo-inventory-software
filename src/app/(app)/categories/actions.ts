"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { requireUserApi, requireOwnerApi } from "@/lib/guards";
import { audit } from "@/lib/audit";
import { unitLabel } from "@/lib/qty";

export type ActionResult = { ok: boolean; error?: string; message?: string };

const nameField = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, "Category name is required").max(40, "Keep the name under 40 characters"));
const unitField = z.enum(["PIECE", "METER", "FEET"]);

// Same name ignoring case counts as a duplicate, so "wire" can't sit next to "Wire".
async function nameTaken(name: string, exceptId?: string) {
  const hit = await prisma.category.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return !!hit;
}

function done() {
  revalidatePath("/categories");
  revalidatePath("/products");
}

// Staff may add categories (they add products too); renaming, changing the unit
// and deleting are owner-only because they change how existing stock reads.
export async function createCategory(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const parsed = z.object({ name: nameField, unit: unitField }).safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const { name, unit } = parsed.data;
    if (await nameTaken(name)) return { ok: false, error: `A category called "${name}" already exists.` };

    const c = await prisma.category.create({ data: { name, unit } });
    await audit({ id: user.id, username: user.username }, "CATEGORY_ADD", "Category", c.id, `Added category ${name} (${unitLabel(unit)})`);
    done();
    return { ok: true, message: `${name} added.` };
  }, (error) => ({ ok: false, error }));
}

export async function updateCategory(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const parsed = z
      .object({ categoryId: z.string().min(1), name: nameField, unit: unitField })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const { categoryId, name, unit } = parsed.data;

    const existing = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!existing) return { ok: false, error: "Category not found" };
    if (await nameTaken(name, categoryId)) return { ok: false, error: `A category called "${name}" already exists.` };

    if (unit !== existing.unit) {
      // Stored quantities are in the category's unit. Once stock has moved, changing
      // the unit would turn "200 pieces" into "200 meters" without anyone noticing.
      const history = await prisma.stockMovement.count({ where: { product: { categoryId } } });
      if (history > 0) {
        return {
          ok: false,
          error: `The unit of ${existing.name} is locked: its products already have stock entries in ${unitLabel(existing.unit).toLowerCase()}s. Create a new category with the other unit instead.`,
        };
      }
    }

    await prisma.category.update({ where: { id: categoryId }, data: { name, unit } });
    await audit(
      { id: user.id, username: user.username },
      "CATEGORY_EDIT",
      "Category",
      categoryId,
      `Edited category ${existing.name} → ${name} (${unitLabel(unit)})`
    );
    done();
    return { ok: true, message: "Saved." };
  }, (error) => ({ ok: false, error }));
}

export async function deleteCategory(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const categoryId = String(formData.get("categoryId") ?? "");
    const existing = await prisma.category.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) return { ok: false, error: "Category not found" };
    if (existing._count.products > 0) {
      return {
        ok: false,
        error: `${existing.name} still has ${existing._count.products} product(s). Move them to another category first.`,
      };
    }
    await prisma.category.delete({ where: { id: categoryId } });
    await audit({ id: user.id, username: user.username }, "CATEGORY_DELETE", "Category", categoryId, `Deleted category ${existing.name}`);
    done();
    return { ok: true, message: `${existing.name} deleted.` };
  }, (error) => ({ ok: false, error }));
}
