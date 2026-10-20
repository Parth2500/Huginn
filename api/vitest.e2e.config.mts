import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// End-to-end tests run the real app against a real Postgres (see test/README.md).
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    globalSetup: ['./test/global-setup.ts'],
    hookTimeout: 60000,
  },
  resolve: { alias: { src: new URL('./src', import.meta.url).pathname } },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
