import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { openDatabase } from './backend/sqlite.js';
import { handleAPI } from './backend/api.js';
const root = process.cwd(),
  database = openDatabase(process.env.THUMBS_DB_PATH || path.join(root, 'data', 'thumbs.sqlite'));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const publicFiles = new Set([
  '/index.html',
  '/manifest.webmanifest',
  '/sw.js',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/src/app.js',
  '/src/tools.js',
  '/src/ui.js',
  '/src/workspace.js',
  '/src/calendar-settings.js',
  '/src/notifications.js',
  '/src/price-editor.js',
  '/src/workspace.css',
  '/src/model.js',
  '/src/storage.js',
  '/src/sync.js',
  '/src/style.css',
]);
const server = http.createServer(async (req, res) => {
  try {
    const origin = 'http://' + req.headers.host;
    const url = new URL(req.url, origin);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      res.writeHead(403).end();
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        ...(!['GET', 'HEAD'].includes(req.method)
          ? { body: Readable.toWeb(req), duplex: 'half' }
          : {}),
      });
      const result = await handleAPI(request, { DB: database, LOCAL: true });
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    if (!publicFiles.has(name)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(await readFile(path.join(root, name)));
  } catch {
    res.writeHead(500).end('Não foi possível atender a solicitação.');
  }
});
server.listen(Number(process.env.PORT) || 3000, '127.0.0.1', () =>
  console.log('Thumbs Studio + SQLite: http://localhost:' + (process.env.PORT || 3000)),
);
process.on('SIGINT', () =>
  server.close(() => {
    database.close();
    process.exit();
  }),
);
