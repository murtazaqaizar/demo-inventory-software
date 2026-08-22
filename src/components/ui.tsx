import * as React from "react";

/**
 * Shared UI primitives. Every visual value here comes from design/DESIGN.md
 * ("Workshop"). Do not hardcode colours or radii in pages — add a variant here
 * instead, so pages of the same kind stay consistent.
 */

/* ── Page header ─────────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-[72ch] text-ink-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ── Panels ──────────────────────────────────────────────────────────────
   A panel is a REGION of the page, not a wrapper for each small thing.
   Two or three per page, maximum. `Card` is kept as an alias so existing
   pages keep working while they are migrated.                             */

export function Panel({
  children,
  pad = false,
  className = "",
}: {
  children: React.ReactNode;
  pad?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`panel rounded-panel border border-line bg-surface shadow-panel ${
        pad ? "p-6" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export const Card = Panel;

export function PanelHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line px-6 py-4">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}

/** Filter / search strip that sits inside a Panel, above the table. */
export function FilterRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-6 py-4">
      {children}
    </div>
  );
}

/* ── Form controls ───────────────────────────────────────────────────────── */

export function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[13px] font-medium text-ink-muted"
    >
      {children}
    </label>
  );
}

/** Fields are capped, never full-bleed — see DESIGN.md "Don't". */
export const inputClass =
  "h-10 w-full max-w-[480px] rounded-control border border-line-strong bg-surface px-3.5 " +
  "text-[15px] text-ink outline-none transition-colors duration-[140ms] ease-[cubic-bezier(0.22,1,0.36,1)] " +
  "focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] " +
  "disabled:bg-surface-alt disabled:text-ink-faint";

/** Amount and quantity inputs: mono, tabular, right-aligned, narrower. */
export const numInputClass = `${inputClass} max-w-[180px] text-right font-mono`;

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

/** Error text sits under the field. Never colour alone — always words. */
export function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[13px] text-bad">{children}</p>;
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "quiet";
  size?: "md" | "sm";
}) {
  const styles = {
    primary:
      "bg-accent text-white hover:bg-accent-hover active:bg-accent-press border-transparent",
    secondary:
      "bg-surface text-ink border-line-strong hover:bg-surface-alt",
    danger: "bg-bad text-white hover:brightness-95 border-transparent",
    quiet:
      "bg-transparent text-accent border-transparent hover:bg-accent-soft",
  }[variant];

  const sizing =
    size === "sm" ? "h-[34px] px-3.5 text-sm" : "h-10 px-5 text-[15px]";

  return (
    <button
      {...props}
      className={
        "inline-flex items-center justify-center gap-2 rounded-control border font-semibold " +
        "transition-colors duration-[140ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none " +
        "focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--color-accent-soft)] " +
        `disabled:cursor-not-allowed disabled:opacity-45 ${sizing} ${styles} ${className}`
      }
    />
  );
}

/**
 * Trailing row-actions menu. Inline links on every row are noise on a wide
 * table, so tables with more than four columns collapse actions in here.
 * Built on <details> so it needs no client JS and stays keyboard-operable.
 */
export function RowMenu({ children }: { children: React.ReactNode }) {
  return (
    <details className="group relative inline-block [&_a]:block [&_button]:block">
      <summary
        aria-label="Row actions"
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-chip border border-line-strong bg-surface leading-none text-ink-muted transition-colors duration-[140ms] ease-[cubic-bezier(0.22,1,0.36,1)] marker:content-none hover:bg-surface-alt hover:text-ink focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--color-accent-soft)] group-open:border-accent group-open:bg-accent-soft group-open:text-accent [&::-webkit-details-marker]:hidden"
      >
        ⋯
      </summary>
      <div className="absolute right-0 z-30 mt-1 flex min-w-[168px] flex-col gap-0.5 rounded-control border border-line bg-surface p-1.5 text-left shadow-float [&>*]:rounded-chip [&>*]:px-2.5 [&>*]:py-1.5 [&>*]:text-left [&>*]:text-sm [&>*]:text-ink [&>*]:transition-colors [&>*]:duration-150 hover:[&>*]:bg-surface-alt">
        {children}
      </div>
    </details>
  );
}

/* ── Status pills ────────────────────────────────────────────────────────
   ALWAYS carry a word. A bare colour dot is not a status.                  */

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const styles = {
    neutral: "bg-surface-alt text-ink-muted border-line",
    green: "bg-ok-soft text-ok border-transparent",
    amber: "bg-warn-soft text-warn border-transparent",
    red: "bg-bad-soft text-bad border-transparent",
  }[tone];
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-1 text-[13px] font-medium tracking-normal ${styles}`}
    >
      {children}
    </span>
  );
}

export const Pill = Badge;

/* ── Table primitives ────────────────────────────────────────────────────
   Pages build their own <thead>/<tbody>; these constants keep every table
   in the app identical without a large refactor.                          */

export const tableClass = "rtable w-full min-w-[820px] text-[15px]";

export const thClass =
  "border-b border-line px-4 py-2.5 text-left text-[13px] font-medium text-ink-muted";

export const thNumClass = `${thClass} text-right`;

export const tdClass = "h-11 border-b border-line px-4 py-3 align-middle";

export const tdNumClass = `${tdClass} text-right font-mono`;

