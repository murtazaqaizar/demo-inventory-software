"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInvoice, editInvoice, getLastPrice, type ShortStock } from "../actions";
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
import { UNITS, formatQtyUnit, lineAmount, qtyStep, toMilli, unitLabel, unitShort, type Unit } from "@/lib/qty";

type CustomerOpt = { id: string; name: string; isCash: boolean };
// A "stock" line sells a product, in that product's unit. A "custom" line is free
// text for goods bought from outside for this customer: it has its own unit and an
// optional cost, and never touches stock.
type Line = {
  kind: "stock" | "custom";
  productId: string;
  description: string;
  unit: Unit; // custom lines only — a stock line uses its product's unit
  qty: string;
  rateRs: string;
  costRs: string; // custom lines only
  isSample: boolean;
  lastHint?: string | null;
};
type Pay = { method: "CASH" | "CHEQUE" | "ONLINE"; amountRs: string; chequeNumber: string; chequeBank: string; chequeDate: string };

const emptyLine: Line = { kind: "stock", productId: "", description: "", unit: "PIECE", qty: "", rateRs: "", costRs: "", isSample: false };
const emptyCustom: Line = { ...emptyLine, kind: "custom" };
const emptyPay: Pay = { method: "CASH", amountRs: "", chequeNumber: "", chequeBank: "", chequeDate: "" };

export type BillEdit = {
  invoiceId: string;
  number: number;
  customerId: string;
  date: string; // YYYY-MM-DD
  lines: {
    productId: string | null;
    description: string | null;
    unit: Unit;
    qty: number; // in the unit (not thousandths)
    rateRs: number;
    costRs: number;
    isSample: boolean;
  }[];
  payments: { method: "CASH" | "CHEQUE" | "ONLINE"; amountRs: number }[];
};

