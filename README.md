# Ambar Fabrics

Premium fabric and clothing e-commerce platform for India (Next.js 16, MongoDB, Razorpay).
The architecture and roadmap live in [`docs/`](docs/); current progress is in
[`docs/project-status.md`](docs/project-status.md). The build proceeds one approved phase at a time.

## Requirements

- Node.js 22+ (`.nvmrc` pins 24) and pnpm (version pinned by `packageManager`)
- A MongoDB **replica set** (needed for transactions). Pick one:
  - Docker: `pnpm db:up` (see `docker-compose.yml`), persistent
  - No Docker: `pnpm db:dev` prints a `MONGODB_URI` for a throwaway in-memory replica set
  - MongoDB Atlas (free M0 works for development)

## Getting started

```bash
pnpm install
cp .env.example .env.local     # then set MONGODB_URI and AUTH_SECRET (openssl rand -base64 32)
pnpm dev                       # http://localhost:3000, health check at /api/health
```

## Scripts

| Command                        | Purpose                                                                     |
| ------------------------------ | --------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start` | Next.js development / production build / serve                              |
| `pnpm typecheck`               | Generate route types and run `tsc --noEmit`                                 |
| `pnpm lint`                    | ESLint (includes layering and security rules)                               |
| `pnpm format` / `format:check` | Prettier                                                                    |
| `pnpm test`                    | Vitest: unit + integration (real in-memory Mongo)                           |
| `pnpm check`                   | typecheck + lint + format check + tests                                     |
| `pnpm test:e2e`                | Playwright browser tests (run `pnpm exec playwright install chromium` once) |
| `pnpm db:seed [--yes]`         | Load sample catalogue (dry run without `--yes`; shows the target database)  |
| `pnpm db:unseed --yes`         | Remove only the sample data                                                 |
| `pnpm db:indexes [--yes]`      | Reconcile database indexes (run on deploy in production)                    |

The first `pnpm test` downloads a MongoDB binary (cached afterwards) for the integration tests.

## Conventions

- Next.js 16 with Cache Components: time-dependent or request-specific values must be in `"use cache"`
  functions or behind `<Suspense>`/`connection()`. Read `node_modules/next/dist/docs/` before relying on
  remembered Next.js APIs (see `AGENTS.md`). Error boundaries receive `retry`, not `reset`.
- Layering: `app/` and `components/` call `features/` and `services/`; only repositories touch models
  or `mongoose` (enforced by ESLint). Server-only code imports `server-only`.
- Environment is validated in `src/lib/env`. Browser-visible values go through `lib/env/public`; secrets
  only through `lib/env/server`. Optional integrations are checked at their own boundary with
  `requireGroup("razorpay")` and similar.
- Never commit secrets. `.env.example` contains placeholders only.

## Creating the first admin

`pnpm admin:create` shows what it would do (dry run); add `--yes` to create the super admin. See `docs/deployment.md` for the full auth setup.
