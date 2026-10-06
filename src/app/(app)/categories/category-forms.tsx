"use client";

import { useActionState, useState } from "react";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  createUnit,
  updateUnit,
  deleteUnit,
  createColor,
  updateColor,
  deleteColor,
  type ActionResult,
} from "./actions";
import { Button, Input, Label, Panel, Select } from "@/components/ui";
import { DeleteButton } from "@/components/delete-button";
import { Swatch, type ColorOption } from "@/components/color-select";
import { PIECE_UNIT_ID, type UnitOption } from "@/lib/qty";

function UnitSelect({ id, units, defaultValue }: { id: string; units: UnitOption[]; defaultValue?: string }) {
  return (
    <Select id={id} name="unitId" defaultValue={defaultValue ?? PIECE_UNIT_ID}>
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} ({u.short})
        </option>
      ))}
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function AddCategoryForm({ units }: { units: UnitOption[] }) {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => createCategory(fd),
    { ok: false }
  );
  return (
    <Panel pad>
      <h2 className="mb-1 font-semibold text-ink">Add a category</h2>
      <p className="mb-3 text-sm text-ink-muted">
        The unit decides how its products are counted and sold — e.g. wire and pipe by the
        meter, sheets by the foot, tools by the piece. Missing a unit? Add it under Units below.
      </p>
      {/* key resets the inputs after a successful add */}
      <form
        key={state.ok ? state.message : "form"}
        action={formAction}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end"
      >
        <div>
          <Label htmlFor="c-name">Category name</Label>
          <Input id="c-name" name="name" required maxLength={40} placeholder="Electric Wire" />
        </div>
        <div>
          <Label htmlFor="c-unit">Unit</Label>
          <UnitSelect id="c-unit" units={units} />
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add category"}
          </Button>
        </div>
        {state.error && <p className="text-sm text-bad sm:col-span-3">{state.error}</p>}
        {state.ok && state.message && <p className="text-sm text-ok sm:col-span-3">{state.message}</p>}
      </form>
    </Panel>
  );
}

