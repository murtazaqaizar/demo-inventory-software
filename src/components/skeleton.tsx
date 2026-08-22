import { Panel, RailBlock } from "@/components/ui";

// Stand-in blocks while a page's data loads. `animate-pulse` sits on the wrapper
// so every bar pulses in sync rather than shimmering independently — no sweep,
// per the motion policy in design/DESIGN.md.

export function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded-chip bg-surface-alt ${className}`} />;
}

/** Rail metric placeholder — metrics live in the rail, never as equal cards. */
export function StatSkeleton() {
  return (
    <div className="border-b border-line py-2.5 last:border-0 last:pb-0">
      <Bar className="h-3.5 w-24" />
      <Bar className="mt-2 h-6 w-32" />
      <Bar className="mt-2 h-3.5 w-40" />
    </div>
  );
}

// A stand-in for the grouped table most pages render. Rows are the real 44px
// height so the page does not jump when data arrives.
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Panel>
      <div className="border-b border-line bg-surface-alt px-4 py-2.5 md:px-6">
        <Bar className="h-3.5 w-32" />
      </div>
      <div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex h-11 items-center justify-between gap-4 border-b border-line px-4 last:border-0 md:px-6"
          >
            <Bar className="h-3.5 w-1/3" />
            <Bar className="h-3.5 w-20" />
            <Bar className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </Panel>
  );
}

// The default page shell: title, working panel, and the rail beside it.
export function PageSkeleton({ stats = 0, rows = 6 }: { stats?: number; rows?: number }) {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <Bar className="h-8 w-56" />
      <Bar className="mt-2.5 h-4 w-80 max-w-full" />
      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <TableSkeleton rows={rows} />
        </div>
        {stats > 0 && (
          <div className="w-full lg:w-[300px]">
            <RailBlock title="&nbsp;">
              {Array.from({ length: stats }).map((_, i) => (
                <StatSkeleton key={i} />
              ))}
            </RailBlock>
          </div>
        )}
      </div>
    </div>
  );
}
