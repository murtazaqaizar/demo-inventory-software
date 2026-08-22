import { prisma } from "@/lib/prisma";
import { requireOwnerPage } from "@/lib/guards";
import { Badge, EmptyState, Panel, PanelHeader, PageHeader } from "@/components/ui";
import { AddUserForm, ChangePasswordForm, ToggleActive } from "./user-forms";

export default async function UsersPage() {
  await requireOwnerPage(); // OWNER only (feature 30)

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="Logins and roles. Passwords are stored scrambled (hashed) — never in plain text."
      />

      <div className="mb-6">
        <AddUserForm />
      </div>

      {/* One panel holding a list, not a panel per user. */}
      <Panel>
        <PanelHeader title={`Logins (${users.length})`} />
        {users.length === 0 && (
          <EmptyState>No logins yet. Add one above to give someone access.</EmptyState>
        )}
        {users.map((u) => (
          <div
            key={u.id}
            className={`border-b border-line px-6 py-5 last:border-0 ${
              u.active ? "" : "opacity-60"
            }`}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">{u.name}</p>
                <p className="text-[13px] text-ink-muted">
                  username: <span className="font-mono">{u.username}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">{u.role}</Badge>
                {!u.active && <Badge tone="red">Deactivated</Badge>}
                <ToggleActive userId={u.id} active={u.active} />
              </div>
            </div>
            {u.active && <ChangePasswordForm userId={u.id} username={u.username} />}
          </div>
        ))}
      </Panel>

      <p className="mt-6 max-w-[72ch] text-[15px] text-ink-muted">
        Deactivating a login keeps its history in the activity log. Change the default
        passwords before the shop starts using the system.
      </p>
    </div>
  );
}