export function CategoryRow({
  category,
  units,
  productCount,
  unitLocked,
  owner,
}: {
  category: { id: string; name: string; unit: UnitOption };
  units: UnitOption[];
  productCount: number;
  unitLocked: boolean;
  owner: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (_p: ActionResult, fd: FormData) => {
    const r = await updateCategory(fd);
    if (r.ok) setEditing(false);
    return r;
  }, { ok: false });
  const unit = category.unit;

  if (editing) {
    return (
      <form
        action={formAction}
        className="grid grid-cols-1 gap-3 border-b border-line px-6 py-4 last:border-0 sm:grid-cols-4 sm:items-end"
      >
        <input type="hidden" name="categoryId" value={category.id} />
        <div>
          <Label htmlFor={`n-${category.id}`}>Name</Label>
          <Input id={`n-${category.id}`} name="name" required maxLength={40} defaultValue={category.name} />
        </div>
        <div>
          <Label htmlFor={`u-${category.id}`}>Unit</Label>
          {unitLocked ? (
            <>
              <input type="hidden" name="unitId" value={unit.id} />
              <p className="flex h-10 items-center text-[15px] text-ink">
                {unit.name} <span className="ml-2 text-[13px] text-ink-muted">· locked, has stock</span>
              </p>
            </>
          ) : (
            <UnitSelect id={`u-${category.id}`} units={units} defaultValue={unit.id} />
          )}
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
        {state.error && <p className="text-sm text-bad sm:col-span-4">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4 last:border-0">
      <div>
        <p className="font-semibold text-ink">{category.name}</p>
        <p className="text-[13px] text-ink-muted">
          Sold by the {unit.name.toLowerCase()} ({unit.short}) ·{" "}
          <a href={`/products?category=${category.id}`} className="underline-offset-2 hover:underline">
            {productCount} product{productCount === 1 ? "" : "s"}
          </a>
        </p>
      </div>
      {owner && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-ink transition-colors duration-150 hover:underline"
          >
            Edit
          </button>
          {productCount === 0 && <DeleteButton action={deleteCategory} hidden={{ categoryId: category.id }} />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

function UnitFields({ idPrefix, unit }: { idPrefix: string; unit?: UnitOption }) {
  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}-name`}>Unit name</Label>
        <Input id={`${idPrefix}-name`} name="name" required maxLength={40} placeholder="Kilogram" defaultValue={unit?.name} />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-short`}>Short label</Label>
        <Input id={`${idPrefix}-short`} name="short" required maxLength={8} placeholder="kg" defaultValue={unit?.short} />
      </div>
      <label className="flex h-10 items-center gap-2 text-[15px] text-ink">
        <input type="checkbox" name="decimals" defaultChecked={unit?.decimals ?? false} />
        Allow decimals (2.5)
      </label>
    </>
  );
}

export function AddUnitForm() {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => createUnit(fd),
    { ok: false }
  );
  return (
    <form
      key={state.ok ? state.message : "unit-form"}
      action={formAction}
      className="grid grid-cols-1 gap-3 border-b border-line px-6 py-4 sm:grid-cols-[1fr_140px_auto_auto] sm:items-end"
    >
      <UnitFields idPrefix="new-unit" />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add unit"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-bad sm:col-span-4">{state.error}</p>}
      {state.ok && state.message && <p className="text-sm text-ok sm:col-span-4">{state.message}</p>}
    </form>
  );
}

export function UnitRow({ unit, categoryCount, owner }: { unit: UnitOption; categoryCount: number; owner: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (_p: ActionResult, fd: FormData) => {
    const r = await updateUnit(fd);
    if (r.ok) setEditing(false);
    return r;
  }, { ok: false });

  if (editing) {
    return (
      <form
        action={formAction}
        className="grid grid-cols-1 gap-3 border-b border-line px-6 py-4 last:border-0 sm:grid-cols-[1fr_140px_auto_auto] sm:items-end"
      >
        <input type="hidden" name="unitId" value={unit.id} />
        <UnitFields idPrefix={`u-${unit.id}`} unit={unit} />
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
        {state.error && <p className="text-sm text-bad sm:col-span-4">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-3 last:border-0">
      <div>
        <p className="font-medium text-ink">
          {unit.name} <span className="font-mono text-[13px] text-ink-muted">({unit.short})</span>
        </p>
        <p className="text-[13px] text-ink-muted">
          {unit.decimals ? "Decimals allowed" : "Whole numbers only"} · used by {categoryCount} categor
          {categoryCount === 1 ? "y" : "ies"}
        </p>
      </div>
      {owner && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-ink transition-colors duration-150 hover:underline"
          >
            Edit
          </button>
          {categoryCount === 0 && unit.id !== PIECE_UNIT_ID && (
            <DeleteButton action={deleteUnit} hidden={{ unitId: unit.id }} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

function ColorFields({ idPrefix, color }: { idPrefix: string; color?: ColorOption }) {
  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}-name`}>Color name</Label>
        <Input id={`${idPrefix}-name`} name="name" required maxLength={40} placeholder="Maroon" defaultValue={color?.name} />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-hex`}>Swatch</Label>
        <input
          id={`${idPrefix}-hex`}
          type="color"
          name="hex"
          defaultValue={color?.hex ?? "#9ca3af"}
          className="h-10 w-16 cursor-pointer rounded-control border border-line-strong bg-surface p-1"
        />
      </div>
    </>
  );
}

export function AddColorForm() {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => createColor(fd),
    { ok: false }
  );
  return (
    <form
      key={state.ok ? state.message : "color-form"}
      action={formAction}
      className="grid grid-cols-1 gap-3 border-b border-line px-6 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
    >
      <ColorFields idPrefix="new-color" />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add color"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-bad sm:col-span-3">{state.error}</p>}
      {state.ok && state.message && <p className="text-sm text-ok sm:col-span-3">{state.message}</p>}
    </form>
  );
}

export function ColorRow({ color, productCount, owner }: { color: ColorOption; productCount: number; owner: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (_p: ActionResult, fd: FormData) => {
    const r = await updateColor(fd);
    if (r.ok) setEditing(false);
    return r;
  }, { ok: false });

  if (editing) {
    return (
      <form
        action={formAction}
        className="grid grid-cols-1 gap-3 border-b border-line px-6 py-3 last:border-0 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      >
        <input type="hidden" name="colorId" value={color.id} />
        <ColorFields idPrefix={`c-${color.id}`} color={color} />
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
        {state.error && <p className="text-sm text-bad sm:col-span-3">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-2.5 last:border-0">
      <div className="flex items-center gap-2.5">
        <Swatch hex={color.hex} size={18} />
        <span className="font-medium text-ink">{color.name}</span>
        <span className="text-[13px] text-ink-muted">
          · {productCount} product{productCount === 1 ? "" : "s"}
        </span>
      </div>
      {owner && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-ink transition-colors duration-150 hover:underline"
          >
            Edit
          </button>
          {productCount === 0 && <DeleteButton action={deleteColor} hidden={{ colorId: color.id }} />}
        </div>
      )}
    </div>
  );
}
