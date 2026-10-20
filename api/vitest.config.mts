import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compiles the decorators and their metadata, which Nest's dependency injection needs.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
  resolve: { alias: { src: new URL('./src', import.meta.url).pathname } },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
