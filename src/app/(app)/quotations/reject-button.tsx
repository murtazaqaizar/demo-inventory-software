"use client";

import { useState, useTransition } from "react";
import { setQuotationRejected } from "./actions";

export function RejectButton({ quotationId, reopen = false }: { quotationId: string; reopen?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setQuotationRejected(quotationId, !reopen);
            if (!res.ok) setError(res.error ?? "Could not update.");
          })
        }
        className={reopen ? "underline" : "text-bad underline hover:text-bad"}
      >
        {pending ? "…" : reopen ? "Reopen" : "Mark rejected"}
      </button>
      {error && <span className="text-[13px] text-bad">{error}</span>}
    </>
  );
}
