"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { requireUserApi, requireOwnerApi } from "@/lib/guards";
import { audit } from "@/lib/audit";
import { PIECE_UNIT_ID } from "@/lib/qty";

export type ActionResult = { ok: boolean; error?: string; message?: string };

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
const nameField = z
  .string()
  .transform(tidy)
  .pipe(z.string().min(1, "Name is required").max(40, "Keep the name under 40 characters"));
const unitIdField = z.string().min(1, "Pick a unit");

function done() {
  revalidatePath("/categories");
  revalidatePath("/products");
}

async function unitName(unitId: string) {
  return (await prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } }))?.name;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// Same name ignoring case counts as a duplicate, so "wire" can't sit next to "Wire".
async function categoryNameTaken(name: string, exceptId?: string) {
  const hit = await prisma.category.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return !!hit;
}

// Staff may add categories (they add products too); renaming, changing the unit
// and deleting are owner-only because they change how existing stock reads.
export async function createCategory(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const parsed = z.object({ name: nameField, unitId: unitIdField }).safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const { name, unitId } = parsed.data;
    if (await categoryNameTaken(name)) return { ok: false, error: `A category called "${name}" already exists.` };
    const uName = await unitName(unitId);
    if (!uName) return { ok: false, error: "That unit no longer exists. Refresh the page." };

    const c = await prisma.category.create({ data: { name, unitId } });
    await audit({ id: user.id, username: user.username }, "CATEGORY_ADD", "Category", c.id, `Added category ${name} (${uName})`);
    done();
    return { ok: true, message: `${name} added.` };
  }, (error) => ({ ok: false, error }));
}

export async function updateCategory(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const parsed = z
      .object({ categoryId: z.string().min(1), name: nameField, unitId: unitIdField })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const { categoryId, name, unitId } = parsed.data;

    const existing = await prisma.category.findUnique({ where: { id: categoryId }, include: { unit: true } });
    if (!existing) return { ok: false, error: "Category not found" };
    if (await categoryNameTaken(name, categoryId)) return { ok: false, error: `A category called "${name}" already exists.` };
    const uName = await unitName(unitId);
    if (!uName) return { ok: false, error: "That unit no longer exists. Refresh the page." };

    if (unitId !== existing.unitId) {
      // Stored quantities are in the category's unit. Once stock has moved, changing
      // the unit would turn "200 pieces" into "200 meters" without anyone noticing.
      const history = await prisma.stockMovement.count({ where: { product: { categoryId } } });
      if (history > 0) {
        return {
          ok: false,
          error: `The unit of ${existing.name} is locked: its products already have stock entries in ${existing.unit.name} (${existing.unit.short}). Create a new category with the other unit instead.`,
        };
      }
    }

    await prisma.category.update({ where: { id: categoryId }, data: { name, unitId } });
    await audit(
      { id: user.id, username: user.username },
      "CATEGORY_EDIT",
      "Category",
      categoryId,
      `Edited category ${existing.name} → ${name} (${uName})`
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

// ---------------------------------------------------------------------------
// Units (client B: "the shop decides its own units")
// ---------------------------------------------------------------------------

const unitSchema = z.object({
  name: nameField,
  short: z
    .string()
    .transform(tidy)
    .pipe(z.string().min(1, "Short label is required, e.g. kg").max(8, "Keep the short label to 8 characters")),
  // Checkbox: present = on.
  decimals: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

async function unitClash(name: string, short: string, exceptId?: string): Promise<string | null> {
  const not = exceptId ? { id: { not: exceptId } } : {};
  const [byName, byShort] = await Promise.all([
    prisma.unit.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...not }, select: { id: true } }),
    prisma.unit.findFirst({ where: { short: { equals: short, mode: "insensitive" }, ...not }, select: { id: true } }),
  ]);
  if (byName) return `A unit called "${name}" already exists.`;
  if (byShort) return `The short label "${short}" is already used by another unit.`;
  return null;
}

export async function createUnit(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const parsed = unitSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const { name, short, decimals } = parsed.data;
    const clash = await unitClash(name, short);
    if (clash) return { ok: false, error: clash };

    const u = await prisma.unit.create({ data: { name, short, decimals } });
    await audit({ id: user.id, username: user.username }, "UNIT_ADD", "Unit", u.id, `Added unit ${name} (${short})`);
    done();
    return { ok: true, message: `${name} added.` };
  }, (error) => ({ ok: false, error }));
}

