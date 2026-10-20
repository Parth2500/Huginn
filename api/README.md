# Huginn API

NestJS 12 with Socket.IO and TypeORM on PostgreSQL. See the [repository README](../README.md) for
running the whole stack, and [docs/huginn/architecture.md](../docs/huginn/architecture.md) for the
realtime protocol.

| Script | Does |
|---|---|
| `npm run start:dev` | Watch mode (needs `DATABASE_URL` and `JWT_SECRET`) |
| `npm run build` | Compile into `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests against a real Postgres |
| `npm run lint` | ESLint with Prettier |

Profile photos are stored in `uploads/` (git-ignored) and served from `/api/uploads`.
