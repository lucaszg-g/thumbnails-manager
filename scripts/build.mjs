import { mkdir, copyFile, rm } from 'node:fs/promises';
// Explicit allowlist: never publish backups, databases, secrets or development tests.
await rm(new URL('../dist', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('../dist/src', import.meta.url), { recursive: true });
await mkdir(new URL('../dist/icons', import.meta.url), { recursive: true });
for (const file of [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/app.js',
  'src/tools.js',
  'src/ui.js',
  'src/workspace.js',
  'src/calendar-settings.js',
  'src/notifications.js',
  'src/price-editor.js',
  'src/workspace.css',
  'src/model.js',
  'src/storage.js',
  'src/sync.js',
  'src/style.css',
])
  await copyFile(
    new URL('../' + file, import.meta.url),
    new URL('../dist/' + file, import.meta.url),
  );
console.log('Build pronto em dist/');
