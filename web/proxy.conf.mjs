// Dev-server proxy. API_URL lets the same config work locally and inside docker compose.
// The socket goes through it too, so the app, the API and the socket share one origin and the
// session cookie reaches all of them (see docs/huginn/architecture.md §2.3).
const target = process.env.API_URL ?? 'http://localhost:3000';

export default {
  '/api': { target, secure: false, changeOrigin: true },
  '/socket.io': { target, secure: false, changeOrigin: true, ws: true },
};
