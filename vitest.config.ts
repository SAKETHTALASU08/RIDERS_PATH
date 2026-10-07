import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Test-only key. Production and local runtime configuration must provide their own secret.
process.env.OTP_HMAC_SECRET ??= 'riders-path-vitest-only-hmac-secret-32-bytes-minimum';
// Keep integration suites from mutating a developer's local application database.
process.env.DATABASE_PATH = path.resolve(__dirname, './data/riders_path.test.db');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Backend integration suites share the same SQLite connection and must not race each other.
    fileParallelism: false,
  },
});
