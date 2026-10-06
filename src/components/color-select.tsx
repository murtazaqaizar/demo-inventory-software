"use client";

import { useEffect, useRef, useState } from "react";
import { inputClass } from "@/components/ui";

export type ColorOption = { id: string; name: string; hex: string };

/** Small round swatch. A ring keeps white and very light colors visible. */
export function Swatch({ hex, size = 14 }: { hex: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full ring-1 ring-black/15"
      style={{ width: size, height: size, backgroundColor: hex }}
    />
  );
}

// Dropdown of the shop's colors, each shown with its swatch. A native <select>
// can't draw a color next to the option, so this is a small listbox that submits
// through a hidden input named `name`.
export function ColorSelect({
  id,
  name = "colorId",
  colors,
  defaultValue = "",
}: {
  id?: string;
  name?: string;
  colors: ColorOption[];
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Row 0 is "No color".
  const rows: (ColorOption | null)[] = [null, ...colors];
  const selected = colors.find((c) => c.id === value) ?? null;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(c: ColorOption | null) {
    setValue(c?.id ?? "");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(h + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      pick(rows[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative max-w-[480px]">
      <input type="hidden" name={name} value={value} />
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${name}-list`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={`${inputClass} flex items-center gap-2 text-left`}
      >
        {selected ? (
          <>
            <Swatch hex={selected.hex} />
            <span>{selected.name}</span>
          </>
        ) : (
          <span className="text-ink-muted">No color</span>
        )}
        <span aria-hidden className="ml-auto text-ink-muted">
          ▾
        </span>
      </button>
      {open && (
        <ul
          id={`${name}-list`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-control border border-line-strong bg-surface py-1 shadow-float"
        >
          {rows.map((c, i) => (
            <li
              key={c?.id ?? "none"}
              role="option"
              aria-selected={(c?.id ?? "") === value}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              className={`flex cursor-pointer items-center gap-2 px-3.5 py-2 text-[15px] ${
                i === highlight ? "bg-accent-soft" : ""
              }`}
            >
              {c ? (
                <>
                  <Swatch hex={c.hex} />
                  {c.name}
                </>
              ) : (
                <span className="text-ink-muted">No color</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
