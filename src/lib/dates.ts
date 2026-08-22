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

/** Whole days between `from` and now. Used for "oldest unpaid bill N days". */
export function daysSince(from: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - from.getTime()) / 86_400_000);
}