export async function updateUnit(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const parsed = unitSchema.extend({ unitId: z.string().min(1) }).safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const { unitId, name, short, decimals } = parsed.data;

    const existing = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!existing) return { ok: false, error: "Unit not found" };
    const clash = await unitClash(name, short, unitId);
    if (clash) return { ok: false, error: clash };

    // Switching decimals OFF after stock exists could leave 2.5 of something that
    // may only be counted whole. Turning it ON is always safe.
    if (existing.decimals && !decimals) {
      const history = await prisma.stockMovement.count({ where: { product: { category: { unitId } } } });
      if (history > 0) {
        return { ok: false, error: `${existing.name} already has stock entries, so decimals can't be switched off.` };
      }
    }

    await prisma.unit.update({ where: { id: unitId }, data: { name, short, decimals } });
    await audit(
      { id: user.id, username: user.username },
      "UNIT_EDIT",
      "Unit",
      unitId,
      `Edited unit ${existing.name} (${existing.short}) → ${name} (${short})${decimals ? ", decimals allowed" : ""}`
    );
    done();
    return { ok: true, message: "Saved." };
  }, (error) => ({ ok: false, error }));
}

export async function deleteUnit(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const unitId = String(formData.get("unitId") ?? "");
    if (unitId === PIECE_UNIT_ID) {
      return { ok: false, error: "Piece can't be deleted — products without a category are counted in it." };
    }
    const existing = await prisma.unit.findUnique({
      where: { id: unitId },
      include: { _count: { select: { categories: true } } },
    });
    if (!existing) return { ok: false, error: "Unit not found" };
    if (existing._count.categories > 0) {
      return { ok: false, error: `${existing.name} is used by ${existing._count.categories} categor${existing._count.categories === 1 ? "y" : "ies"}.` };
    }
    await prisma.unit.delete({ where: { id: unitId } });
    await audit({ id: user.id, username: user.username }, "UNIT_DELETE", "Unit", unitId, `Deleted unit ${existing.name}`);
    done();
    return { ok: true, message: `${existing.name} deleted.` };
  }, (error) => ({ ok: false, error }));
}

// ---------------------------------------------------------------------------
// Colors (client B: "pick the color from a list, with the color shown")
// ---------------------------------------------------------------------------

const colorSchema = z.object({
  name: nameField,
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a swatch color").transform((h) => h.toLowerCase()),
});

async function colorNameTaken(name: string, exceptId?: string) {
  const hit = await prisma.color.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return !!hit;
}

// Staff may add colors (they add products too); edit and delete are owner-only.
export async function createColor(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUserApi();
    const parsed = colorSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const { name, hex } = parsed.data;
    if (await colorNameTaken(name)) return { ok: false, error: `A color called "${name}" already exists.` };

    const c = await prisma.color.create({ data: { name, hex } });
    await audit({ id: user.id, username: user.username }, "COLOR_ADD", "Color", c.id, `Added color ${name} (${hex})`);
    done();
    return { ok: true, message: `${name} added.` };
  }, (error) => ({ ok: false, error }));
}

export async function updateColor(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const parsed = colorSchema.extend({ colorId: z.string().min(1) }).safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const { colorId, name, hex } = parsed.data;
    const existing = await prisma.color.findUnique({ where: { id: colorId } });
    if (!existing) return { ok: false, error: "Color not found" };
    if (await colorNameTaken(name, colorId)) return { ok: false, error: `A color called "${name}" already exists.` };

    await prisma.color.update({ where: { id: colorId }, data: { name, hex } });
    await audit({ id: user.id, username: user.username }, "COLOR_EDIT", "Color", colorId, `Edited color ${existing.name} → ${name} (${hex})`);
    done();
    return { ok: true, message: "Saved." };
  }, (error) => ({ ok: false, error }));
}

export async function deleteColor(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const colorId = String(formData.get("colorId") ?? "");
    const existing = await prisma.color.findUnique({
      where: { id: colorId },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) return { ok: false, error: "Color not found" };
    if (existing._count.products > 0) {
      return { ok: false, error: `${existing.name} is used by ${existing._count.products} product(s).` };
    }
    await prisma.color.delete({ where: { id: colorId } });
    await audit({ id: user.id, username: user.username }, "COLOR_DELETE", "Color", colorId, `Deleted color ${existing.name}`);
    done();
    return { ok: true, message: `${existing.name} deleted.` };
  }, (error) => ({ ok: false, error }));
}
