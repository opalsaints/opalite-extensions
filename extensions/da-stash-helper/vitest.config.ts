import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@platform': resolve(__dirname, 'src/platform'),
      '@core': resolve(__dirname, 'src/core'),
      '@automation': resolve(__dirname, 'src/automation'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@integration': resolve(__dirname, 'src/integration'),
    },
  },
});
