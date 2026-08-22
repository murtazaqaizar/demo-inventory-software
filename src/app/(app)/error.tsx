"use client";

// Catches anything a page throws while rendering — a dropped database
// connection, a query that fails. Without this the shopkeeper sees Next's
// default screen with a digest hash on it, which tells them nothing and offers
// no way forward. The sidebar stays put, so they can still go elsewhere.

import { useEffect } from "react";
import Link from "next/link";
import { Button, Panel } from "@/components/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The real error only exists on the server in production; log whatever
    // reached the browser so a support call has something to go on.
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <Panel pad>
        <h1 className="text-lg font-semibold text-ink">This page couldn&apos;t load</h1>
        <p className="mt-2 text-[15px] text-ink-muted">
          Something went wrong while loading this screen. Nothing you had saved is affected — this
          is a display problem, not a data problem.
        </p>
        <p className="mt-2 text-[15px] text-ink-muted">
          Try again. If it keeps happening, check your internet connection first: the app talks to a
          database over the internet and a weak connection is the usual cause.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Link href="/">
            <Button variant="secondary">Go to dashboard</Button>
          </Link>
        </div>

        {error.digest && (
          <p className="mt-5 border-t border-line pt-3 text-[13px] text-ink-faint">
            If you report this, quote reference {error.digest}
          </p>
        )}
      </Panel>
    </div>
  );
}
