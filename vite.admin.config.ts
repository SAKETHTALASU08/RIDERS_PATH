import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const adminRoot = path.resolve(__dirname, 'apps/admin');
export default defineConfig({
  root: adminRoot,
  plugins: [react(), tailwindcss()],
  build: { outDir: path.resolve(__dirname, 'dist/admin'), emptyOutDir: true },
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
