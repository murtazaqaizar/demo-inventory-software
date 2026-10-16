"use client";

import { useActionState, useState } from "react";
import { createCustomer, recordCustomerPayment, restoreCustomer, reverseCustomerPayment, type ActionResult } from "./actions";
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
  const [method, setMethod] = useState("CASH");
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => recordCustomerPayment(fd),
    { ok: false }
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="customerId" value={customerId} />
      {/* The server warned that this is more than they owe; sending again confirms it. */}
      {state.overpay && <input type="hidden" name="confirmOverpay" value="1" />}
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
      <Select name="method" value={method} onChange={(e) => setMethod(e.target.value)} className="w-24" aria-label="Payment method">
        <option value="CASH">Cash</option>
        <option value="ONLINE">Online</option>
        <option value="CHEQUE">Cheque</option>
      </Select>
      {method === "CHEQUE" && (
        <>
          <Input name="chequeNumber" placeholder="Cheque #" className="w-24" aria-label="Cheque number" required />
          <Input name="chequeBank" placeholder="Bank" className="w-20" aria-label="Bank" />
        </>
      )}
      <Button type="submit" variant={state.overpay ? "danger" : "secondary"} disabled={pending} className="px-3 py-2">
        {pending ? "…" : state.overpay ? "Pay anyway" : "Pay"}
      </Button>
      {state.overpay && <span className="basis-full text-[13px] text-warn">{state.overpay}</span>}
      {state.error && <span className="text-[13px] text-bad">{state.error}</span>}
    </form>
  );
}

// Owner-only "Reverse" link on a payment row of the customer statement. Asks for
// a second click before doing it, since the customer will owe the money again.
export function ReversePayment({ paymentId, label }: { paymentId: string; label: string }) {
  const [sure, setSure] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => reverseCustomerPayment(fd),
    { ok: false }
  );
  if (!sure) {
    return (
      <button type="button" onClick={() => setSure(true)} className="no-print text-xs text-bad underline">
        Reverse
      </button>
    );
  }
  return (
    <form action={formAction} className="no-print inline-flex flex-wrap items-center gap-1">
      <input type="hidden" name="paymentId" value={paymentId} />
      <span className="text-xs text-ink-muted">Reverse {label}? The customer will owe it again.</span>
      <Button type="submit" variant="danger" disabled={pending} className="px-2 py-1 text-xs">
        {pending ? "…" : "Yes, reverse"}
      </Button>
      <button type="button" onClick={() => setSure(false)} className="text-xs text-ink-muted">
        Cancel
      </button>
      {state.error && <span className="text-xs text-bad">{state.error}</span>}
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
