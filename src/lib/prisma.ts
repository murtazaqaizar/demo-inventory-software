import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 (prisma-client generator) uses the query compiler and requires a driver adapter.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const url = process.env.DATABASE_URL;
  // A local scratch database (used by the verification scripts) speaks plain TCP;
  // asking for TLS there just fails the handshake.
  const isLocal =
    !!url && ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname);

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
