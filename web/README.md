# Huginn web

The Angular 22 app. See the [repository README](../README.md) for running the whole stack.

- `npm start`: dev server on http://localhost:4200, proxying `/api` to `API_URL` (default
  `http://localhost:3000`).
- `npm run build`: production build into `dist/huginn/browser`.
- `npm test`: component tests with Vitest.

Code layout: `src/app/public` (sign-in and registration), `src/app/private` (the messenger),
`src/app/shared` (avatar, icons, pipes, toasts, username policy) and `src/app/core`.
