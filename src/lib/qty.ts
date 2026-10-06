// Quantities are stored everywhere as integer THOUSANDTHS of the product's unit
// ("milli"), the same trick as paisa for money: 2.5 m = 2500, 12 pcs = 12000.
// Every page parses, formats and multiplies through here so no screen does its
// own rounding. Safe to import from client components (no server imports).

// A unit as the screens need it. Units are the shop's own list (Unit table,
// managed on /categories); `decimals` decides whether 2.5 may be entered.
export type Unit = { name: string; short: string; decimals: boolean };
// With id, for dropdowns that submit a choice.
export type UnitOption = Unit & { id: string };

/** What a product without a category is counted in. Matches the seeded `unit_piece` row. */
export const PIECE: Unit = { name: "Piece", short: "pcs", decimals: false };
export const PIECE_UNIT_ID = "unit_piece";

export const MILLI = 1000;

// Bill and return lines store only the unit's short label (a snapshot), so the
// display helpers accept either a Unit or that label.
type UnitLike = Unit | string | null | undefined;
const shortOf = (u: UnitLike) => (typeof u === "string" ? u : (u?.short ?? PIECE.short));

export function unitShort(unit: UnitLike): string {
  return shortOf(unit);
}

export function unitLabel(unit: Unit | null | undefined): string {
  return unit?.name ?? PIECE.name;
}

/** A product's unit: its category's, or PIECE when it has no category. */
export function unitOf(product: { category?: { unit: Unit } | null }): Unit {
  const u = product.category?.unit;
  return u ? { name: u.name, short: u.short, decimals: u.decimals } : PIECE;
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
export function formatQtyUnit(milli: number, unit: UnitLike): string {
  return `${formatQty(milli)} ${shortOf(unit)}`;
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
 * Units without decimals need whole numbers; the rest allow up to 3 decimals.
 */
export function qtyError(milli: number, unit: Unit, { allowZero = false } = {}): string | null {
  if (!Number.isFinite(milli)) return "Enter a valid quantity";
  if (milli < 0 || (!allowZero && milli === 0)) return "Quantity must be more than zero";
  if (!unit.decimals && milli % MILLI !== 0) return `${unit.name} must be a whole number`;
  return null;
}

/** Step attribute for quantity inputs. */
export function qtyStep(unit: Unit | null | undefined): string {
  return unit?.decimals ? "0.001" : "1";
}

/** Total of lines that may mix units → "12 pcs + 250.5 m". Units never add across. */
export function formatQtyTotals(lines: { qtyMilli: number; unit: UnitLike }[]): string {
  const sums = new Map<string, number>();
  for (const l of lines) {
    const k = shortOf(l.unit);
    sums.set(k, (sums.get(k) ?? 0) + l.qtyMilli);
  }
  return [...sums].map(([short, milli]) => formatQtyUnit(milli, short)).join(" + ");
}
