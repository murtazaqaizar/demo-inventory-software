"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct, type ActionResult } from "../actions";
import { Button, FieldError, Input, Label, Panel, Select, numInputClass } from "@/components/ui";
import { qtyStep, unitLabel, unitShort, type Unit } from "@/lib/qty";

export type CategoryOption = { id: string; name: string; unit: Unit };

export type ProductInitial = {
  id: string;
  name: string;
  size: string | null;
  variant: string | null;
  color: string | null;
  categoryId: string | null;
  minStock: number; // in the product's unit (not thousandths)
  latestCostRs: number;
};

export function ProductForm({
  canSeeCost,
  categories,
  initial,
}: {
  canSeeCost: boolean;
  categories: CategoryOption[];
  initial?: ProductInitial;
}) {
  const router = useRouter();
  const editing = !!initial;
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => (editing ? updateProduct(fd) : createProduct(fd)),
    { ok: false }
  );
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const unit: Unit = categories.find((c) => c.id === categoryId)?.unit ?? "PIECE";
  const short = unitShort(unit);

  useEffect(() => {
    if (state.ok) router.push("/products");
  }, [state.ok, router]);

  return (
    <Panel pad className="max-w-2xl">
      <form action={formAction} className="space-y-5">
        {editing && <input type="hidden" name="productId" value={initial!.id} />}
        <div>
          <Label htmlFor="name">Product name</Label>
          <Input id="name" name="name" required placeholder="Cutting Disc" defaultValue={initial?.name} />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="categoryId">Category</Label>
            <Select
              id="categoryId"
              name="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">No category (by the piece)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {unitLabel(c.unit).toLowerCase()}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-[13px] text-ink-muted">
              Counted in <span className="font-medium text-ink">{unitLabel(unit).toLowerCase()}s</span>
              {" · "}
              <Link href="/categories" className="underline-offset-2 hover:underline">
                Manage categories
              </Link>
            </p>
          </div>
          <div>
            <Label htmlFor="color">Color (optional)</Label>
            <Input id="color" name="color" placeholder="Red" defaultValue={initial?.color ?? ""} />
          </div>
        </div>

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
              {unit !== "PIECE" && (
                <p className="mt-1.5 text-[13px] text-ink-muted">
                  Total length, e.g. 200 rolls × 80 m = 16000.
                </p>
              )}
            </div>
            {canSeeCost && (
              <div>
                <Label htmlFor="initialCostRs">Cost per {unitLabel(unit).toLowerCase()} (Rs)</Label>
                <Input id="initialCostRs" name="initialCostRs" type="number" min={0} step="0.01" defaultValue={0} className={numInputClass} />
              </div>
            )}
          </div>
        ) : (
          canSeeCost && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="latestCostRs">Cost per {unitLabel(unit).toLowerCase()} (Rs)</Label>
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
