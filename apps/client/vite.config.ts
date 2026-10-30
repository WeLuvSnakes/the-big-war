import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const libs = new URL('../../libs/', import.meta.url).pathname;

export default defineConfig({
  plugins: [
    solid(),
    {
      name: 'serve-public-index',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const request = req as { url?: string };
          if (request.url === '/' || request.url === '/index.html') {
            request.url = '/public/index.html';
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: [
      { find: /^@the-big-war\/game-engine\//, replacement: `${libs}game-engine/src/` },
      { find: /^@the-big-war\/frontend\//, replacement: `${libs}frontend/src/` },
    ],
  },
  worker: { format: 'es' },
  css: {
    transformer: 'lightningcss',
  },
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    cssMinify: 'lightningcss',
    rollupOptions: {
      input: 'public/index.html',
    },
  },
});
