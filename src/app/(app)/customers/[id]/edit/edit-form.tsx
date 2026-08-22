"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateCustomer, type ActionResult } from "../../actions";
import { Button, Panel, Input, Label, numInputClass } from "@/components/ui";

export function CustomerEditForm({
  canSeeMoney,
  initial,
}: {
  canSeeMoney: boolean;
  initial: { id: string; name: string; phone: string | null; openingBalanceRs: number; creditLimitRs: number };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => updateCustomer(fd),
    { ok: false }
  );

  useEffect(() => {
    if (state.ok) router.push("/customers");
  }, [state.ok, router]);

  return (
    <Panel className="max-w-2xl p-6">
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="customerId" value={initial.id} />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required defaultValue={initial.name} />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={initial.phone ?? ""} placeholder="03xx-xxxxxxx" />
          </div>
        </div>

        {canSeeMoney && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="openingBalanceRs">Opening udhaar (Rs)</Label>
              <Input id="openingBalanceRs" name="openingBalanceRs" type="number" min={0} step="0.01" defaultValue={initial.openingBalanceRs} className={numInputClass} />
            </div>
            <div>
              <Label htmlFor="creditLimitRs">Credit limit (Rs)</Label>
              <Input id="creditLimitRs" name="creditLimitRs" type="number" min={0} step="0.01" defaultValue={initial.creditLimitRs} placeholder="0 = no limit" className={numInputClass} />
            </div>
          </div>
        )}

        {state.error && <p className="text-[13px] text-bad">{state.error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/customers")}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}
