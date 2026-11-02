"use client";

import { useState, useTransition } from "react";
import { setPurchaseOrderStatus } from "./actions";

const LABEL = { OPEN: "Reopen", RECEIVED: "Mark received", CANCELLED: "Cancel order" } as const;

export function StatusButton({ id, to }: { id: string; to: "OPEN" | "RECEIVED" | "CANCELLED" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setPurchaseOrderStatus(id, to);
            if (!res.ok) setError(res.error ?? "Could not update.");
          })
        }
        className={to === "CANCELLED" ? "text-bad underline hover:text-bad" : "underline"}
      >
        {pending ? "…" : LABEL[to]}
      </button>
      {error && <span className="text-[13px] text-bad">{error}</span>}
    </>
  );
}
