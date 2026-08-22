import { cache } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

// For SERVER COMPONENTS / pages: redirect to login or dashboard when not allowed.
//
// Wrapped in React's `cache` so the layout and the page it renders share one
// session decode instead of doing the work twice on every navigation.
export const requireUser = cache(async () => {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
});

export async function requireOwnerPage() {
  const user = await requireUser();
  if (user.role !== "OWNER") redirect("/"); // staff bounced from money-side pages
  return user;
}

export function isOwner(role: string | undefined) {
  return role === "OWNER";
}

// For API / ROUTE HANDLERS & server actions: throw a real 403, never just hide UI.
// The spec's permission promise is only meaningful if the server refuses.
export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Forbidden") {
    super(message);
  }
}

export async function requireUserApi() {
  const session = await auth();
  if (!session?.user) throw new ForbiddenError("Not authenticated");
  return session.user;
}

export async function requireOwnerApi() {
  const user = await requireUserApi();
  if (user.role !== "OWNER") throw new ForbiddenError("Owner access only");
  return user;
}

// Wrap a route handler so ForbiddenError becomes a 403 JSON response.
export function withOwner(
  handler: () => Promise<Response> | Response
): () => Promise<Response> {
  return async () => {
    try {
      await requireOwnerApi();
      return await handler();
    } catch (e) {
      if (e instanceof ForbiddenError) {
        return Response.json({ error: e.message }, { status: 403 });
      }
      throw e;
    }
  };
}
