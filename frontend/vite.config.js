import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const frontendDir = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, frontendDir, '');
  const proxy = {
    '/api': {
      target: env.BACKEND_URL || 'http://127.0.0.1:8000',
      changeOrigin: true,
      configure(server) {
        server.on('error', (_error, _request, response) => {
          if (response && !response.headersSent && typeof response.writeHead === 'function') {
            response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
            response.end(
              JSON.stringify({
                detail:
                  'Нет связи с backend. Запустите frontend и API командой npm run dev из корня проекта.',
                code: 'BACKEND_UNAVAILABLE',
              }),
            );
          }
        });
      },
    },
  };
  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, strictPort: true, proxy },
  };
});
