"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addExpenseHead, createExpense, removeExpenseHead, type ActionResult } from "./actions";
import type { ExpenseHead } from "@/lib/expense-heads";
import { Button, Panel, Input, Label, Select, numInputClass } from "@/components/ui";

export function ExpenseForm({ heads }: { heads: ExpenseHead[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => createExpense(fd),
    { ok: false }
  );

  // The head list is managed inline rather than on a separate screen: you notice
  // a head is missing at the moment you are trying to file an expense under it.
  const [managing, setManaging] = useState(false);
  const [headError, setHeadError] = useState<string | null>(null);
  const [headPending, startHeadTransition] = useTransition();

  function runHead(fn: () => Promise<ActionResult>, form?: HTMLFormElement) {
    setHeadError(null);
    startHeadTransition(async () => {
      const res = await fn();
      if (res.ok) {
        form?.reset();
        router.refresh();
      } else {
        setHeadError(res.error ?? "That did not save.");
      }
    });
  }

  const custom = heads.filter((h) => !h.builtIn);

  return (
    <Panel pad>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">Record expense</h2>
        <Button
          type="button"
          variant="quiet"
          className="px-2 py-1 text-[13px]"
          onClick={() => setManaging((v) => !v)}
        >
          {managing ? "Done" : "Manage heads"}
        </Button>
      </div>

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
        <div>
          <Label htmlFor="e-cat">Head</Label>
          <Select id="e-cat" name="category" defaultValue="Electricity">
            {heads.map((h) => (
              <option key={h.name} value={h.name}>
                {h.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="e-amt">Amount (Rs)</Label>
          <Input
            id="e-amt"
            name="amountRs"
            type="number"
            step="0.01"
            min={0}
            required
            className={numInputClass}
          />
        </div>
        <div>
          <Label htmlFor="e-date">Date</Label>
          <Input id="e-date" name="date" type="date" className="font-mono" />
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "…" : "Add expense"}
          </Button>
        </div>
        <div className="sm:col-span-4">
          <Input name="note" placeholder="Note (optional)" />
        </div>
      </form>
      {state.error && <p className="mt-2 text-sm text-bad">{state.error}</p>}

      {managing && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-[15px] font-medium text-ink">Your own heads</h3>
          <p className="mb-3 text-[13px] text-ink-muted">
            The seven built-in heads are always available. Anything you add here joins the list
            above. Removing a head you have already used keeps the old expenses and just takes it
            off the form.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              runHead(() => addExpenseHead(new FormData(e.currentTarget)), e.currentTarget);
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <div>
              <Label htmlFor="head-name">New head</Label>
              <Input
                id="head-name"
                name="name"
                maxLength={40}
                required
                placeholder="Chai / packing / mobile load"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={headPending}>
              {headPending ? "…" : "Add head"}
            </Button>
          </form>
          {headError && <p className="mt-2 text-[13px] text-bad">{headError}</p>}

          {custom.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {custom.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-2 rounded-control border border-line bg-surface-alt px-2.5 py-1.5 text-[15px]"
                >
                  <span className="text-ink">{h.name}</span>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      runHead(() => removeExpenseHead(new FormData(e.currentTarget)));
                    }}
                  >
                    <input type="hidden" name="id" value={h.id} />
                    <button
                      type="submit"
                      disabled={headPending}
                      aria-label={`Remove ${h.name}`}
                      className="text-ink-muted transition-colors hover:text-bad"
                    >
                      ✕
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[13px] text-ink-muted">
              You have not added any heads of your own yet.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
