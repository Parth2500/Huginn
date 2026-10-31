# API end-to-end tests

These boot the real API (migrations included) on a random port and talk to it over HTTP and
Socket.IO, against a real PostgreSQL.

- They use their own database, `huginn_test`, which `global-setup.ts` drops and recreates at the
  start of every run. Development data is never touched.
- The default connection is `postgres://huginn:huginn@localhost:35000/huginn_test` (the
  `postgres` service in `docker-compose.yml`). Set `TEST_DATABASE_URL` to use another server.

```
docker compose up -d postgres
pnpm run test:e2e
```
