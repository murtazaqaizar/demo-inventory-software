import { prisma } from "@/lib/prisma";
import { requireOwnerPage } from "@/lib/guards";
import {
  Badge,
  EmptyState,
  Panel,
  PageHeader,
  rowClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/ui";
import { SearchBar, Pagination } from "@/components/list-controls";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 40;

// Only genuinely exceptional actions get colour. Colour-coding all eight action
// types made "bill created" look like a success state — it is a log line.
const actionTone: Record<string, "neutral" | "green" | "amber" | "red"> = {
  INVOICE_VOID: "red",
  USER_DEACTIVATE: "red",
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; page?: string }>;
}) {
  await requireOwnerPage();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.AuditLogWhereInput = {};
  if (sp.q) {
    where.OR = [
      { summary: { contains: sp.q, mode: "insensitive" } },
      { username: { contains: sp.q, mode: "insensitive" } },
      { action: { contains: sp.q, mode: "insensitive" } },
    ];
  }
  if (sp.from || sp.to) {
    where.createdAt = {};
    if (sp.from) where.createdAt.gte = new Date(sp.from);
    if (sp.to) {
      const end = new Date(sp.to);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return (
    <div>
      <PageHeader
        title="Activity log"
        description="Who did what — bills created and voided, returns, stock changes and login changes."
      />

      <Panel>
        <SearchBar
          action="/activity"
          q={sp.q}
          from={sp.from}
          to={sp.to}
          withDates
          placeholder="Search by person, action or detail"
        />

        {logs.length === 0 ? (
          <EmptyState>No activity recorded yet.</EmptyState>
        ) : (
          <div className="tablewrap">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>When</th>
                  <th className={thClass}>Who</th>
                  <th className={thClass}>Action</th>
                  <th className={thClass}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className={rowClass}>
                    <td
                      className={`${tdClass} whitespace-nowrap font-mono text-ink-muted`}
                      data-label="When"
                    >
                      {l.createdAt.toLocaleString("en-PK", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className={`${tdClass} font-medium text-ink`} data-label="Who">
                      {l.username}
                    </td>
                    <td className={tdClass} data-label="Action">
                      <Badge tone={actionTone[l.action] ?? "neutral"}>
                        {l.action.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className={`${tdClass} text-ink-muted`} data-label="Detail">
                      {l.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Pagination
        basePath="/activity"
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        params={{ q: sp.q, from: sp.from, to: sp.to }}
      />
    </div>
  );
}
