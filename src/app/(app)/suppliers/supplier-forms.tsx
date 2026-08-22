"use client";

import { useActionState } from "react";
import { createSupplier, recordSupplierPayment, restoreSupplier, type ActionResult } from "./actions";
import { Button, Panel, Input, Label } from "@/components/ui";

export function AddSupplier() {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => createSupplier(fd),
    { ok: false }
  );
  return (
    <Panel pad>
      <h2 className="mb-3 font-semibold text-ink">Add supplier</h2>
      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
        <div>
          <Label htmlFor="s-name">Name</Label>
          <Input id="s-name" name="name" required placeholder="Local Supplier Co." />
        </div>
        <div>
          <Label htmlFor="s-phone">Phone</Label>
          <Input id="s-phone" name="phone" placeholder="03xx-xxxxxxx" />
        </div>
        <div>
          <Label htmlFor="s-notes">Notes</Label>
          <Input id="s-notes" name="notes" placeholder="optional" />
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Add supplier"}
          </Button>
        </div>
      </form>
      {state.error && <p className="mt-2 text-sm text-bad">{state.error}</p>}
    </Panel>
  );
}

export function SupplierPayment({ supplierId }: { supplierId: string }) {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => recordSupplierPayment(fd),
    { ok: false }
  );
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="supplierId" value={supplierId} />
      <Input
        name="amountRs"
        type="number"
        step="0.01"
        min={0}
        placeholder="Pay Rs"
        className="w-28"
        aria-label="Payment amount in rupees"
        required
      />
      <Button type="submit" variant="secondary" disabled={pending} className="px-3 py-2">
        {pending ? "…" : "Pay"}
      </Button>
      {state.error && <span className="text-[13px] text-bad">{state.error}</span>}
    </form>
  );
}

export function RestoreSupplier({ supplierId }: { supplierId: string }) {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => restoreSupplier(fd),
    { ok: false }
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="supplierId" value={supplierId} />
      <Button type="submit" variant="secondary" disabled={pending} className="px-3 py-1.5">
        {pending ? "…" : "Restore"}
      </Button>
      {state.error && <span className="ml-1 text-xs text-bad">{state.error}</span>}
    </form>
  );
}
