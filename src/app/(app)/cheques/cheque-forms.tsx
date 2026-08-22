"use client";

import { useActionState } from "react";
import { createCheque, setChequeStatus, type ActionResult } from "./actions";
import { Button, Panel, Input, Label, Select, numInputClass } from "@/components/ui";
// (Select is used by the clear-destination dropdown below)

export function AddCheque() {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => createCheque(fd),
    { ok: false }
  );
  return (
    <Panel pad>
      <h2 className="mb-3 font-semibold text-ink">Record cheque</h2>
      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-6 sm:items-end">
        <div className="sm:col-span-1">
          <Label htmlFor="ch-dir">Type</Label>
          <Select id="ch-dir" name="direction" defaultValue="RECEIVED">
            <option value="RECEIVED">Received</option>
            <option value="ISSUED">Issued</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="ch-no">Cheque #</Label>
          <Input id="ch-no" name="number" required />
        </div>
        <div>
          <Label htmlFor="ch-bank">Bank</Label>
          <Input id="ch-bank" name="bank" required />
        </div>
        <div>
          <Label htmlFor="ch-amt">Amount (Rs)</Label>
          <Input id="ch-amt" name="amountRs" type="number" step="0.01" min={0} required className={numInputClass} />
        </div>
        <div>
          <Label htmlFor="ch-date">Date</Label>
          <Input id="ch-date" name="chequeDate" type="date" />
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "…" : "Add"}
          </Button>
        </div>
        <div className="sm:col-span-6">
          <Input name="partyName" placeholder="From / to (party name, optional)" />
        </div>
      </form>
      {state.error && <p className="mt-2 text-sm text-bad">{state.error}</p>}
    </Panel>
  );
}

export function ChequeStatusButtons({ chequeId, direction }: { chequeId: string; direction: "RECEIVED" | "ISSUED" }) {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => setChequeStatus(fd),
    { ok: false }
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="chequeId" value={chequeId} />
      {/* Where did the money go — cashed in hand, or into the bank? */}
      <Select name="destination" defaultValue="BANK" className="w-24" aria-label="Cleared to">
        <option value="CASH">to Cash</option>
        <option value="BANK">to Bank</option>
      </Select>
      <button
        type="submit"
        name="status"
        value="CLEARED"
        disabled={pending}
        title={direction === "RECEIVED" ? "Cheque cleared — money received" : "Cheque cleared — money paid out"}
        className="rounded-control border border-ok/30 bg-ok-soft px-3 py-1.5 text-[13px] font-medium text-ok hover:brightness-95 disabled:opacity-50"
      >
        Cleared
      </button>
      <button
        type="submit"
        name="status"
        value="BOUNCED"
        disabled={pending}
        className="rounded-control border border-bad/30 bg-bad-soft px-3 py-1.5 text-[13px] font-medium text-bad hover:brightness-95 disabled:opacity-50"
      >
        Bounced
      </button>
      {state.error && <span className="text-[13px] text-bad">{state.error}</span>}
    </form>
  );
}
