"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addProductTag, removeProductTag, type ActionResult } from "../actions";
import type { ProductTagRow } from "@/lib/products";
import { Button, inputClass } from "@/components/ui";

// Inline tag list inside the product form — you notice a tag is missing at the
// moment you are filing a product under it. It sits INSIDE the product <form>,
// so it uses plain buttons, never a nested <form>, and Enter must not submit
// the product.
export function TagManager({ tags, canRemove }: { tags: ProductTagRow[]; canRemove: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fd: FormData, fn: (fd: FormData) => Promise<ActionResult>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn(fd);
      if (res.ok) {
        onOk?.();
        router.refresh(); // re-reads the tag list, so the dropdown picks it up
      } else {
        setError(res.error ?? "That did not save.");
      }
    });
  }

  function add() {
    const name = inputRef.current?.value.trim() ?? "";
    if (!name) return;
    const fd = new FormData();
    fd.set("name", name);
    run(fd, addProductTag, () => {
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function remove(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    run(fd, removeProductTag);
  }

  return (
    <div className="mt-3 max-w-[480px] rounded-control border border-line bg-surface-alt p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          aria-label="New tag"
          maxLength={40}
          placeholder="New tag, e.g. Cutting Discs"
          className={`${inputClass} min-w-[200px] flex-1`}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" disabled={pending} onClick={add}>
          {pending ? "…" : "Add tag"}
        </Button>
      </div>
      {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}

      {tags.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {tags.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-control border border-line bg-surface px-2.5 py-1 text-[14px]"
            >
              <span className="text-ink">{t.name}</span>
              <span className="font-mono text-[12px] text-ink-muted" title="Products using this tag">
                {t.productCount}
              </span>
              {canRemove && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(t.id)}
                  aria-label={`Remove ${t.name}`}
                  className="text-ink-muted transition-colors hover:text-bad"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-ink-muted">No tags yet — add your first one above.</p>
      )}
      <p className="mt-3 text-[12px] text-ink-muted">
        The number is how many products carry the tag. Removing one that products still use keeps it
        on those products and just takes it off the dropdown.
      </p>
    </div>
  );
}
