import Link from "next/link";
import { inputClass } from "@/components/ui";

// Plain GET form — works without JS and keeps the URL shareable/bookmarkable.
// Rendered inside a Panel's FilterRow, so it carries no margin of its own.
export function SearchBar({
  action,
  q,
  from,
  to,
  placeholder = "Search…",
  withDates = false,
  children,
}: {
  action: string;
  q?: string;
  from?: string;
  to?: string;
  placeholder?: string;
  withDates?: boolean;
  /** Trailing controls kept inside the form, e.g. a GroupBySwitch. */
  children?: React.ReactNode;
}) {
  return (
    <form
      method="get"
      action={action}
      className="flex flex-wrap items-end gap-2.5 border-b border-line px-4 py-4 md:px-6"
    >
      <div className="min-w-[200px] flex-1">
        <label htmlFor="q" className="mb-1.5 block text-[13px] font-medium text-ink-muted">
          Search
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q ?? ""}
          placeholder={placeholder}
          className={inputClass}
        />
      </div>
      {withDates && (
        <>
          <div>
            <label htmlFor="from" className="mb-1.5 block text-[13px] font-medium text-ink-muted">
              From
            </label>
            <input
              id="from"
              type="date"
              name="from"
              defaultValue={from ?? ""}
              className={`${inputClass} w-auto font-mono`}
            />
          </div>
          <div>
            <label htmlFor="to" className="mb-1.5 block text-[13px] font-medium text-ink-muted">
              To
            </label>
            <input
              id="to"
              type="date"
              name="to"
              defaultValue={to ?? ""}
              className={`${inputClass} w-auto font-mono`}
            />
          </div>
        </>
      )}
      <button
        type="submit"
        className="h-10 rounded-control bg-accent px-5 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-accent-hover active:bg-accent-press"
      >
        Search
      </button>
      {(q || from || to) && (
        <Link
          href={action}
          className="inline-flex h-10 items-center rounded-control border border-line-strong bg-surface px-5 text-[15px] font-semibold text-ink transition-colors duration-150 hover:bg-surface-alt"
        >
          Clear
        </Link>
      )}
      {children}
    </form>
  );
}

export function Pagination({
  basePath,
  page,
  pageSize,
  total,
  params = {},
}: {
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
  params?: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  // Pagination sits below the panel, outside it.
  const btn =
    "inline-flex h-[34px] items-center rounded-control border px-3.5 text-sm font-medium transition-colors duration-150";
  const live = `${btn} border-line-strong bg-surface text-ink hover:bg-surface-alt`;
  const dead = `${btn} border-line text-ink-faint`;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-[13px] text-ink-muted">
        Showing{" "}
        <span className="font-mono font-medium text-ink">
          {first}–{last}
        </span>{" "}
        of <span className="font-mono font-medium text-ink">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={live}>
            ← Previous
          </Link>
        ) : (
          <span className={dead}>← Previous</span>
        )}
        <span className="text-[13px] text-ink-muted">
          Page <span className="font-mono">{page}</span> of{" "}
          <span className="font-mono">{pages}</span>
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={live}>
            Next →
          </Link>
        ) : (
          <span className={dead}>Next →</span>
        )}
      </div>
    </div>
  );
}
