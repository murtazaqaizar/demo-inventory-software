// Turning a saved quotation back into the bill form's starting state — used
// when editing the quotation and when accepting it as a bill.
import { fromMilli } from "@/lib/qty";
import { dateInputValue } from "@/lib/dates";
import type { BillSeed } from "@/app/(app)/billing/new/billing-builder";

type QuoteForSeed = {
  customerId: string;
  date: Date;
  items: {
    productId: string | null;
    colorId: string | null;
    description: string | null;
    unit: string;
    qtyMilli: number;
    ratePaisa: number;
    unitCostPaisa: number;
    isSample: boolean;
  }[];
};

export function quotationSeed(q: QuoteForSeed, date?: string): BillSeed {
  return {
    customerId: q.customerId,
    date: date ?? dateInputValue(q.date),
    lines: q.items.map((it) => ({
      productId: it.productId,
      colorId: it.colorId,
      description: it.description,
      unit: it.unit,
      qty: fromMilli(it.qtyMilli),
      rateRs: it.ratePaisa / 100,
      costRs: it.unitCostPaisa / 100,
      isSample: it.isSample,
    })),
    payments: [],
  };
}

export const quoteLabel = (n: number) => `Q-${n}`;
