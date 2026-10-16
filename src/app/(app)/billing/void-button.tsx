"use client";

import { useActionState, useState } from "react";
import { voidInvoice } from "./actions";
import { Button, Input } from "@/components/ui";
import { formatPKR } from "@/lib/money";

// `paidLaterPaisa`: account payments currently applied to this bill. Voiding does
// not undo them — they stay on the customer's account and settle their next bill.
export function VoidButton({ invoiceId, number, paidLaterPaisa = 0 }: { invoiceId: string; number: number; paidLaterPaisa?: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (_p: { ok: boolean; error?: string }, fd: FormData) => voidInvoice(fd),
    { ok: false }
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-bad underline hover:text-bad"
      >
        Void
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Input name="reason" placeholder={`Reason for voiding #${number}`} className="w-44" required />
      <Button type="submit" variant="danger" disabled={pending} className="px-3 py-1.5">
        {pending ? "…" : "Confirm"}
      </Button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm text-ink-muted">
        Cancel
      </button>
      {paidLaterPaisa > 0 && (
        <span className="basis-full text-[13px] text-warn">
          {formatPKR(paidLaterPaisa)} paid later on the customer&apos;s account is applied to this bill. After voiding it stays
          on their account as an advance and will settle their next bill. If that payment was also a mistake, reverse it
          from the customer&apos;s statement.
        </span>
      )}
      {state.error && <span className="basis-full text-[13px] text-bad">{state.error}</span>}
    </form>
  );
}