export function BillingBuilder({
  products,
  customers,
  today,
  edit,
}: {
  products: PickerProduct[];
  customers: CustomerOpt[];
  // Today comes from the server rather than the browser: it is the server's
  // clock that decides whether a saved date counts as "today", and reading the
  // browser's during render would differ from the server-rendered HTML.
  today: string;
  edit?: BillEdit;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [belowCost, setBelowCost] = useState<string[] | null>(null);
  const [shortStock, setShortStock] = useState<ShortStock[] | null>(null);
  const [creditWarning, setCreditWarning] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState(
    edit?.customerId ?? customers.find((c) => c.isCash)?.id ?? ""
  );
  // Goods often go out before the bill is written up, so the date is editable
  // rather than fixed to the moment you press save.
  const [date, setDate] = useState(edit?.date ?? today);
  const [lines, setLines] = useState<Line[]>(
    edit
      ? edit.lines.map((l) => ({
          kind: l.productId ? ("stock" as const) : ("custom" as const),
          productId: l.productId ?? "",
          description: l.description ?? "",
          unit: l.unit,
          qty: String(l.qty),
          rateRs: l.isSample ? "" : String(l.rateRs),
          costRs: !l.productId && l.costRs ? String(l.costRs) : "",
          isSample: l.isSample,
        }))
      : [{ ...emptyLine }]
  );
  const [payments, setPayments] = useState<Pay[]>(
    edit && edit.payments.length > 0
      ? edit.payments.map((p) => ({ ...emptyPay, method: p.method, amountRs: String(p.amountRs) }))
      : [{ ...emptyPay }]
  );

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const totalPaisa = useMemo(
    () =>
      lines.reduce((s, l) => {
        if (l.isSample) return s;
        return s + lineAmount(toMilli(l.qty || 0) || 0, Math.round((Number(l.rateRs) || 0) * 100));
      }, 0),
    [lines]
  );
  const paidPaisa = useMemo(
    () => payments.reduce((s, p) => s + Math.round((Number(p.amountRs) || 0) * 100), 0),
    [payments]
  );
  const udhaarPaisa = Math.max(0, totalPaisa - paidPaisa);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function updatePay(i: number, patch: Partial<Pay>) {
    setPayments((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  async function onProductChange(i: number, productId: string) {
    updateLine(i, { productId, lastHint: null });
    if (!productId || !customerId || selectedCustomer?.isCash) return;
    const last = await getLastPrice(customerId, productId);
    if (last) {
      const unit = products.find((p) => p.id === productId)?.unit ?? "PIECE";
      updateLine(i, {
        lastHint: `Last: Rs ${last.rateRs.toFixed(2)} / ${unitLabel(unit).toLowerCase()}`,
        rateRs: lines[i].rateRs || String(last.rateRs),
      });
    }
  }

  function clearWarnings() {
    setError(null);
    setBelowCost(null);
    setShortStock(null);
    setCreditWarning(null);
  }

  function submit(ack: { belowCost?: boolean; shortStock?: boolean; overLimit?: boolean } = {}) {
    clearWarnings();
    const items = lines
      .filter((l) => (l.kind === "stock" ? l.productId : l.description.trim()) && Number(l.qty) > 0)
      .map((l) =>
        l.kind === "stock"
          ? {
              productId: l.productId,
              qty: Number(l.qty),
              rateRs: l.isSample ? 0 : Number(l.rateRs) || 0,
              isSample: l.isSample,
            }
          : {
              description: l.description.trim(),
              unit: l.unit,
              qty: Number(l.qty),
              rateRs: Number(l.rateRs) || 0,
              costRs: Number(l.costRs) || undefined,
              isSample: false,
            }
      );
    if (items.length === 0) {
      setError("Add at least one line with a product (or custom item name) and quantity.");
      return;
    }
    if (!customerId) {
      setError("Select a customer (or Cash Sale).");
      return;
    }
    const pays = payments
      .filter((p) => Number(p.amountRs) > 0)
      .map((p) => ({
        method: p.method,
        amountRs: Number(p.amountRs),
        chequeNumber: p.chequeNumber || undefined,
        chequeBank: p.chequeBank || undefined,
        chequeDate: p.chequeDate || undefined,
      }));

    startTransition(async () => {
      const payload = {
        customerId,
        date,
        payments: pays,
        items,
        confirmBelowCost: !!ack.belowCost,
        confirmShortStock: !!ack.shortStock,
        confirmOverLimit: !!ack.overLimit,
      };
      const res = edit
        ? await editInvoice({ ...payload, invoiceId: edit.invoiceId })
        : await createInvoice(payload);
      if (res.ok) {
        router.push(`/billing/${res.invoiceId}/print`);
      } else if (res.shortStock) {
        setShortStock(res.shortStock);
      } else if (res.belowCost) {
        setBelowCost(res.belowCost);
      } else if (res.creditWarning) {
        setCreditWarning(res.creditWarning);
      } else {
        setError(res.error ?? "Could not save the bill.");
      }
    });
  }

  // Once a warning is acknowledged we keep acknowledging it on the retry.
  const [acked, setAcked] = useState<{ belowCost?: boolean; shortStock?: boolean; overLimit?: boolean }>({});
  function proceed(kind: "belowCost" | "shortStock" | "overLimit") {
    const next = { ...acked, [kind]: true };
    setAcked(next);
    submit(next);
  }

  return (
    <div className="space-y-6">
      <Panel pad>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="customer">Customer</Label>
            <Select id="customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isCash ? "Cash Sale (walk-in)" : c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="bill-date">Bill date</Label>
            <Input
              id="bill-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="font-mono"
            />
            <p className="mt-1.5 text-[13px] text-ink-muted">
              {date === today
                ? "Today. Change it to bill for a day the goods actually went out."
                : "This bill, and the cash taken on it, will be recorded on this date."}
            </p>
          </div>
        </div>
      </Panel>

      {/* Items */}
      <Panel pad>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink">Items</h2>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLines((p) => [...p, { ...emptyLine }])}
              className="px-3 py-1.5"
            >
              + Add line
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLines((p) => [...p, { ...emptyCustom }])}
              className="px-3 py-1.5"
            >
              + Custom item
            </Button>
          </div>
        </div>

        <div className="space-y-5">
          {lines.map((l, i) => {
            const unit: Unit =
              l.kind === "custom" ? l.unit : (products.find((p) => p.id === l.productId)?.unit ?? "PIECE");
            const removeBtn = (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLines((p) => (p.length === 1 ? p : p.filter((_, x) => x !== i)))}
                className="px-3 py-2"
                disabled={lines.length === 1}
                aria-label="Remove line"
              >
                ✕
              </Button>
            );
            const qtyInput = (
              <Input
                type="number"
                min={0}
                step={qtyStep(unit)}
                placeholder={`Qty (${unitShort(unit)})`}
                aria-label={`Quantity in ${unitShort(unit)}`}
                value={l.qty}
                onChange={(e) => updateLine(i, { qty: e.target.value })}
              />
            );
            const rateInput = (
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder={`Rate/${unitShort(unit)} Rs`}
                aria-label={`Rate per ${unitLabel(unit).toLowerCase()} in rupees`}
                value={l.isSample ? "" : l.rateRs}
                disabled={l.isSample}
                onChange={(e) => updateLine(i, { rateRs: e.target.value })}
              />
            );

            if (l.kind === "custom") {
              return (
                <div key={i} className="rounded-control border border-dashed border-line-strong p-3">
                  <p className="mb-2 text-[13px] font-medium text-ink-muted">
                    Custom item — not from stock (e.g. bought from outside for this customer)
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px_100px_120px_auto] sm:items-center">
                    <Input
                      placeholder="Item name"
                      aria-label="Custom item name"
                      maxLength={120}
                      value={l.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                    />
                    <Select
                      value={l.unit}
                      onChange={(e) => updateLine(i, { unit: e.target.value as Unit })}
                      aria-label="Unit"
                    >
                      {UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </Select>
                    {qtyInput}
                    {rateInput}
                    {removeBtn}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <label htmlFor={`cost-${i}`} className="text-ink-muted">
                      Your cost per {unitLabel(unit).toLowerCase()} (optional, for profit)
                    </label>
                    <div className="w-36">
                      <Input
                        id={`cost-${i}`}
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Rs"
                        value={l.costRs}
                        onChange={(e) => updateLine(i, { costRs: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              );
            }

            const product = products.find((p) => p.id === l.productId);
            return (
              <div key={i} className="rounded-control border border-line p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px_120px_auto] sm:items-center">
                  <ProductPicker
                    products={products}
                    value={l.productId}
                    onChange={(id) => onProductChange(i, id)}
                  />
                  {qtyInput}
                  {rateInput}
                  {removeBtn}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 text-ink-muted">
                    <input
                      type="checkbox"
                      checked={l.isSample}
                      onChange={(e) => updateLine(i, { isSample: e.target.checked })}
                    />
                    Free sample / bonus
                  </label>
                  {product && typeof product.stock === "number" && (
                    <span className="text-ink-muted">
                      In stock: {formatQtyUnit(product.stock, product.unit)}
                    </span>
                  )}
                  {l.lastHint && <span className="text-ink-muted">{l.lastHint}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-between border-t border-line pt-4 text-base">
          <span className="font-medium text-ink-muted">Bill total</span>
          <span className="font-semibold text-ink">{formatPKR(totalPaisa)}</span>
        </div>
      </Panel>

      {/* Payments — split supported */}
      <Panel pad>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-semibold text-ink">Payment</h2>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPayments((p) => [...p, { ...emptyPay }])}
            className="px-3 py-1.5"
          >
            + Split payment
          </Button>
        </div>
        <p className="mb-3 text-[13px] text-ink-muted">
          Enter what the customer pays now. Leave blank (or pay less than the total) and the rest
          goes on their udhaar account.
        </p>

        <div className="space-y-3">
          {payments.map((p, i) => (
            <div key={i} className="rounded-control border border-line p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_auto] sm:items-center">
                <Select
                  value={p.method}
                  onChange={(e) => updatePay(i, { method: e.target.value as Pay["method"] })}
                  aria-label="Payment method"
                >
                  <option value="CASH">Cash</option>
                  <option value="ONLINE">Online transfer</option>
                  <option value="CHEQUE">Cheque</option>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Amount Rs"
                  value={p.amountRs}
                  onChange={(e) => updatePay(i, { amountRs: e.target.value })}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPayments((prev) => (prev.length === 1 ? prev : prev.filter((_, x) => x !== i)))}
                  className="px-3 py-2"
                  disabled={payments.length === 1}
                >
                  ✕
                </Button>
              </div>
              {p.method === "CHEQUE" && (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Input placeholder="Cheque number" value={p.chequeNumber} onChange={(e) => updatePay(i, { chequeNumber: e.target.value })} />
                  <Input placeholder="Bank" value={p.chequeBank} onChange={(e) => updatePay(i, { chequeBank: e.target.value })} />
                  <Input type="date" value={p.chequeDate} onChange={(e) => updatePay(i, { chequeDate: e.target.value })} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-1 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-muted">Paying now</span>
            <span className="font-medium">{formatPKR(paidPaisa)}</span>
          </div>
          <div className="flex justify-between text-base">
            <span className="font-medium text-ink-muted">Goes on udhaar</span>
            <span className={`font-semibold ${udhaarPaisa > 0 ? "text-warn" : "text-ink"}`}>
              {formatPKR(udhaarPaisa)}
            </span>
          </div>
        </div>
      </Panel>

      {/* Warnings */}
      {shortStock && (
        <Panel className="border-bad/30 bg-bad-soft p-4">
          <p className="text-[15px] font-semibold text-bad">Not enough stock</p>
          <ul className="mt-1 list-disc pl-5 text-[15px] text-bad">
            {shortStock.map((s) => (
              <li key={s.name}>
                {s.name}: asking for {formatQtyUnit(s.requested, s.unit)}, only{" "}
                <strong>{formatQtyUnit(s.available, s.unit)}</strong> in stock
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="danger" onClick={() => proceed("shortStock")} disabled={pending}>
              Sell anyway (stock goes negative)
            </Button>
            <Button type="button" variant="secondary" onClick={clearWarnings}>
              Go back
            </Button>
          </div>
        </Panel>
      )}

      {belowCost && (
        <Panel className="border-warn/30 bg-warn-soft p-4">
          <p className="text-[15px] font-semibold text-warn">Warning: below cost — {belowCost.join(", ")}</p>
          <p className="mt-1 text-[15px] text-ink">One or more lines are priced below cost. Save anyway?</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="danger" onClick={() => proceed("belowCost")} disabled={pending}>
              Save anyway
            </Button>
            <Button type="button" variant="secondary" onClick={clearWarnings}>
              Go back
            </Button>
          </div>
        </Panel>
      )}

      {creditWarning && (
        <Panel className="border-warn/30 bg-warn-soft p-4">
          <p className="text-[15px] font-semibold text-warn">Over credit limit</p>
          <p className="mt-1 text-[15px] text-ink">{creditWarning}</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="danger" onClick={() => proceed("overLimit")} disabled={pending}>
              Approve anyway
            </Button>
            <Button type="button" variant="secondary" onClick={clearWarnings}>
              Go back
            </Button>
          </div>
        </Panel>
      )}

      {error && <p className="text-[13px] text-bad">{error}</p>}

      {/* Running totals travel with the form — you never scroll up to check the
          bill total before saving (design/DESIGN.md, sticky action bar). */}
      {!shortStock && !belowCost && !creditWarning && (
        <StickyActionBar>
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <TotalReadout label="Bill total" value={formatPKR(totalPaisa)} />
            <TotalReadout
              label="On udhaar"
              value={formatPKR(udhaarPaisa)}
              tone={udhaarPaisa > 0 ? "warn" : "ink"}
            />
          </div>
          <div className="flex gap-2.5">
            <Button type="button" variant="secondary" onClick={() => router.push("/billing")}>
              Cancel
            </Button>
            <Button type="button" onClick={() => submit(acked)} disabled={pending}>
              {pending ? "Saving…" : edit ? `Update bill #${edit.number}` : "Save & print"}
            </Button>
          </div>
        </StickyActionBar>
      )}
    </div>
  );
}
