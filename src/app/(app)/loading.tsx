import { PageSkeleton } from "@/components/skeleton";

// Fallback for every page in the (app) group that doesn't define its own.
// Without this the sidebar and shell sit blank until all server queries finish,
// which reads as the app having frozen.
export default function Loading() {
  return <PageSkeleton rows={8} />;
}
