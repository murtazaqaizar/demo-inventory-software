import { prisma } from "@/lib/prisma";

type Actor = { id: string; username: string };

// Record a money/stock-affecting action so the owner can see who did what.
// Never throws — an audit failure must not roll back the user's actual work.
export async function audit(
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | null,
  summary: string
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        username: actor.username,
        action,
        entity,
        entityId,
        summary,
      },
    });
  } catch {
    // swallow — auditing is best-effort
  }
}
