// Purchase orders: a slip for the vendor, not a stock purchase. Shared bits
// for the list, form and print pages.
import { fromMilli } from "@/lib/qty";
import { dateInputValue } from "@/lib/dates";

export const poLabel = (n: number) => `PO-${n}`;

export const PO_STATUS_LABEL = { OPEN: "Open", RECEIVED: "Received", CANCELLED: "Cancelled" } as const;

export type PoLineInput = { description: string; unit: string; qty: number | string; rateRs: number | string };

export type PoSeed = {
  date: string;
  vendorName: string;
  vendorContact: string;
  vendorPhone: string;
  vendorAddress: string;
  notes: string;
  lines: PoLineInput[];
};

type PoForSeed = {
  date: Date;
  vendorName: string;
  vendorContact: string | null;
  vendorPhone: string | null;
  vendorAddress: string | null;
  notes: string | null;
  items: { description: string; unit: string; qtyMilli: number; ratePaisa: number }[];
};

// A saved order back into the form's starting state (for editing).
export function purchaseOrderSeed(po: PoForSeed): PoSeed {
  return {
    date: dateInputValue(po.date),
    vendorName: po.vendorName,
    vendorContact: po.vendorContact ?? "",
    vendorPhone: po.vendorPhone ?? "",
    vendorAddress: po.vendorAddress ?? "",
    notes: po.notes ?? "",
    lines: po.items.map((it) => ({
      description: it.description,
      unit: it.unit,
      qty: fromMilli(it.qtyMilli),
      rateRs: it.ratePaisa / 100,
    })),
  };
}
