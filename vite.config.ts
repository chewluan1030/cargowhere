import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'api-serverless-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url) return next();
            const [pathname] = req.url.split('?');

            if (pathname === '/api/health') {
              try {
                const { default: handler } = await server.ssrLoadModule('/api/health.ts');
                const parsedRes = {
                  status(code: number) {
                    res.statusCode = code;
                    return parsedRes;
                  },
                  setHeader(name: string, val: string) {
                    res.setHeader(name, val);
                    return parsedRes;
                  },
                  json(data: unknown) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                  },
                };
                return handler(req as any, parsedRes as any);
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: String(err) }));
              }
            }

            if (pathname === '/api/carparkavailability') {
              try {
                const { default: handler } = await server.ssrLoadModule('/api/carparkavailability.ts');
                const parsedRes = {
                  status(code: number) {
                    res.statusCode = code;
                    return parsedRes;
                  },
                  setHeader(name: string, val: string) {
                    res.setHeader(name, val);
                    return parsedRes;
                  },
                  json(data: unknown) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                  },
                };
                return handler(req as any, parsedRes as any);
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: String(err) }));
              }
            }

            next();
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
