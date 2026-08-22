// Turning a thrown error into something the shopkeeper can act on.
//
// Without this, anything that throws inside a server action — a dropped
// database connection, a permission check, a timeout — reaches the browser as
// Next's generic error screen with a digest hash on it. That tells the person
// standing at the counter nothing, and it loses whatever they had typed.
//
// Every mutating action funnels through `safeAction`, so a failure comes back
// as an ordinary `{ ok: false, error }` result that the form already knows how
// to show inline, with the entered data still on screen.

import { ForbiddenError } from "@/lib/guards";

// Prisma's known error codes. Only the ones that can realistically happen here
// get their own wording; anything else falls through to the generic message.
const PRISMA_MESSAGES: Record<string, string> = {
  // Interactive transaction expired — almost always a slow connection.
  P2028: "That took too long to save and was cancelled — nothing was changed. Check your internet and try again.",
  // Unique constraint.
  P2002: "That already exists. Check for a duplicate entry.",
  // Foreign key constraint.
  P2003: "Something this refers to is missing or still in use. Refresh the page and try again.",
  // Record required but not found.
  P2025: "That record no longer exists — someone may have deleted it. Refresh the page.",
  // Can't reach the database.
  P1001: "Can't reach the database right now. Check your internet, then try again.",
  P1002: "The database took too long to respond. Try again in a moment.",
  P1008: "The database took too long to respond. Try again in a moment.",
  P1017: "The connection to the database dropped. Try again.",
};

function prismaCode(e: unknown): string | null {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = (e as { code: unknown }).code;
    if (typeof code === "string" && /^P\d{4}$/.test(code)) return code;
  }
  return null;
}

export function describeActionError(e: unknown): string {
  if (e instanceof ForbiddenError) {
    return "You don't have permission to do that. Ask the owner to sign in.";
  }

  const code = prismaCode(e);
  if (code) {
    // Log the real thing for whoever is reading the server output; the person
    // at the counter gets the sentence above.
    console.error(`[action] Prisma ${code}`, e);
    return PRISMA_MESSAGES[code] ?? "The database rejected that change. Nothing was saved.";
  }

  console.error("[action] unhandled", e);
  return "Something went wrong and nothing was saved. Try again — if it keeps happening, note what you were doing and tell the developer.";
}

// Wrap an action body so a throw becomes a normal failed result instead of a
// crashed page. `onError` builds the failure in whatever shape the action
// returns, which differs slightly between modules.
export async function safeAction<T>(
  fn: () => Promise<T>,
  onError: (message: string) => T
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    // A redirect (or notFound) is thrown on purpose by Next and must be
    // allowed to propagate, or navigation silently stops working.
    if (isNextControlFlow(e)) throw e;
    return onError(describeActionError(e));
  }
}

// Next signals redirect()/notFound() by throwing a tagged error. Swallowing
// those would turn a working navigation into a fake failure message.
function isNextControlFlow(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND");
}
