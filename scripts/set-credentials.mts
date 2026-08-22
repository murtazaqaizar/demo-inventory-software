/**
 * Sets a login's username and/or password. The app has no self-serve password
 * reset, so this is the supported way to change credentials.
 *
 *   npm run user:set -- --target owner --username admin --password admin
 *   npm run user:set -- --target admin --password "something-better"
 *   npm run user:set -- --list
 *
 * Notes:
 *  - Usernames are stored lowercase; sign-in lowercases what's typed before
 *    looking the user up, so a stored uppercase username can never log in.
 *  - Passwords are hashed with bcrypt (10 rounds), matching prisma/seed.ts and
 *    what auth.ts verifies against. The plaintext is never stored.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL;
const isLocal = !!url && ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname);
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  }),
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const host = url ? new URL(url).hostname : "(unset)";

  if (process.argv.includes("--list")) {
    const users = await prisma.user.findMany({
      select: { username: true, name: true, role: true, active: true },
      orderBy: { username: "asc" },
    });
    console.log(`Logins on ${host}:`);
    console.table(users);
    await prisma.$disconnect();
    return;
  }

  const target = arg("target");
  const username = arg("username");
  const password = arg("password");
  const name = arg("name");

  if (!target) {
    console.error("Missing --target <existing username>. Use --list to see logins.");
    process.exit(1);
  }
  if (!username && !password && !name) {
    console.error("Nothing to change: pass --username and/or --password and/or --name.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { username: target.toLowerCase() } });
  if (!existing) {
    console.error(`No login named "${target}". Use --list to see what exists.`);
    process.exit(1);
  }

  const data: Record<string, unknown> = {};
  if (username) data.username = username.toLowerCase();
  if (name) data.name = name;
  if (password) data.passwordHash = await bcrypt.hash(password, 10);

  const updated = await prisma.user.update({ where: { id: existing.id }, data });

  console.log(`Updated on ${host}:`);
  console.log(`  username : ${existing.username} -> ${updated.username}`);
  console.log(`  name     : ${existing.name} -> ${updated.name}`);
  console.log(`  role     : ${updated.role} (unchanged)`);
  console.log(`  active   : ${updated.active}`);
  console.log(`  password : ${password ? "changed" : "unchanged"}`);

  if (password) {
    // Prove the stored hash actually validates the new password, the same way
    // auth.ts will at sign-in.
    const ok = await bcrypt.compare(password, updated.passwordHash);
    console.log(`\n${ok ? "✅" : "❌"} sign-in check: bcrypt.compare against the stored hash ${ok ? "passes" : "FAILS"}`);
    if (!ok) process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
