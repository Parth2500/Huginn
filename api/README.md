# Huginn API

NestJS 12 with Socket.IO and TypeORM on PostgreSQL. See the [repository README](../README.md) for
running the whole stack, and [docs/huginn/architecture.md](../docs/huginn/architecture.md) for the
realtime protocol.

| Script | Does |
|---|---|
| `pnpm run start:dev` | Watch mode (needs `DATABASE_URL` and `JWT_SECRET`) |
| `pnpm run build` | Compile into `dist/` |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm run test:e2e` | End-to-end tests against a real Postgres |
| `pnpm run lint` | ESLint with Prettier |

Profile photos are stored in `uploads/` (git-ignored) and served from `/api/uploads`.
