import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

const API = process.env.API_URL ?? 'http://127.0.0.1:8000';

// Dev convenience: forward the backend's generated bank-ops key on /api/ops/* so the
// analyst screens work without pasting it. The browser never sees the key.
function opsKey(): string | undefined {
  if (process.env.OPS_API_KEY) return process.env.OPS_API_KEY;
  try {
    return fs.readFileSync(path.resolve(__dirname, '../backend/data/ops_api_key.txt'), 'utf8').trim();
  } catch {
    return undefined;
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (req, r) => {
            const key = opsKey();
            if (key && r.url?.startsWith('/api/ops') && !req.getHeader('x-ops-key')) req.setHeader('X-Ops-Key', key);
          });
        },
      },
    },
  },
});
