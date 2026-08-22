import { PageHeader, Panel } from "@/components/ui";

export function Placeholder({
  title,
  description,
  step,
}: {
  title: string;
  description: string;
  step: string;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Panel>
        <div className="p-12 text-center text-ink-muted">
          This module is scaffolded. Full functionality arrives in{" "}
          <span className="font-medium text-ink">{step}</span>.
        </div>
      </Panel>
    </div>
  );
}
