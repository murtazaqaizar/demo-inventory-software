"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inputClass } from "@/components/ui";
import { formatQtyUnit, type Unit } from "@/lib/qty";

export type PickerProduct = {
  id: string;
  code: string;
  name: string;
  size?: string | null;
  variant?: string | null;
  color?: string | null; // tells apart e.g. red and black wire of the same size
  stock?: number; // thousandths of `unit`
  unit?: Unit;
};

// Type-to-search product picker (improvement 4). Much faster than a long <select>,
// especially on a phone: type any part of the code, name, size or brand.
export function ProductPicker({
  products,
  value,
  onChange,
  placeholder = "Type to search product…",
}: {
  products: PickerProduct[];
  value: string;
  onChange: (productId: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = products.find((p) => p.id === value) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    const words = q.split(/\s+/);
    return products
      .filter((p) => {
        const hay = `${p.code} ${p.name} ${p.size ?? ""} ${p.variant ?? ""} ${p.color ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 50);
  }, [products, query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(p: PickerProduct) {
    onChange(p.id);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[highlight]) pick(matches[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const label = (p: PickerProduct) =>
    `${p.name}${p.size ? " " + p.size : ""}${p.variant ? " · " + p.variant : ""}${p.color ? " · " + p.color : ""}`;

  return (
    <div className="relative" ref={boxRef}>
      <input
        type="text"
        className={inputClass}
        placeholder={selected ? label(selected) : placeholder}
        value={open ? query : selected ? label(selected) : ""}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls="product-listbox"
      />

      {open && (
        <ul
          id="product-listbox"
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full max-w-[480px] overflow-y-auto rounded-control border border-line-strong bg-surface shadow-float"
        >
          {matches.length === 0 && (
            <li className="px-3.5 py-2.5 text-sm text-ink-muted">
              No product matches “{query}”
            </li>
          )}
          {matches.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-sm ${
                i === highlight ? "bg-accent-soft text-accent" : "text-ink"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.name}</span>
                <span
                  className={`block truncate font-mono text-[13px] ${
                    i === highlight ? "text-accent" : "text-ink-muted"
                  }`}
                >
                  {p.code}
                  {p.size ? ` · ${p.size}` : ""}
                  {p.variant ? ` · ${p.variant}` : ""}
                  {p.color ? ` · ${p.color}` : ""}
                </span>
              </span>
              {typeof p.stock === "number" && (
                <span
                  className={`shrink-0 font-mono text-[13px] ${
                    p.stock <= 0
                      ? "text-bad"
                      : i === highlight
                        ? "text-accent"
                        : "text-ink-muted"
                  }`}
                >
                  {formatQtyUnit(p.stock, p.unit)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
