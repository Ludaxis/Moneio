# MVP Progress

## T01: scaffold monorepo + CI + env examples

**What’s done**
- Added baseline ESLint config and lint scripts across packages.
- Added GitHub Actions CI workflow for lint, typecheck, test, and build.
- Added `.env.example` files for web and worker apps.
- Created missing repo structure folders with placeholders.
- Adjusted test scripts to pass when no tests exist yet.
- Updated web layout/build to avoid remote font downloads in CI.

**How to verify manually**
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` from the repo root.
- Confirm `.env.example` files exist in `apps/web` and `apps/worker`.

**Known gaps**
- ESLint warns about the Next.js plugin detection and TypeScript version mismatch.
- Next.js build reports an invalid `i18n.localeDetection` config (to be addressed in T04).
