"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPurchase, updatePurchase } from "../actions";
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

// Same shape the billing screen feeds its picker, plus the cost side — on a
// purchase you want to see what this product last cost you while typing.
type ProductOpt = PickerProduct & { latestCostPaisa?: number };
type SupplierOpt = { id: string; name: string };
type Line = { productId: string; pieces: string; unitCostRs: string };

// Editing an existing purchase: same form, prefilled, saving through updatePurchase.
export type PurchaseInitial = {
  id: string;
  supplierId: string;
  isImport: boolean;
  onCredit: boolean;
  freightRs: string;
  dutyRs: string;
  clearingRs: string;
  transportRs: string;
  notes: string;
  lines: Line[];
};

// A half-entered purchase is real work — a stray refresh, a closed tab or a
// dead battery used to throw it away and drop you back on an empty form. The
// draft is kept in localStorage as you type and cleared the moment it saves.
// Only for NEW purchases: when editing, a refresh should show what's actually
// in the database, not a stale draft sitting on top of it.
const DRAFT_KEY = "purchase-draft:new";

type Draft = Omit<PurchaseInitial, "id">;

export function PurchaseBuilder({
  products,
  suppliers,
  initial,
}: {
  products: ProductOpt[];
  suppliers: SupplierOpt[];
  initial?: PurchaseInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [isImport, setIsImport] = useState(initial?.isImport ?? false);
  const [onCredit, setOnCredit] = useState(initial?.onCredit ?? false);
  const [freightRs, setFreightRs] = useState(initial?.freightRs ?? "0");
  const [dutyRs, setDutyRs] = useState(initial?.dutyRs ?? "0");
  const [clearingRs, setClearingRs] = useState(initial?.clearingRs ?? "0");
  const [transportRs, setTransportRs] = useState(initial?.transportRs ?? "0");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(
    initial?.lines?.length ? initial.lines : [{ productId: "", pieces: "", unitCostRs: "" }]
  );
  const [restored, setRestored] = useState(false);

  // Restore on mount. Reading localStorage during render would break hydration,
  // so this runs after the first paint and then marks the draft loaded.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (isEdit || loadedRef.current) return;
    loadedRef.current = true;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      const hasContent =
        d.lines?.some((l) => l.productId || l.pieces || l.unitCostRs) ||
        d.supplierId ||
        d.notes;
      if (!hasContent) return;

      // Setting state from an effect is deliberate here. The draft lives in
      // localStorage, which the server cannot see; reading it during render
      // would make the client's first paint disagree with the server HTML and
      // break hydration. Restoring after mount is the one safe moment.
      /* eslint-disable react-hooks/set-state-in-effect */
      setSupplierId(d.supplierId ?? "");
      setIsImport(Boolean(d.isImport));
      setOnCredit(Boolean(d.onCredit));
      setFreightRs(d.freightRs ?? "0");
      setDutyRs(d.dutyRs ?? "0");
      setClearingRs(d.clearingRs ?? "0");
      setTransportRs(d.transportRs ?? "0");
      setNotes(d.notes ?? "");
      if (d.lines?.length) setLines(d.lines);
      setRestored(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // A corrupt or unreadable draft must never block entering a purchase.
    }
  }, [isEdit]);

  // Persist on every change, once the restore pass has run — otherwise the
  // empty initial state would overwrite the draft before it is read back.
  useEffect(() => {
    if (isEdit || !loadedRef.current) return;
    const draft: Draft = {
      supplierId,
      isImport,
      onCredit,
      freightRs,
      dutyRs,
      clearingRs,
      transportRs,
      notes,
      lines,
    };
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Private mode / full quota — saving still works, you just lose the draft.
    }
  }, [isEdit, supplierId, isImport, onCredit, freightRs, dutyRs, clearingRs, transportRs, notes, lines]);

  function clearDraft() {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* nothing to do */
    }
  }

  function discardDraft() {
    clearDraft();
    setSupplierId("");
    setIsImport(false);
    setOnCredit(false);
    setFreightRs("0");
    setDutyRs("0");
    setClearingRs("0");
    setTransportRs("0");
    setNotes("");
    setLines([{ productId: "", pieces: "", unitCostRs: "" }]);
    setRestored(false);
  }

  const totalValuePaisa = useMemo(
    () =>
      lines.reduce((s, l) => {
        const pcs = Number(l.pieces) || 0;
        const cost = Number(l.unitCostRs) || 0;
        return s + Math.round(cost * 100) * pcs;
      }, 0),
    [lines]
  );
  const extrasPaisa = useMemo(
    () =>
      [freightRs, dutyRs, clearingRs, transportRs].reduce(
        (s, v) => s + Math.round((Number(v) || 0) * 100),
        0
      ),
    [freightRs, dutyRs, clearingRs, transportRs]
  );

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { productId: "", pieces: "", unitCostRs: "" }]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit() {
    setError(null);
    const items = lines
      .filter((l) => l.productId && Number(l.pieces) > 0)
      .map((l) => ({
        productId: l.productId,
        pieces: Number(l.pieces),
        unitCostRs: Number(l.unitCostRs) || 0,
      }));
    if (items.length === 0) {
      setError("Add at least one line with a product and quantity.");
      return;
    }
    const payload = {
      supplierId: supplierId || undefined,
      isImport,
      onCredit,
      freightRs: Number(freightRs) || 0,
      dutyRs: Number(dutyRs) || 0,
      clearingRs: Number(clearingRs) || 0,
      transportRs: Number(transportRs) || 0,
      notes: notes || undefined,
      items,
    };
    startTransition(async () => {
      const res = initial
        ? await updatePurchase({ ...payload, purchaseId: initial.id })
        : await createPurchase(payload);
      if (res.ok) {
        clearDraft(); // it's in the database now
        // Land on the saved purchase so you can check what you just entered.
        router.push(res.purchaseId ? `/purchases/${res.purchaseId}` : "/purchases");
        router.refresh();
      } else setError(res.error ?? "Could not save purchase.");
    });
  }

  return (
    <div className="space-y-6">
      {restored && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-warn/30 bg-warn-soft px-4 py-3 text-[15px] text-warn">
          <span>
            Restored the purchase you were entering. It hasn&apos;t been saved yet — check it and
            press Save.
          </span>
          <button
            type="button"
            onClick={discardDraft}
            className="shrink-0 underline hover:no-underline"
          >
            Start fresh instead
          </button>
        </div>
      )}

      <Panel pad>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="supplier">Supplier</Label>
            <Select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— none / cash purchase —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end gap-6">
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={isImport} onChange={(e) => setIsImport(e.target.checked)} />
              Import (landed cost)
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={onCredit} onChange={(e) => setOnCredit(e.target.checked)} />
              On credit (payable)
            </label>
          </div>
        </div>

        {isImport && (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="freight">Freight (Rs)</Label>
              <Input id="freight" type="number" min={0} step="0.01" value={freightRs} onChange={(e) => setFreightRs(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="duty">Customs duty (Rs)</Label>
              <Input id="duty" type="number" min={0} step="0.01" value={dutyRs} onChange={(e) => setDutyRs(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="clearing">Clearing (Rs)</Label>
              <Input id="clearing" type="number" min={0} step="0.01" value={clearingRs} onChange={(e) => setClearingRs(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="transport">Local transport (Rs)</Label>
              <Input id="transport" type="number" min={0} step="0.01" value={transportRs} onChange={(e) => setTransportRs(e.target.value)} />
            </div>
          </div>
        )}

        <div className="mt-4">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Bilty no., invoice ref… (optional)"
          />
        </div>
      </Panel>

      <Panel pad>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink">Items received</h2>
          <Button type="button" variant="secondary" onClick={addLine} className="px-3 py-1.5">
            + Add line
          </Button>
        </div>

        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_140px_auto] sm:items-center">
              <ProductPicker
                products={products}
                value={l.productId}
                onChange={(productId) => {
                  // Prefill the cost with what this product last cost, so an
                  // unchanged price is one less thing to retype.
                  const p = products.find((x) => x.id === productId);
                  const patch: Partial<Line> = { productId };
                  if (!l.unitCostRs && p?.latestCostPaisa) {
                    patch.unitCostRs = String(p.latestCostPaisa / 100);
                  }
                  updateLine(i, patch);
                }}
                placeholder="Type to search product…"
              />
              <Input
                type="number"
                min={1}
                placeholder="Pieces"
                value={l.pieces}
                onChange={(e) => updateLine(i, { pieces: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Cost/pc Rs"
                value={l.unitCostRs}
                onChange={(e) => updateLine(i, { unitCostRs: e.target.value })}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => removeLine(i)}
                className="px-3 py-2"
                disabled={lines.length === 1}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-1 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-muted">Goods value</span>
            <span className="font-medium">{formatPKR(totalValuePaisa)}</span>
          </div>
          {isImport && (
            <div className="flex justify-between">
              <span className="text-ink-muted">Landed extras</span>
              <span className="font-medium">{formatPKR(extrasPaisa)}</span>
            </div>
          )}
          <div className="flex justify-between text-base">
            <span className="font-medium text-ink-muted">Total landed cost</span>
            <span className="font-semibold text-ink">
              {formatPKR(totalValuePaisa + extrasPaisa)}
            </span>
          </div>
        </div>
      </Panel>

      {error && <p className="text-[13px] text-bad">{error}</p>}

      <StickyActionBar>
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <TotalReadout label="Goods value" value={formatPKR(totalValuePaisa)} />
          <TotalReadout
            label="Total landed cost"
            value={formatPKR(totalValuePaisa + extrasPaisa)}
          />
        </div>
        <div className="flex gap-2.5">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(initial ? `/purchases/${initial.id}` : "/purchases")}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Save purchase"}
          </Button>
        </div>
      </StickyActionBar>
    </div>
  );
}
