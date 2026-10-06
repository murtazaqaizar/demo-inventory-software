"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addProductTag, removeProductTag, type ActionResult } from "../actions";
import type { ProductTagRow } from "@/lib/products";
import { Button, Input, Label, Panel } from "@/components/ui";

export function TagManager({ tags, canRemove }: { tags: ProductTagRow[]; canRemove: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<ActionResult>, form?: HTMLFormElement) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        form?.reset();
        router.refresh();
      } else {
        setError(res.error ?? "That did not save.");
      }
    });
  }

  return (
    <Panel pad className="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addProductTag(new FormData(e.currentTarget)), e.currentTarget);
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="min-w-[240px] flex-1">
          <Label htmlFor="tag-name">New tag</Label>
          <Input id="tag-name" name="name" maxLength={40} required placeholder="Cutting Discs" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "…" : "Add tag"}
        </Button>
      </form>
      {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}

      {tags.length > 0 ? (
        <ul className="mt-5 flex flex-wrap gap-2">
          {tags.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-control border border-line bg-surface-alt px-2.5 py-1.5 text-[15px]"
            >
              <Link
                href={`/products?category=${encodeURIComponent(t.name)}`}
                className="text-ink hover:underline"
              >
                {t.name}
              </Link>
              <span className="font-mono text-[13px] text-ink-muted">{t.productCount}</span>
              {canRemove && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => removeProductTag(new FormData(e.currentTarget)));
                  }}
                >
                  <input type="hidden" name="id" value={t.id} />
                  <button
                    type="submit"
                    disabled={pending}
                    aria-label={`Remove ${t.name}`}
                    className="text-ink-muted transition-colors hover:text-bad"
                  >
                    ✕
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-[13px] text-ink-muted">No tags yet — add your first one above.</p>
      )}

      <p className="mt-5 text-[13px] text-ink-muted">
        The number beside each tag is how many products carry it. Removing a tag that products
        still use keeps it on those products and just takes it off the dropdown.
      </p>
    </Panel>
  );
}
