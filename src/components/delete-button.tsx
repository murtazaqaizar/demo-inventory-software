"use client";

import { useActionState, useState } from "react";

type Result = { ok: boolean; error?: string; message?: string };

// Generic two-step delete: click Delete → Confirm/Cancel. Prevents accidental deletes.
export function DeleteButton({
  action,
  hidden,
  label = "Delete",
  confirmLabel = "Confirm delete",
}: {
  action: (fd: FormData) => Promise<Result>;
  hidden: Record<string, string>;
  label?: string;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (_p: Result, fd: FormData) => action(fd),
    { ok: false }
  );

  // Resting state is a text trigger in `bad`, never a red button per row —
  // a column of red buttons reads as an error state (design/DESIGN.md).
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-bad transition-colors duration-150 hover:underline"
      >
        {label}
      </button>
    );
  }

  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-[34px] items-center rounded-control bg-bad px-3.5 text-sm font-semibold text-white transition-[filter] duration-150 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {pending ? "…" : confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-sm font-medium text-ink-muted transition-colors duration-150 hover:text-ink"
      >
        Cancel
      </button>
      {state.error && <span className="text-[13px] text-bad">{state.error}</span>}
    </form>
  );
}
