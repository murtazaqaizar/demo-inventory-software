"use client";

import { useActionState, useState } from "react";
import { voidInvoice } from "./actions";
import { Button, Input } from "@/components/ui";

export function VoidButton({ invoiceId, number }: { invoiceId: string; number: number }) {
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
      {state.error && <span className="text-[13px] text-bad">{state.error}</span>}
    </form>
  );
}
