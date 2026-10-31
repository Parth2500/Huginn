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
cd api && pnpm install && DATABASE_URL=postgres://huginn:huginn@localhost:35000/huginn pnpm run start:dev
cd web && pnpm install && pnpm start          # proxies /api and /socket.io to http://localhost:3000 (override with API_URL)
```

On drives where file watching is unreliable (some external or network drives), add `--poll 1000`
to `pnpm start`, and set `TSC_WATCHFILE=DynamicPriorityPolling` for the API.

Sign-in uses an httpOnly session cookie, so the app, the API and the socket must share one origin.
The dev server proxies `/api` and `/socket.io`. In production, serve the app and route both
paths to the API from the same host. API settings for sessions:

| Variable | Default | Meaning |
|---|---|---|
| `APP_ORIGINS` | `http://localhost:4200` | Comma-separated origins the app is served from. Changes and sockets from any other site are refused. |
| `SESSION_COOKIE_SECURE` | `true` when `NODE_ENV=production` | Secure `__Host-` cookie. Set `false` only to serve over plain HTTP. |

### Web Push (optional)

Notifications reach a closed Huginn through Web Push when these are set in `api/.env`. Without
them, open tabs are still notified.

| Variable | Example |
|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | from `cd api && pnpm run push:keys`. Keep the private key secret, and keep the pair: new keys void every subscription. |
| `VAPID_SUBJECT` | `mailto:you@example.com`: push services write here about problems |
| `PUSH_SERVICE_HOSTS` | optional: comma-separated host suffixes that replace the built-in list of browser push services |

### Sign in with Heimdall (optional)

Huginn also offers "Continue with Heimdall" when these are set (in `api/.env`, which git ignores):

| Variable | Example |
|---|---|
| `HEIMDALL_ISSUER` | `https://acme.localhost:7200` |
| `HEIMDALL_CLIENT_ID` | `huginn` |
| `HEIMDALL_CLIENT_SECRET` | printed once by Heimdall's `seed-dev`; or use a key, below |
| `HEIMDALL_CLIENT_KEY_FILE` | optional: `.local/heimdall-client-key.pem`, for `private_key_jwt` instead of the secret |
| `HEIMDALL_REDIRECT_URI` | `http://localhost:4200/api/auth/heimdall/callback` |
| `HEIMDALL_POST_LOGOUT_REDIRECT_URI` | optional: `http://localhost:4200/public/login?signedOut=heimdall` (registered by `seed-dev`) |
| `HEIMDALL_CA_FILE` | development only: the ASP.NET dev certificate, from `dotnet dev-certs https --export-path .local/heimdall-dev-ca.pem --format PEM --no-password` (delete the `.key` file it also writes) |

To authenticate with a key instead of the secret (`private_key_jwt`), run
`cd api && pnpm run heimdall:client-key`. It writes an EC P-256 private key to
`.local/heimdall-client-key.pem` and prints the public JWK Set. Heimdall's operator registers that
set on the `huginn` client and sets its method to `private_key_jwt`; the secret then stops
working. The private key never leaves Huginn's server. Keep it readable only by the API's user
(a drive that ignores Unix permissions, such as NTFS, can't).

Start Heimdall as its README says (`seed-dev`, then `dotnet run --launch-profile https`). The
first visit to `https://acme.localhost:7200` shows a certificate warning; accept it.

## Test

```
cd api && pnpm test          # unit tests
cd api && pnpm run test:e2e  # API end-to-end tests against Postgres (see api/test/README.md)
cd web && pnpm test          # component tests (Vitest)
```
