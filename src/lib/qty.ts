// Quantities are stored everywhere as integer THOUSANDTHS of the product's unit
// ("milli"), the same trick as paisa for money: 2.5 m = 2500, 12 pcs = 12000.
// Every page parses, formats and multiplies through here so no screen does its
// own rounding. Safe to import from client components (no server imports).

export type Unit = "PIECE" | "METER" | "FEET";

export const UNITS: { value: Unit; label: string; short: string }[] = [
  { value: "PIECE", label: "Piece", short: "pcs" },
  { value: "METER", label: "Meter", short: "m" },
  { value: "FEET", label: "Feet", short: "ft" },
];

export const MILLI = 1000;

export function unitShort(unit: Unit | null | undefined): string {
  return UNITS.find((u) => u.value === unit)?.short ?? "pcs";
}

export function unitLabel(unit: Unit | null | undefined): string {
  return UNITS.find((u) => u.value === unit)?.label ?? "Piece";
}

/** A product's unit: its category's, or PIECE when it has no category. */
export function unitOf(product: { category?: { unit: string } | null }): Unit {
  return (product.category?.unit as Unit | undefined) ?? "PIECE";
}

/** Typed quantity (number or text like "2.5") → thousandths. Rounds past 3 decimals. */
export function toMilli(qty: number | string): number {
  const n = typeof qty === "number" ? qty : Number(String(qty).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * MILLI);
}

/** Thousandths → plain number for an <input> (2500 → 2.5). */
export function fromMilli(milli: number): number {
  return milli / MILLI;
}

/** Thousandths → "16,000" / "2.5" / "0.125" (no unit). */
export function formatQty(milli: number): string {
  return (milli / MILLI).toLocaleString("en-PK", { maximumFractionDigits: 3 });
}

/** Thousandths + unit → "16,000 m" / "2.5 ft" / "12 pcs". */
export function formatQtyUnit(milli: number, unit: Unit | null | undefined): string {
  return `${formatQty(milli)} ${unitShort(unit)}`;
}

/**
 * Line amount in paisa = qty × rate, rounded to the nearest paisa.
 * Split into whole units + fraction so qtyMilli × rate never leaves the
 * float-safe integer range, even on very large lines.
 */
export function lineAmount(qtyMilli: number, ratePaisa: number): number {
  const sign = qtyMilli < 0 ? -1 : 1;
  const q = Math.abs(qtyMilli);
  const whole = Math.floor(q / MILLI);
  const frac = q - whole * MILLI;
  return sign * (whole * ratePaisa + Math.round((frac * ratePaisa) / MILLI));
}

/**
 * Server-side check for a typed quantity. Returns an error message, or null when fine.
 * Pieces must be whole; meter/feet allow up to 3 decimals.
 */
export function qtyError(milli: number, unit: Unit, { allowZero = false } = {}): string | null {
  if (!Number.isFinite(milli)) return "Enter a valid quantity";
  if (milli < 0 || (!allowZero && milli === 0)) return "Quantity must be more than zero";
  if (unit === "PIECE" && milli % MILLI !== 0) return "Pieces must be a whole number";
  return null;
}

/** Step attribute for quantity inputs: decimals for meter/feet, whole numbers for pieces. */
export function qtyStep(unit: Unit | null | undefined): string {
  return unit === "METER" || unit === "FEET" ? "0.001" : "1";
}

/** Total of lines that may mix units → "12 pcs + 250.5 m". Units never add across. */
export function formatQtyTotals(lines: { qtyMilli: number; unit: Unit }[]): string {
  const sums = new Map<Unit, number>();
  for (const l of lines) sums.set(l.unit, (sums.get(l.unit) ?? 0) + l.qtyMilli);
  return UNITS.filter((u) => sums.has(u.value))
    .map((u) => formatQtyUnit(sums.get(u.value)!, u.value))
    .join(" + ");
}