export const rowClass = "transition-colors duration-[140ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-surface-alt";

/**
 * Sticky group header row. `label` is the grouping key, `aggregate` the
 * summary that makes the grouping worth having (count + total + owing).
 */
export function GroupRow({
  label,
  aggregate,
  labelSpan = 3,
  aggregateSpan = 2,
  children,
}: {
  label: string;
  aggregate: React.ReactNode;
  labelSpan?: number;
  aggregateSpan?: number;
  /** The rows belonging to this group. */
  children?: React.ReactNode;
}) {
  return (
    <>
      {/* Sticky lives on the cells — a sticky <tr> does not stick in most browsers.
          Each cell carries its own background or rows would show through. */}
      <tr data-group>
        <td
          colSpan={labelSpan}
          className="sticky top-0 z-10 border-y border-line bg-surface-alt px-4 py-2.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted"
        >
          {label}
        </td>
        <td
          colSpan={aggregateSpan}
          className="sticky top-0 z-10 border-y border-line bg-surface-alt px-4 py-2.5 text-right font-mono text-[13px] text-ink-muted"
        >
          {aggregate}
        </td>
      </tr>
      {children}
    </>
  );
}

/* ── Group-by switch ─────────────────────────────────────────────────────
   State lives in the URL (?group=…), matching the existing searchParams
   pattern used by search and pagination.                                  */

export function GroupBySwitch({
  basePath,
  current,
  options,
  params = {},
}: {
  basePath: string;
  current: string;
  options: { value: string; label: string }[];
  params?: Record<string, string | undefined>;
}) {
  const qs = (value: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("group", value);
    return `${basePath}?${sp.toString()}`;
  };

  return (
    <div className="ml-auto flex items-center gap-2">
      <span className="text-[13px] text-ink-muted">Group by</span>
      <div className="flex">
        {options.map((o, i) => {
          const on = o.value === current;
          return (
            <a
              key={o.value}
              href={qs(o.value)}
              aria-current={on ? "true" : undefined}
              className={
                "inline-flex h-[34px] items-center border px-3.5 text-sm font-medium " +
                "transition-colors duration-[140ms] ease-[cubic-bezier(0.22,1,0.36,1)] " +
                (i === 0 ? "rounded-l-lg " : "-ml-px rounded-r-lg ") +
                (on
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line-strong bg-surface text-ink-muted hover:bg-surface-alt hover:text-ink")
              }
            >
              {o.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}

/* ── Right rail ──────────────────────────────────────────────────────────
   Context, never the primary path. If it's urgent it belongs in the panel. */

export function Rail({ children }: { children: React.ReactNode }) {
  return <aside className="flex w-full flex-col gap-4 lg:w-[300px]">{children}</aside>;
}

export function RailBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-panel border border-line bg-surface p-6 shadow-panel">
      <h3 className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}

/** One metric. Never rendered as a row of four equal cards — see DESIGN.md. */
export function RailStat({
  label,
  value,
  note,
  tone = "ink",
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: "ink" | "good" | "warn" | "bad";
}) {
  const noteColor = {
    ink: "text-ink-faint",
    good: "text-ok",
    warn: "text-warn",
    bad: "text-bad",
  }[tone];
  return (
    <div className="border-b border-line py-2.5 last:border-0 last:pb-0">
      <div className="text-[13px] text-ink-muted">{label}</div>
      <div className="mt-0.5 font-mono text-[22px] font-semibold text-ink">{value}</div>
      {note && <div className={`mt-0.5 text-[13px] ${noteColor}`}>{note}</div>}
    </div>
  );
}

export function RailList({ children }: { children: React.ReactNode }) {
  return <ul className="text-sm">{children}</ul>;
}

export function RailListItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-2.5 border-b border-line py-2.5 last:border-0 last:pb-0">
      {children}
    </li>
  );
}

/* ── Sticky form footer ──────────────────────────────────────────────────
   Long forms (new bill, new purchase) carry the running total here.        */

export function StickyActionBar({
  children,
  inPanel = false,
}: {
  children: React.ReactNode;
  /** True when the bar is the last child of a `<Panel pad>` — pulls it to the panel edges. */
  inPanel?: boolean;
}) {
  return (
    <div
      className={
        "sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-4 " +
        "border-t border-line-strong bg-surface px-6 py-3.5 " +
        // Shadow points UP — the bar sits at the bottom of the viewport, so a
        // downward shadow casts into nothing.
        "shadow-[0_-8px_24px_rgba(26,24,20,0.10)] " +
        (inPanel
          ? "-mx-6 -mb-6 rounded-b-panel"
          : "rounded-panel border border-line-strong")
      }
    >
      {children}
    </div>
  );
}

export function TotalReadout({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "warn";
}) {
  return (
    <span className="text-[13px] text-ink-muted">
      {label}
      <b
        className={`ml-2 font-mono text-[22px] font-semibold ${
          tone === "warn" ? "text-warn" : "text-ink"
        }`}
      >
        {value}
      </b>
    </span>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */

export function EmptyState({
  children,
  action,
}: {
  children: React.ReactNode;
  /** One primary action. An empty state without a way forward is a dead end. */
  action?: React.ReactNode;
}) {
  return (
    <div className="p-12 text-center text-ink-muted">
      <p>{children}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
