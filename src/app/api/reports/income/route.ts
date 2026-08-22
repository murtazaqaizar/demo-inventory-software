import { withOwner } from "@/lib/guards";

// OWNER-only endpoint (spec feature 27/30). Placeholder payload until Step 13
// implements the real income statement — the point here is the server-side gate:
// STAFF gets a 403 even if they hit the API directly.
export const GET = withOwner(() => {
  return Response.json({
    ok: true,
    statement: "income-statement-placeholder",
    note: "Real figures land in Step 13.",
  });
});
