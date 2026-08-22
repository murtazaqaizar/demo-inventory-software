"use client";

import { useActionState } from "react";
import { recordDrawing, recordTransfer, adjustAccount, type ActionResult } from "./actions";
import { Button, Panel, Input, Label, Select, numInputClass } from "@/components/ui";

type Acct = { id: string; name: string; kind: string };

export function CashForms({ accounts }: { accounts: Acct[] }) {
  const [drawState, drawAction, drawPending] = useActionState(
    async (_p: ActionResult, fd: FormData) => recordDrawing(fd),
    { ok: false }
  );
  const [xferState, xferAction, xferPending] = useActionState(
    async (_p: ActionResult, fd: FormData) => recordTransfer(fd),
    { ok: false }
  );
  const [adjState, adjAction, adjPending] = useActionState(
    async (_p: ActionResult, fd: FormData) => adjustAccount(fd),
    { ok: false }
  );

  const opts = accounts.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name}
    </option>
  ));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel pad>
        <h2 className="mb-3 font-semibold text-ink">Owner withdrawal (drawing)</h2>
        <form action={drawAction} className="space-y-3">
          <div>
            <Label htmlFor="d-acct">From</Label>
            <Select id="d-acct" name="accountId">{opts}</Select>
          </div>
          <div>
            <Label htmlFor="d-amt">Amount (Rs)</Label>
            <Input id="d-amt" name="amountRs" type="number" step="0.01" min={0} required className={numInputClass} />
          </div>
          <Input name="note" placeholder="Note (optional)" />
          <Button type="submit" disabled={drawPending}>
            {drawPending ? "…" : "Record drawing"}
          </Button>
          {drawState.error && <p className="text-[13px] text-bad">{drawState.error}</p>}
        </form>
      </Panel>

      <Panel pad>
        <h2 className="mb-3 font-semibold text-ink">Transfer</h2>
        <form action={xferAction} className="space-y-3">
          <div>
            <Label htmlFor="t-from">From</Label>
            <Select id="t-from" name="fromAccountId">{opts}</Select>
          </div>
          <div>
            <Label htmlFor="t-to">To</Label>
            <Select id="t-to" name="toAccountId" defaultValue={accounts[1]?.id}>{opts}</Select>
          </div>
          <div>
            <Label htmlFor="t-amt">Amount (Rs)</Label>
            <Input id="t-amt" name="amountRs" type="number" step="0.01" min={0} required className={numInputClass} />
          </div>
          <Button type="submit" disabled={xferPending}>
            {xferPending ? "…" : "Transfer"}
          </Button>
          {xferState.error && <p className="text-[13px] text-bad">{xferState.error}</p>}
        </form>
      </Panel>

      <Panel pad>
        <h2 className="mb-3 font-semibold text-ink">Opening / adjust</h2>
        <form action={adjAction} className="space-y-3">
          <div>
            <Label htmlFor="a-acct">Account</Label>
            <Select id="a-acct" name="accountId">{opts}</Select>
          </div>
          <div>
            <Label htmlFor="a-amt">Amount (Rs, +/−)</Label>
            <Input id="a-amt" name="amountRs" type="number" step="0.01" required className={numInputClass} />
          </div>
          <Input name="note" placeholder="e.g. Opening cash" />
          <Button type="submit" disabled={adjPending}>
            {adjPending ? "…" : "Apply"}
          </Button>
          {adjState.error && <p className="text-[13px] text-bad">{adjState.error}</p>}
        </form>
      </Panel>
    </div>
  );
}
