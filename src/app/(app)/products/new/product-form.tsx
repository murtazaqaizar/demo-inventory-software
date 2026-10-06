"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct, type ActionResult } from "../actions";
import { CategoryCombobox } from "@/components/category-combobox";
import type { ProductTagRow } from "@/lib/products";
import { TagManager } from "./tag-manager";
import { Button, FieldError, Input, Label, Panel, numInputClass } from "@/components/ui";

export type ProductInitial = {
  id: string;
  name: string;
  size: string | null;
  variant: string | null;
  category: string | null;
  piecesPerBox: number;
  piecesPerCarton: number;
  minStockLevel: number;
  latestCostRs: number;
};

export function ProductForm({
  canSeeCost,
  isOwner,
  tags,
  initial,
}: {
  canSeeCost: boolean;
  isOwner: boolean;
  tags: ProductTagRow[];
  initial?: ProductInitial;
}) {
  const router = useRouter();
  const editing = !!initial;
  const [managingTags, setManagingTags] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => (editing ? updateProduct(fd) : createProduct(fd)),
    { ok: false }
  );

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
            <Label htmlFor="size">Size</Label>
            <Input id="size" name="size" placeholder="4 inch" defaultValue={initial?.size ?? ""} />
          </div>
          <div>
            <Label htmlFor="variant">Variant / brand</Label>
            <Input id="variant" name="variant" placeholder="1.0mm - Brand A" defaultValue={initial?.variant ?? ""} />
          </div>
        </div>

        <div>
          <div className="flex max-w-[480px] items-baseline justify-between gap-2">
            <Label htmlFor="category">Category</Label>
            <button
              type="button"
              onClick={() => setManagingTags((v) => !v)}
              className="text-[13px] text-ink-muted hover:text-ink hover:underline"
            >
              {managingTags ? "Done" : "Manage tags"}
            </button>
          </div>
          <CategoryCombobox options={tags.map((t) => t.name)} defaultValue={initial?.category ?? ""} />
          {managingTags && <TagManager tags={tags} canRemove={isOwner} />}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <Label htmlFor="piecesPerBox">Pieces per box</Label>
            <Input id="piecesPerBox" name="piecesPerBox" type="number" min={1} defaultValue={initial?.piecesPerBox ?? 1} className={numInputClass} />
          </div>
          <div>
            <Label htmlFor="piecesPerCarton">Pieces per carton</Label>
            <Input id="piecesPerCarton" name="piecesPerCarton" type="number" min={0} defaultValue={initial?.piecesPerCarton ?? 0} className={numInputClass} />
          </div>
          <div>
            <Label htmlFor="minStockLevel">Low-stock alert level</Label>
            <Input id="minStockLevel" name="minStockLevel" type="number" min={0} defaultValue={initial?.minStockLevel ?? 0} className={numInputClass} />
          </div>
        </div>

        {/* On CREATE we ask for opening stock; on EDIT stock is changed via the stock
            controls on the Products page, not here. */}
        {!editing ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="initialStock">Opening stock count (pieces)</Label>
              <Input id="initialStock" name="initialStock" type="number" min={0} defaultValue={0} className={numInputClass} />
            </div>
            {canSeeCost && (
              <div>
                <Label htmlFor="initialCostRs">Initial cost / piece (Rs)</Label>
                <Input id="initialCostRs" name="initialCostRs" type="number" min={0} step="0.01" defaultValue={0} className={numInputClass} />
              </div>
            )}
          </div>
        ) : (
          canSeeCost && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="latestCostRs">Cost / piece (Rs)</Label>
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
            A unique product code (e.g. ABR-0005) is generated automatically.
          </p>
        )}
      </form>
    </Panel>
  );
}
