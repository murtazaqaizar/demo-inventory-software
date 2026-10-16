// Runs once when each server instance starts, before it handles a request
// (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { applyAppTimeZone } = await import("@/lib/timezone");
    applyAppTimeZone();
  }
}
