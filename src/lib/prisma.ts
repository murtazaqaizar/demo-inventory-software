import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 (prisma-client generator) uses the query compiler and requires a driver adapter.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const url = process.env.DATABASE_URL;

  // A local scratch database (used by the verification scripts) speaks plain TCP;
  // asking for TLS there just fails the handshake.
  //
  // The parse is wrapped because an unparseable DATABASE_URL used to surface as a
  // bare `TypeError: Invalid URL` during the Vercel build, with the value printed as
  // `[REDACTED]` — a message naming neither the variable nor the problem.
  //
  // Only two mistakes actually reach here, both from pasting into a hosting
  // dashboard: the value copied WITH its surrounding quotation marks, or the `psql`
  // command copied instead of the connection URI. Everything else people worry
  // about — [YOUR-PASSWORD] left in place, an unencoded @ or a space in the
  // password — parses cleanly and fails later at connection time instead.
  let isLocal = false;
  if (url) {
    try {
      isLocal = ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname);
    } catch {
      throw new Error(
        "DATABASE_URL is not a valid connection URL. It must begin with postgresql:// — " +
          "check that the value was pasted without surrounding quotation marks, and that " +
          "it is the connection URI rather than the psql command."
      );
    }
  }

  // Supabase presents a cert chain node-postgres treats as self-signed; skip chain
  // verification (connection is still TLS-encrypted). Safe for Supabase's managed CA.
  const adapter = new PrismaPg({
    connectionString: url,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
