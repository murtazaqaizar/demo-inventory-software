"use client";

import { Button } from "@/components/ui";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <div className="no-print">
      <Button type="button" onClick={() => window.print()}>
        {label}
      </Button>
    </div>
  );
}
