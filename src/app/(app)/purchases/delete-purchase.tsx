"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deletePurchase, type ActionResult } from "./actions";

// Two-step delete with a redirect back to the list, for the edit page's danger zone.
export function DeletePurchase({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => deletePurchase(fd),
    { ok: false }
  );

  useEffect(() => {
    if (state.ok) {
      router.push("/purchases");
      router.refresh();
    }
  }, [state.ok, router]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-bad transition-colors duration-150 hover:underline"
      >
        Delete purchase
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-[34px] items-center rounded-control bg-bad px-3.5 text-sm font-semibold text-white transition-[filter] duration-150 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {pending ? "Deleting…" : "Yes, delete and reverse the stock"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-ink-muted transition-colors duration-150 hover:text-ink">
        Cancel
      </button>
      {state.error && <p className="w-full text-[13px] text-bad">{state.error}</p>}
    </form>
  );
}
