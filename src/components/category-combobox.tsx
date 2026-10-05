"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inputClass } from "@/components/ui";

const MAX_LEN = 40;

// Tag-style dropdown for a product's category. Pick an existing category from the
// list, or type a new one and choose "Create". The chosen tag shows as a chip with
// an × to clear it. Submits through a hidden <input name={name}> so it works
// inside a plain <form action>.
export function CategoryCombobox({
  name = "category",
  options,
  defaultValue = "",
}: {
  name?: string;
  options: string[];
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const q = query.trim();
  const matches = useMemo(() => {
    const needle = q.toLowerCase();
    return options.filter((o) => !needle || o.toLowerCase().includes(needle));
  }, [options, q]);
  const exact = options.some((o) => o.toLowerCase() === q.toLowerCase());
  // Row list = matching existing tags, then a "Create" row for brand-new text.
  const rows = [...matches, ...(q && !exact ? [q] : [])];

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(v: string) {
    // Reuse the existing spelling if the typed text matches a tag ignoring case.
    const existing = options.find((o) => o.toLowerCase() === v.toLowerCase());
    setValue(existing ?? v);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      // Never let Enter submit the whole product form from this field.
      e.preventDefault();
      if (open && rows[highlight]) pick(rows[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !query && value) {
      setValue("");
    }
  }

  return (
    <div ref={boxRef} className="relative max-w-[480px]">
      <input type="hidden" name={name} value={value} />
      {value ? (
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-alt py-1 pl-3 pr-1.5 text-[13px] font-medium text-ink">
            {value}
            <button
              type="button"
              onClick={() => setValue("")}
              aria-label={`Remove category ${value}`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:bg-line hover:text-ink"
            >
              ×
            </button>
          </span>
        </div>
      ) : null}
      <input
        id={name}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${name}-list`}
        autoComplete="off"
        maxLength={MAX_LEN}
        className={inputClass}
        placeholder={value ? "Change category…" : "Pick or type a category…"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && rows.length > 0 && (
        <ul
          id={`${name}-list`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-control border border-line-strong bg-surface py-1 shadow-lg"
        >
          {rows.map((r, i) => {
            const isNew = i >= matches.length;
            return (
              <li
                key={`${i}-${r}`}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(r);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer px-3.5 py-2 text-[15px] ${
                  i === highlight ? "bg-surface-alt" : ""
                }`}
              >
                {isNew ? (
                  <>
                    Create <span className="font-medium">“{r}”</span>
                  </>
                ) : (
                  r
                )}
              </li>
            );
          })}
        </ul>
      )}
      {open && rows.length === 0 && (
        <p className="absolute z-20 mt-1 w-full rounded-control border border-line-strong bg-surface px-3.5 py-2 text-[13px] text-ink-muted shadow-lg">
          No categories yet — type a name to create one.
        </p>
      )}
    </div>
  );
}
