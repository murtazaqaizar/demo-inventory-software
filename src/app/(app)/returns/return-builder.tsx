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
import { LineColorSelect } from "@/components/line-color";
import { formatPKR } from "@/lib/money";
import { PIECE, PIECE_UNIT_ID, lineAmount, qtyStep, toMilli, type Unit, type UnitOption } from "@/lib/qty";

type CustomerOpt = { id: string; name: string; isCash: boolean };
// "custom" credits a free-text bill line (goods bought from outside): money only, no stock.
type Line = { kind: "stock" | "custom"; productId: string; colorId: string; description: string; unitId: string; qty: string; rateRs: string };

const emptyLine: Line = { kind: "stock", productId: "", colorId: "", description: "", unitId: PIECE_UNIT_ID, qty: "", rateRs: "" };

export function ReturnBuilder({
  products,
  customers,
  units,
}: {
  products: PickerProduct[];
  customers: CustomerOpt[];
  units: UnitOption[]; // for custom lines
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
        (s, l) => s + lineAmount(toMilli(l.qty || 0) || 0, Math.round((Number(l.rateRs) || 0) * 100)),
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
      .filter((l) => (l.kind === "stock" ? l.productId : l.description.trim()) && Number(l.qty) > 0)
      .map((l) =>
        l.kind === "stock"
          ? { productId: l.productId, colorId: l.colorId || undefined, qty: Number(l.qty), rateRs: Number(l.rateRs) || 0 }
          : { description: l.description.trim(), unitId: l.unitId, qty: Number(l.qty), rateRs: Number(l.rateRs) || 0 }
      );
    if (items.length === 0) {
      setError("Add at least one line with a product (or custom item name) and quantity.");
      return;
    }
    const noColor = lines.find(
      (l) => l.kind === "stock" && l.productId && !l.colorId && (products.find((p) => p.id === l.productId)?.colors?.length ?? 0) > 0
    );
    if (noColor) {
      setError(`Pick a color for ${products.find((p) => p.id === noColor.productId)?.name}.`);
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
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setLines((p) => [...p, { ...emptyLine }])} className="px-3 py-1.5">
              + Add line
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLines((p) => [...p, { ...emptyLine, kind: "custom" }])}
              className="px-3 py-1.5"
            >
              + Custom item
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {lines.map((l, i) => {
            const unit: Unit | null =
              l.kind === "custom"
                ? (units.find((u) => u.id === l.unitId) ?? PIECE)
                : (products.find((p) => p.id === l.productId)?.unit ?? null);
            return (
            <div key={i} className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_110px_120px_auto] sm:items-center">
              {l.kind === "stock" ? (
                <ProductPicker
                  products={products}
                  value={l.productId}
                  onChange={(id) => {
                    const colors = products.find((p) => p.id === id)?.colors ?? [];
                    updateLine(i, { productId: id, colorId: colors.length === 1 ? colors[0].id : "" });
                  }}
                />
              ) : (
                <Input
                  placeholder="Custom item name (not from stock)"
                  aria-label="Custom item name"
                  maxLength={120}
                  value={l.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                />
              )}
              {l.kind === "custom" ? (
                <Select value={l.unitId} onChange={(e) => updateLine(i, { unitId: e.target.value })} aria-label="Unit">
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className="text-[13px] text-ink-muted">{unit?.name ?? ""}</span>
              )}
              <Input
                type="number"
                min={0}
                step={qtyStep(unit)}
                placeholder={unit ? `Qty (${unit.short})` : "Qty"}
                aria-label={unit ? `Quantity in ${unit.short}` : "Quantity"}
                value={l.qty}
                onChange={(e) => updateLine(i, { qty: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder={unit ? `Rate/${unit.short} Rs` : "Rate Rs"}
                aria-label={unit ? `Rate per ${unit.name.toLowerCase()} in rupees` : "Rate in rupees"}
                value={l.rateRs}
                onChange={(e) => updateLine(i, { rateRs: e.target.value })}
              />
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
              {(() => {
                const p = products.find((x) => x.id === l.productId);
                return p && (p.colors?.length ?? 0) > 0 ? (
                  <LineColorSelect product={p} value={l.colorId} onChange={(colorId) => updateLine(i, { colorId })} />
                ) : null;
              })()}
            </div>
            );
          })}
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
