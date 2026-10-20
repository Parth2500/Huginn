// Dev-server proxy. API_URL lets the same config work locally and inside docker compose.
const target = process.env.API_URL ?? 'http://localhost:3000';

export default {
  '/api': { target, secure: false, changeOrigin: true },
};
