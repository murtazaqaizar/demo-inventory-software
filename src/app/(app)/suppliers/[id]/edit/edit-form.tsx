"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateSupplier, type ActionResult } from "../../actions";
import { Button, Panel, Input, Label } from "@/components/ui";

export function SupplierEditForm({
  initial,
}: {
  initial: { id: string; name: string; phone: string | null; notes: string | null };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => updateSupplier(fd),
    { ok: false }
  );

  useEffect(() => {
    if (state.ok) router.push("/suppliers");
  }, [state.ok, router]);

  return (
    <Panel className="max-w-2xl p-6">
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="supplierId" value={initial.id} />
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

        <div>
          <Label htmlFor="notes">Notes</Label>
          <Input id="notes" name="notes" defaultValue={initial.notes ?? ""} placeholder="optional" />
        </div>

        {state.error && <p className="text-[13px] text-bad">{state.error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/suppliers")}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}
