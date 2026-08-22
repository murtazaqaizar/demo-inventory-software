"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createReturn } from "./actions";
import {
  Button,
  Input,
  Label,
  Panel,
  Select,
  StickyActionBar,
  TotalReadout,
} from "@/components/ui";
import { ProductPicker, type PickerProduct } from "@/components/product-picker";
import { formatPKR } from "@/lib/money";

type CustomerOpt = { id: string; name: string; isCash: boolean };
type Line = { productId: string; unit: "PIECE" | "BOX" | "CARTON"; quantity: string; rateRs: string };

const emptyLine: Line = { productId: "", unit: "PIECE", quantity: "", rateRs: "" };

export function ReturnBuilder({
  products,
  customers,
}: {
  products: PickerProduct[];
  customers: CustomerOpt[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [refundMethod, setRefundMethod] = useState<"CREDIT_TO_ACCOUNT" | "CASH_REFUND">("CREDIT_TO_ACCOUNT");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);

  const totalPaisa = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + Math.round((Number(l.rateRs) || 0) * 100) * (Number(l.quantity) || 0),
        0
      ),
    [lines]
  );

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function submit() {
    setError(null);
    const items = lines
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => ({
        productId: l.productId,
        unit: l.unit,
        quantity: Number(l.quantity),
        rateRs: Number(l.rateRs) || 0,
      }));
    if (items.length === 0) {
      setError("Add at least one line with a product and quantity.");
      return;
    }
    startTransition(async () => {
      const res = await createReturn({ customerId, refundMethod, reason, items });
      if (res.ok) router.push("/returns");
      else setError(res.error ?? "Could not save the return.");
    });
  }

  return (
    <div className="space-y-6">
      <Panel pad>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="cust">Customer returning goods</Label>
            <Select id="cust" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isCash ? "Cash Sale (walk-in)" : c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="refund">How to settle it</Label>
            <Select
              id="refund"
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value as typeof refundMethod)}
            >
              <option value="CREDIT_TO_ACCOUNT">Credit to their account (reduces udhaar)</option>
              <option value="CASH_REFUND">Cash refund (money paid back)</option>
            </Select>
          </div>
        </div>
        <div className="mt-4">
          <Label htmlFor="reason">Reason (optional)</Label>
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged, wrong item…" />
        </div>
      </Panel>

      <Panel pad>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink">Returned items</h2>
          <Button type="button" variant="secondary" onClick={() => setLines((p) => [...p, { ...emptyLine }])} className="px-3 py-1.5">
            + Add line
          </Button>
        </div>

        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_90px_110px_auto] sm:items-center">
              <ProductPicker products={products} value={l.productId} onChange={(id) => updateLine(i, { productId: id })} />
              <Select value={l.unit} onChange={(e) => updateLine(i, { unit: e.target.value as Line["unit"] })} aria-label="Unit">
                <option value="PIECE">Piece</option>
                <option value="BOX">Box</option>
                <option value="CARTON">Carton</option>
              </Select>
              <Input type="number" min={1} placeholder="Qty" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
              <Input type="number" min={0} step="0.01" placeholder="Rate Rs" value={l.rateRs} onChange={(e) => updateLine(i, { rateRs: e.target.value })} />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLines((p) => (p.length === 1 ? p : p.filter((_, x) => x !== i)))}
                className="px-3 py-2"
                disabled={lines.length === 1}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-between border-t border-line pt-4 text-base">
          <span className="font-medium text-ink-muted">Credit total</span>
          <span className="font-semibold text-ink">{formatPKR(totalPaisa)}</span>
        </div>
      </Panel>

      {error && <p className="text-[13px] text-bad">{error}</p>}

      <StickyActionBar>
        <TotalReadout label="Credit total" value={formatPKR(totalPaisa)} />
        <div className="flex gap-2.5">
          <Button type="button" variant="secondary" onClick={() => router.push("/returns")}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save return"}
          </Button>
        </div>
      </StickyActionBar>
    </div>
  );
}
