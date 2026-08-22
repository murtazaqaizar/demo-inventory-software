"use client";

import { useActionState, useState } from "react";
import { permanentlyDeleteCustomer, type ActionResult } from "./actions";
import { Button } from "@/components/ui";

// Two-step confirm for the irreversible purge: click Delete permanently → confirm.
export function PermanentDeleteCustomer({
  customerId,
  customerName,
  billCount,
  compact = false,
}: {
  customerId: string;
  customerName: string;
  billCount?: number;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => permanentlyDeleteCustomer(fd),
    { ok: false }
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact ? "text-bad underline hover:text-bad" : "text-sm font-medium text-bad underline hover:text-bad"}
      >
        Delete permanently
      </button>
    );
  }

  return (
    <div className="rounded-control border border-bad/30 bg-bad-soft p-4">
      <p className="text-sm font-semibold text-bad">Permanently delete {customerName}?</p>
      <p className="mt-1 text-sm text-bad">
        This erases the customer{typeof billCount === "number" ? ` and all ${billCount} of their bills` : " and all their bills, payments and returns"} for good. This cannot be undone. Stock and cash already recorded are left as they are.
      </p>
      <form action={formAction} className="mt-3">
        <input type="hidden" name="customerId" value={customerId} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? "Deleting…" : "Yes, delete permanently"}
          </Button>
          <button type="button" onClick={() => setOpen(false)} className="text-[15px] text-ink-muted">
            Cancel
          </button>
          {state.error && <span className="text-[13px] text-bad">{state.error}</span>}
        </div>
      </form>
    </div>
  );
}
