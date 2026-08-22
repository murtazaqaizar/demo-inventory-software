"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { activeItem, type NavItem, type Section } from "@/lib/nav";

/**
 * Top bar + section tabs. Replaces the old 14-item flat sidebar: four sections
 * carry the primary nav, and only the active section's pages appear as tabs, so
 * the full destination list is never on screen at once (design/DESIGN.md).
 */
export function TopNav({
  groups,
  user,
  signOutAction,
}: {
  groups: { section: Section; items: NavItem[] }[];
  user: { name?: string | null; role: string };
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const all = groups.flatMap((g) => g.items);
  const current = activeItem(pathname, all);
  const activeSection = current
    ? groups.find((g) => g.items.some((i) => i.href === current.href))
    : groups[0];
  const tabs = activeSection?.items ?? [];

  return (
    <header className="no-print">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex h-14 items-center gap-8 border-b border-line bg-surface px-4 md:px-8">
        <Link href="/" className="shrink-0 leading-tight">
          <span className="block text-[15px] font-semibold text-ink">
            Inventory &amp; Accounts
          </span>
          <span className="block text-[12px] font-normal tracking-normal text-ink-faint">
            Wholesale abrasives
          </span>
        </Link>

        {/* Sections — desktop */}
        <nav aria-label="Sections" className="hidden flex-1 gap-1 md:flex">
          {groups.map((g) => {
            const on = g.section === activeSection?.section;
            return (
              <Link
                key={g.section}
                href={g.items[0].href}
                aria-current={on ? "page" : undefined}
                className={`rounded-control px-3.5 py-1.5 text-[15px] font-medium transition-colors duration-150 ${
                  on
                    ? "bg-accent-soft text-accent"
                    : "text-ink-muted hover:bg-surface-alt hover:text-ink"
                }`}
              >
                {g.section}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[13px] text-ink-muted sm:inline">
            {user.name} · {user.role}
          </span>
          <form action={signOutAction} className="hidden sm:block">
            <button
              type="submit"
              className="h-[34px] rounded-control border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-alt"
            >
              Sign out
            </button>
          </form>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle menu"
            className="h-[34px] rounded-control border border-line-strong px-3.5 text-sm font-medium text-ink md:hidden"
          >
            Menu
          </button>
        </div>
      </div>

      {/* ── Section tabs — desktop ──────────────────────────────────────── */}
      {tabs.length > 0 && (
        <nav
          aria-label={`${activeSection?.section} pages`}
          className="hidden gap-6 overflow-x-auto border-b border-line bg-surface px-8 md:flex"
        >
          {tabs.map((item) => {
            const on = current?.href === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={`-mb-px shrink-0 border-b-2 py-2.5 text-[15px] font-medium transition-colors duration-150 ${
                  on
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

      {/* ── Mobile drawer: every section expanded, since there is no room
             for a two-level nav on a phone ─────────────────────────────── */}
      {open && (
        <div className="border-b border-line bg-surface px-4 py-3 md:hidden">
          {groups.map((g) => (
            <div key={g.section} className="mb-3 last:mb-0">
              <p className="px-1 pb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                {g.section}
              </p>
              {g.items.map((item) => {
                const on = current?.href === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={on ? "page" : undefined}
                    className={`block rounded-control px-3 py-2 text-[15px] transition-colors duration-150 ${
                      on ? "bg-accent-soft font-medium text-accent" : "text-ink-muted"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
          <form action={signOutAction} className="mt-3 border-t border-line pt-3">
            <p className="px-1 pb-2 text-[13px] text-ink-muted">
              {user.name} · {user.role}
            </p>
            <button
              type="submit"
              className="h-10 w-full rounded-control border border-line-strong bg-surface text-[15px] font-medium text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </header>
  );
}
