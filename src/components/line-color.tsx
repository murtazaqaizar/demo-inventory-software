"use client";

import { Select } from "@/components/ui";
import { Swatch } from "@/components/color-select";
import { formatQtyUnit } from "@/lib/qty";
import type { PickerProduct } from "@/components/product-picker";

// Color choice on a bill / purchase / return line. Only rendered for products that
// come in colors; each option shows that color's stock so the counter can see at a
// glance which color is on the shelf.
export function LineColorSelect({
  product,
  value,
  onChange,
}: {
  product: PickerProduct;
  value: string;
  onChange: (colorId: string) => void;
}) {
  const colors = product.colors ?? [];
  if (colors.length === 0) return null;
  const selected = colors.find((c) => c.id === value);
  return (
    <div className="flex items-center gap-2">
      {selected ? <Swatch hex={selected.hex} size={16} /> : <span className="inline-block w-4" />}
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Color"
        className={value ? "" : "border-warn"}
      >
        <option value="">Pick a color…</option>
        {colors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} — {formatQtyUnit(product.colorStock?.[c.id] ?? 0, product.unit)}
          </option>
        ))}
      </Select>
    </div>
  );
}
