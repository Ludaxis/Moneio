# Database Migrations

- Use **Prisma migrations** for all schema changes (`pnpm --filter @moneio/db db:migrate`).
- Point `DATABASE_URL` at the **Supabase pooler** (port 6543, `pgbouncer=true&connection_limit=1`) for app/runtime.
- Use **`DIRECT_URL` (port 5432)** only for migrations/`prisma migrate deploy` to avoid pooler limits.
- Commit the generated files under `packages/db/prisma/migrations/` so changes are reviewable and reproducible.
- Avoid `db:push` in production; reserve it for throwaway local experiments.
