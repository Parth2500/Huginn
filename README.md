# Huginn

A private, real-time chat app: direct chats, groups, profiles, presence and typing, built to grow
into a full messenger with end-to-end encryption. Sign-in will come from
[Heimdall](https://github.com/Parth2500/heimdall-idp), a separate OIDC provider.

| Folder | What it is |
|---|---|
| `web/` | Angular 22 app (standalone components, signals) |
| `api/` | NestJS 12 API with Socket.IO and TypeORM on PostgreSQL |
| `docs/huginn/` | Product spec, UX design, architecture, roadmap and decisions |
| `docs/SCALING.md` | What breaks at a million users, with measurements |
| `PRODUCT.md`, `DESIGN.md` | Product context and the design system |

## Run it

You need Node 24 (`nvm use` reads `.nvmrc`) and Docker or Podman.

**Everything in containers:**

```
docker compose up
```

The app is at http://localhost:4200, the API at http://localhost:3000/api (Swagger at `/api`),
and pgAdmin at http://localhost:5050.

**Or run the API and app locally against a Postgres container:**

```
docker compose up -d postgres
cd api && npm ci && DATABASE_URL=postgres://huginn:huginn@localhost:35000/huginn npm run start:dev
cd web && npm ci && npm start          # proxies /api and /socket.io to http://localhost:3000 (override with API_URL)
```

On drives where file watching is unreliable (some external or network drives), add `--poll 1000`
to `npm start`, and set `TSC_WATCHFILE=DynamicPriorityPolling` for the API.

Sign-in uses an httpOnly session cookie, so the app, the API and the socket must share one origin.
The dev server proxies `/api` and `/socket.io`. In production, serve the app and route both
paths to the API from the same host. API settings for sessions:

| Variable | Default | Meaning |
|---|---|---|
| `APP_ORIGINS` | `http://localhost:4200` | Comma-separated origins the app is served from. Changes and sockets from any other site are refused. |
| `SESSION_COOKIE_SECURE` | `true` when `NODE_ENV=production` | Secure `__Host-` cookie. Set `false` only to serve over plain HTTP. |

## Test

```
cd api && npm test          # unit tests
cd api && npm run test:e2e  # API end-to-end tests against Postgres (see api/test/README.md)
cd web && npm test          # component tests (Vitest)
```
