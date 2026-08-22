"use client";

import { useActionState } from "react";
import { recordMovement, type ActionResult } from "./actions";
import { Button, Input, Select } from "@/components/ui";

// One control for the three hand-entered stock movements (feature 6, 18 + adjust).
export function StockAdjuster({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => recordMovement(fd),
    { ok: false }
  );

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="productId" value={productId} />
      <Select name="kind" defaultValue="RETURN_IN" className="w-28" aria-label="Movement type">
        <option value="RETURN_IN">Return in</option>
        <option value="SAMPLE_OUT">Sample out</option>
        <option value="ADJUST">Adjust ±</option>
      </Select>
      <Input
        name="qty"
        type="number"
        placeholder="pcs"
        className="w-20"
        aria-label="Quantity in pieces"
        required
      />
      <Button type="submit" variant="secondary" disabled={pending} className="px-3 py-2">
        {pending ? "…" : "Apply"}
      </Button>
      {state.error && <span className="text-[13px] text-bad">{state.error}</span>}
    </form>
  );
}
