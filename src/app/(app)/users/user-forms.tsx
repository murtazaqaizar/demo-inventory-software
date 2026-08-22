"use client";

import { useActionState } from "react";
import { changePassword, createUser, toggleUserActive, type ActionResult } from "./actions";
import { Button, Panel, Input, Label, Select } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";

export function ChangePasswordForm({ userId, username }: { userId: string; username: string }) {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => changePassword(fd),
    { ok: false }
  );
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <Label htmlFor={`pw-${userId}`}>New password</Label>
        <PasswordInput id={`pw-${userId}`} name="newPassword" required autoComplete="new-password" />
      </div>
      <div>
        <Label htmlFor={`cf-${userId}`}>Confirm</Label>
        <PasswordInput id={`cf-${userId}`} name="confirm" required autoComplete="new-password" />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : `Update ${username}`}
        </Button>
      </div>
      {state.error && <p className="text-sm text-bad sm:col-span-3">{state.error}</p>}
      {state.ok && state.message && <p className="text-sm text-ok sm:col-span-3">{state.message}</p>}
    </form>
  );
}

export function AddUserForm() {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => createUser(fd),
    { ok: false }
  );
  return (
    <Panel pad>
      <h2 className="mb-1 font-semibold text-ink">Add a login</h2>
      <p className="mb-3 text-sm text-ink-muted">
        Give each person their own login so the activity log shows who did what.
      </p>
      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
        <div>
          <Label htmlFor="u-name">Full name</Label>
          <Input id="u-name" name="name" required placeholder="Ahmed Ali" />
        </div>
        <div>
          <Label htmlFor="u-username">Username</Label>
          <Input id="u-username" name="username" required placeholder="ahmed" />
        </div>
        <div>
          <Label htmlFor="u-pw">Password</Label>
          <PasswordInput id="u-pw" name="password" required autoComplete="new-password" />
        </div>
        <div>
          <Label htmlFor="u-role">Role</Label>
          <Select id="u-role" name="role" defaultValue="STAFF">
            <option value="STAFF">Staff</option>
            <option value="OWNER">Owner</option>
          </Select>
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add login"}
          </Button>
        </div>
        {state.error && <p className="text-sm text-bad sm:col-span-5">{state.error}</p>}
        {state.ok && state.message && <p className="text-sm text-ok sm:col-span-5">{state.message}</p>}
      </form>
    </Panel>
  );
}

export function ToggleActive({ userId, active }: { userId: string; active: boolean }) {
  const [state, formAction, pending] = useActionState(
    async (_p: ActionResult, fd: FormData) => toggleUserActive(fd),
    { ok: false }
  );
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="secondary" disabled={pending} className="px-3 py-1.5">
        {pending ? "…" : active ? "Deactivate" : "Reactivate"}
      </Button>
      {state.error && <span className="text-[13px] text-bad">{state.error}</span>}
    </form>
  );
}
