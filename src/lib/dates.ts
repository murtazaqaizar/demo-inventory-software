// A date typed into a form is a DAY, not an instant.
//
// Every date in this app is rendered server-side with `toLocaleDateString`, so a
// day picked on a form has to land on that same day when it is read back. Form
// days are stored at midnight, matching what the expenses form already does.
//
// Picking TODAY is the exception: it keeps the real clock time. The billing list
// orders on `date` alone, so stamping every bill made today at 00:00 would leave
// the day's bills in an arbitrary order. Today behaves exactly as it did before
// the date field existed; only a deliberately chosen past (or future) day gets
// midnight.

/** `YYYY-MM-DD` for an `<input type="date">`. */
export function dateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayInputValue(): string {
  return dateInputValue(new Date());
}

/**
 * A `YYYY-MM-DD` form value → the instant to store, or `undefined` when the
 * field was left blank (callers then fall back to the column's `now()` default).
 */
export function dateFromInput(value?: string | null): Date | undefined {
  if (!value) return undefined;
  if (value === todayInputValue()) return new Date();
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? undefined : when;
}

/**
 * Start / end of a `YYYY-MM-DD` filter day, in the shop's local time.
 *
 * `new Date("2026-10-16")` is midnight UTC — 05:00 in Pakistan — so a "from"
 * filter built that way skipped everything entered between midnight and 5 AM,
 * and a "to" filter built with setHours on it ran five hours into the next day.
 * Adding a time without a zone makes JavaScript read it as local time.
 */
export function dayStart(value: string): Date {
  return new Date(`${value}T00:00:00`);
}
export function dayEnd(value: string): Date {
  return new Date(`${value}T23:59:59.999`);
}

/** Whole days between `from` and now. Used for "oldest unpaid bill N days". */
export function daysSince(from: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - from.getTime()) / 86_400_000);
}
