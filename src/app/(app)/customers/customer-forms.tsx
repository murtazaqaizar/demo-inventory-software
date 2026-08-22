"use client";

import { useActionState } from "react";
import { createCustomer, recordCustomerPayment, restoreCustomer, type ActionResult } from "./actions";
import { Button, Panel, Input, Label, Select, numInputClass } from "@/components/ui";

export function AddCustomer({ canSetOpening }: { canSetOpening: boolean }) {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => createCustomer(fd),
    { ok: false }
  );
  return (
    <Panel pad>
      <h2 className="mb-3 font-semibold text-ink">Add customer</h2>
      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
        <div>
          <Label htmlFor="c-name">Name</Label>
          <Input id="c-name" name="name" required placeholder="Customer name" />
        </div>
        <div>
          <Label htmlFor="c-phone">Phone</Label>
          <Input id="c-phone" name="phone" placeholder="03xx-xxxxxxx" />
        </div>
        {canSetOpening && (
          <>
            <div>
              <Label htmlFor="c-opening">Opening udhaar (Rs)</Label>
              <Input id="c-opening" name="openingBalanceRs" type="number" min={0} step="0.01" defaultValue={0} className={numInputClass} />
            </div>
            <div>
              <Label htmlFor="c-limit">Credit limit (Rs)</Label>
              <Input id="c-limit" name="creditLimitRs" type="number" min={0} step="0.01" defaultValue={0} placeholder="0 = no limit" className={numInputClass} />
            </div>
          </>
        )}
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Add customer"}
          </Button>
        </div>
      </form>
      {state.error && <p className="mt-2 text-sm text-bad">{state.error}</p>}
    </Panel>
  );
}

export function CustomerPayment({ customerId }: { customerId: string }) {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => recordCustomerPayment(fd),
    { ok: false }
  );
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="customerId" value={customerId} />
      <Input
        name="amountRs"
        type="number"
        step="0.01"
        min={0}
        placeholder="Rs"
        className="w-24"
        aria-label="Payment amount"
        required
      />
      <Select name="method" defaultValue="CASH" className="w-24" aria-label="Payment method">
        <option value="CASH">Cash</option>
        <option value="ONLINE">Online</option>
        <option value="CHEQUE">Cheque</option>
      </Select>
      <Button type="submit" variant="secondary" disabled={pending} className="px-3 py-2">
        {pending ? "…" : "Pay"}
      </Button>
      {state.error && <span className="text-[13px] text-bad">{state.error}</span>}
    </form>
  );
}

export function RestoreCustomer({ customerId }: { customerId: string }) {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => restoreCustomer(fd),
    { ok: false }
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="customerId" value={customerId} />
      <Button type="submit" variant="secondary" disabled={pending} className="px-3 py-1.5">
        {pending ? "…" : "Restore"}
      </Button>
      {state.error && <span className="ml-1 text-xs text-bad">{state.error}</span>}
    </form>
  );
}
