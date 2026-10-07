"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct, type ActionResult } from "../actions";
import { Button, FieldError, Input, Label, Panel, Select, numInputClass } from "@/components/ui";
import { PIECE, qtyStep, unitShort, type Unit } from "@/lib/qty";
import { Swatch, type ColorOption } from "@/components/color-select";

export type CategoryOption = { id: string; name: string; unit: Unit };

export type ProductInitial = {
  id: string;
  name: string;
  size: string | null;
  variant: string | null;
  colorIds: string[]; // color variants this product comes in
  categoryId: string | null;
  minStock: number; // in the product's unit (not thousandths)
  latestCostRs: number;
};

export function ProductForm({
  canSeeCost,
  categories,
  colors,
  initial,
}: {
  canSeeCost: boolean;
  categories: CategoryOption[];
  colors: ColorOption[];
  initial?: ProductInitial;
}) {
  const router = useRouter();
  const editing = !!initial;
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => (editing ? updateProduct(fd) : createProduct(fd)),
    { ok: false }
  );
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const unit: Unit = categories.find((c) => c.id === categoryId)?.unit ?? PIECE;
  const per = unit.name.toLowerCase();
  // Color variants: each ticked color gets its own stock (client B, 2026-10-07).
  const [colorIds, setColorIds] = useState<string[]>(initial?.colorIds ?? []);
  const picked = colors.filter((c) => colorIds.includes(c.id));
  const toggleColor = (id: string) =>
    setColorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const short = unitShort(unit);

  useEffect(() => {
    if (state.ok) router.push("/products");
  }, [state.ok, router]);

  return (
    <Panel pad className="max-w-2xl">
      {/* Submitted by hand rather than via <form action>: React resets a form after an
          action runs, which wiped everything typed whenever the save was refused
          (e.g. a duplicate). This keeps the entries on screen to fix and retry. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => formAction(fd));
        }}
        className="space-y-5"
      >
        {editing && <input type="hidden" name="productId" value={initial!.id} />}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="categoryId">Product (category)</Label>
            <Select
              id="categoryId"
              name="categoryId"
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="" disabled>
                Pick a category…
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.unit.name.toLowerCase()} ({c.unit.short})
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-[13px] text-ink-muted">
              Counted in{" "}
              <span className="font-medium text-ink">
                {unit.name} ({unit.short})
              </span>
              {" · "}
              <Link href="/categories" className="underline-offset-2 hover:underline">
                Manage categories
              </Link>
            </p>
          </div>
        </div>

        <fieldset>
          <legend className="mb-1.5 block text-[13px] font-medium text-ink-muted">
            Colors (optional) — tick every color this item comes in
          </legend>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => {
              const on = colorIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150 ${
                    on ? "border-accent bg-accent-soft text-ink" : "border-line bg-surface text-ink-muted hover:bg-surface-alt"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="colorIds"
                    value={c.id}
                    checked={on}
                    onChange={() => toggleColor(c.id)}
                    className="sr-only"
                  />
                  <Swatch hex={c.hex} size={12} />
                  {c.name}
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            {picked.length
              ? "Stock is kept separately for each color. Bills and purchases will ask which color."
              : "No colors: stock is one count, and bills never ask for a color."}{" "}
            <Link href="/categories" className="underline-offset-2 hover:underline">
              Manage colors
            </Link>
          </p>
        </fieldset>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="size">Size</Label>
            <Input id="size" name="size" placeholder="4 inch" defaultValue={initial?.size ?? ""} />
          </div>
          <div>
            <Label htmlFor="variant">Variant / brand</Label>
            <Input id="variant" name="variant" placeholder="1.0mm - Brand A" defaultValue={initial?.variant ?? ""} />
          </div>
        </div>

        <div>
          <Label htmlFor="minStock">Low-stock alert level ({short})</Label>
          <Input
            id="minStock"
            name="minStock"
            type="number"
            min={0}
            step={qtyStep(unit)}
            defaultValue={initial?.minStock ?? 0}
            className={numInputClass}
          />
        </div>

        {/* On CREATE we ask for opening stock; on EDIT stock is changed via the stock
            controls on the Products page, not here. */}
        {!editing ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              {picked.length === 0 ? (
                <>
                  <Label htmlFor="initialStock">Opening stock ({short})</Label>
                  <Input
                    id="initialStock"
                    name="initialStock"
                    type="number"
                    min={0}
                    step={qtyStep(unit)}
                    defaultValue={0}
                    className={numInputClass}
                  />
                </>
              ) : (
                <fieldset className="space-y-2">
                  <legend className="mb-1.5 block text-[13px] font-medium text-ink-muted">
                    Opening stock per color ({short})
                  </legend>
                  {picked.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <label htmlFor={`opening_${c.id}`} className="flex w-28 items-center gap-1.5 text-[15px] text-ink">
                        <Swatch hex={c.hex} size={12} />
                        {c.name}
                      </label>
                      <Input
                        id={`opening_${c.id}`}
                        name={`opening_${c.id}`}
                        type="number"
                        min={0}
                        step={qtyStep(unit)}
                        defaultValue={0}
                        className={numInputClass}
                      />
                    </div>
                  ))}
                </fieldset>
              )}
              {unit.decimals && (
                <p className="mt-1.5 text-[13px] text-ink-muted">
                  Total length, e.g. 200 rolls × 80 m = 16000.
                </p>
              )}
            </div>
            {canSeeCost && (
              <div>
                <Label htmlFor="initialCostRs">Cost per {per} (Rs)</Label>
                <Input id="initialCostRs" name="initialCostRs" type="number" min={0} step="0.01" defaultValue={0} className={numInputClass} />
              </div>
            )}
          </div>
        ) : (
          canSeeCost && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="latestCostRs">Cost per {per} (Rs)</Label>
                <Input id="latestCostRs" name="latestCostRs" type="number" min={0} step="0.01" defaultValue={initial!.latestCostRs} className={numInputClass} />
              </div>
            </div>
          )
        )}

        {state.error && <FieldError>{state.error}</FieldError>}

        <div className="flex gap-2.5 pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Save product"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/products")}>
            Cancel
          </Button>
        </div>
        {!editing && (
          <p className="text-[13px] text-ink-muted">
            A unique product code (e.g. PRD-0005) is generated automatically.
          </p>
        )}
      </form>
    </Panel>
  );
}
