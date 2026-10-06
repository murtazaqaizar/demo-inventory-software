"use client";

import { useActionState, useState } from "react";
import { createCategory, updateCategory, deleteCategory, type ActionResult } from "./actions";
import { Button, Input, Label, Panel, Select } from "@/components/ui";
import { DeleteButton } from "@/components/delete-button";
import { UNITS, type Unit } from "@/lib/qty";

function UnitSelect({ id, defaultValue = "PIECE" }: { id: string; defaultValue?: Unit }) {
  return (
    <Select id={id} name="unit" defaultValue={defaultValue}>
      {UNITS.map((u) => (
        <option key={u.value} value={u.value}>
          {u.label} ({u.short})
        </option>
      ))}
    </Select>
  );
}

export function AddCategoryForm() {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => createCategory(fd),
    { ok: false }
  );
  return (
    <Panel pad>
      <h2 className="mb-1 font-semibold text-ink">Add a category</h2>
      <p className="mb-3 text-sm text-ink-muted">
        The unit decides how its products are counted and sold — e.g. wire and pipe by the
        meter, sheets by the foot, tools by the piece.
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
          <UnitSelect id="c-unit" />
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
  productCount,
  unitLocked,
  owner,
}: {
  category: { id: string; name: string; unit: Unit };
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
  const unit = UNITS.find((u) => u.value === category.unit)!;

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
              <input type="hidden" name="unit" value={category.unit} />
              <p className="flex h-10 items-center text-[15px] text-ink">
                {unit.label} <span className="ml-2 text-[13px] text-ink-muted">· locked, has stock</span>
              </p>
            </>
          ) : (
            <UnitSelect id={`u-${category.id}`} defaultValue={category.unit} />
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
          Sold by the {unit.label.toLowerCase()} ({unit.short}) ·{" "}
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
