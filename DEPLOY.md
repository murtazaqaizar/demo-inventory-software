# Deployment — Vercel + Supabase

The app is production-ready: `npm run build` passes, the Prisma client regenerates on install
(`postinstall`), the schema is live on Supabase, and the `0_init` migration is baselined so
`prisma migrate deploy` works for future changes.

## What Claude has done
- ✅ Production build verified (all 19 routes, server-rendered on demand).
- ✅ `postinstall: prisma generate` — Vercel regenerates the client automatically.
- ✅ Supabase schema pushed + migration baselined (`Database schema is up to date`).
- ✅ WhatsApp share on invoices & statements.

## What YOU need to do (Vercel console — Claude can't click these)

### 1. Push the code to GitHub
```bash
cd Project/software/inventory-app
git add -A
git commit -m "Inventory, billing & accounts app"
# create a repo on github.com, then:
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
> `.env` and `import-data/*.csv` are gitignored — your DB password and client data will NOT be pushed. Good.

### 2. Create the Vercel project
1. vercel.com → **Add New → Project** → import the GitHub repo.
2. Framework preset: **Next.js** (auto-detected). Root directory: the repo root.
3. Do **not** deploy yet — set env vars first (next step).

### 3. Set Environment Variables in Vercel (Project → Settings → Environment Variables)
| Name | Value |
|---|---|
| `DATABASE_URL` | your Supabase connection string (same as local `.env`, password `%20`-encoded) |
| `DIRECT_URL` | same as `DATABASE_URL` |
| `AUTH_SECRET` | a fresh secret — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and paste **only** into Vercel (never commit it) |
| `AUTH_TRUST_HOST` | `true` |

> Add each to **Production** (and Preview if you want preview deploys). Do NOT commit these.

### 4. Deploy
Click **Deploy**. Vercel runs `npm install` (→ `prisma generate`) then `npm run build`.

### 5. First-run setup on production
- Log in with the seeded owner (`owner` / `owner123`) and **change the passwords** (or reseed with real ones).
- Import the client's real data once their Excel is ready: fill `import-data/products.csv` and
  `customers.csv`, then run `npm run db:import` (locally against the same Supabase DB, or via a one-off).

## Backups (spec feature 32)
Supabase includes automated daily backups on paid plans; on the free plan enable **Point-in-Time
Recovery** / manual backups in the Supabase dashboard → Database → Backups. Confirm a backup exists.

## Notes
- Supabase's connection pooler (port 6543) is recommended for serverless if you hit connection
  limits on Vercel; the current direct connection (5432) works for low traffic (2 users).
- SSL: the pg adapter uses `rejectUnauthorized: false` for Supabase's cert chain (see `src/lib/prisma.ts`).
