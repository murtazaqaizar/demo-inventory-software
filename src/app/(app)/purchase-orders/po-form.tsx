"use client";

// Purchase order form: vendor details typed per order, then free-text item
// lines (item, unit, qty, rate). Nothing here reads or writes stock.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, FieldError, Input, Label, Panel, StickyActionBar, TotalReadout, inputClass } from "@/components/ui";
import { formatPKR, rupeesToPaisa } from "@/lib/money";
import { lineAmount, toMilli } from "@/lib/qty";
import type { PoLineInput, PoSeed } from "@/lib/purchase-orders";
import { savePurchaseOrder } from "./actions";

const blankLine = (): PoLineInput => ({ description: "", unit: "pcs", qty: "", rateRs: "" });

function lineTotalPaisa(l: PoLineInput): number {
  const q = toMilli(l.qty);
  const r = rupeesToPaisa(Number(l.rateRs) || 0);
  return Number.isFinite(q) && q > 0 ? lineAmount(q, r) : 0;
}

export function PurchaseOrderForm({
  id,
  seed,
  units,
}: {
  id?: string;
  seed: PoSeed;
  units: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({
    date: seed.date,
    vendorName: seed.vendorName,
    vendorContact: seed.vendorContact,
    vendorPhone: seed.vendorPhone,
    vendorAddress: seed.vendorAddress,
    notes: seed.notes,
  });
  const [lines, setLines] = useState<PoLineInput[]>(seed.lines.length ? seed.lines : [blankLine()]);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  const setLine = (i: number, k: keyof PoLineInput, value: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: value } : l)));

  const total = lines.reduce((s, l) => s + lineTotalPaisa(l), 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Blank rows left at the bottom are ignored, not an error.
    const filled = lines.filter((l) => String(l.description).trim() || String(l.qty).trim() || String(l.rateRs).trim());
    start(async () => {
      const res = await savePurchaseOrder({ ...(id ? { id } : {}), ...v, lines: filled });
      if (res.ok) router.push(`/purchase-orders/${res.id}/print`);
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Panel pad>
        <h2 className="font-semibold text-ink">Party (vendor)</h2>
        <p className="mb-4 text-[13px] text-ink-muted">Printed on the left of the purchase order.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="vendorName">Party name</Label>
            <Input id="vendorName" value={v.vendorName} onChange={set("vendorName")} required />
          </div>
          <div>
            <Label htmlFor="vendorContact">Contact person</Label>
            <Input id="vendorContact" value={v.vendorContact} onChange={set("vendorContact")} />
          </div>
          <div>
            <Label htmlFor="vendorPhone">Phone</Label>
            <Input id="vendorPhone" value={v.vendorPhone} onChange={set("vendorPhone")} placeholder="03xx-xxxxxxx" />
          </div>
          <div>
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={v.date} onChange={set("date")} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="vendorAddress">Address</Label>
            <Input id="vendorAddress" value={v.vendorAddress} onChange={set("vendorAddress")} />
          </div>
        </div>
      </Panel>

      <Panel pad>
        <h2 className="mb-4 font-semibold text-ink">Items</h2>
        <datalist id="po-units">
          {units.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_8rem_8rem_auto]">
              <div className="col-span-2 sm:col-span-1">
                {i === 0 && <Label htmlFor={`d${i}`}>Item</Label>}
                <Input id={`d${i}`} aria-label="Item" value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} />
              </div>
              <div>
                {i === 0 && <Label htmlFor={`u${i}`}>Unit</Label>}
                <Input id={`u${i}`} aria-label="Unit" list="po-units" value={l.unit} onChange={(e) => setLine(i, "unit", e.target.value)} />
              </div>
              <div>
                {i === 0 && <Label htmlFor={`q${i}`}>Qty</Label>}
                <Input id={`q${i}`} aria-label="Quantity" inputMode="decimal" className="text-right font-mono" value={String(l.qty)} onChange={(e) => setLine(i, "qty", e.target.value)} />
              </div>
              <div>
                {i === 0 && <Label htmlFor={`r${i}`}>Rate (Rs)</Label>}
                <Input id={`r${i}`} aria-label="Rate" inputMode="decimal" className="text-right font-mono" value={String(l.rateRs)} onChange={(e) => setLine(i, "rateRs", e.target.value)} />
              </div>
              <div className="flex h-10 items-center justify-end font-mono text-[15px]">{formatPKR(lineTotalPaisa(l))}</div>
              <div className="flex h-10 items-center">
                <button
                  type="button"
                  className="text-[13px] text-ink-muted underline hover:text-bad disabled:opacity-40"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, blankLine()])}>
            + Add line
          </Button>
        </div>

        <div className="mt-6">
          <Label htmlFor="notes">Note (optional, printed at the bottom)</Label>
          <textarea id="notes" className={`${inputClass} min-h-[4.5rem] py-2`} value={v.notes} onChange={set("notes")} />
        </div>
      </Panel>

      {error && <FieldError>{error}</FieldError>}

      <StickyActionBar>
        <TotalReadout label="Total" value={formatPKR(total)} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => router.push("/purchase-orders")}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : id ? "Save changes" : "Save purchase order"}
          </Button>
        </div>
      </StickyActionBar>
    </form>
  );
}
