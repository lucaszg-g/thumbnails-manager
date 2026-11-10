import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
await mkdir(new URL('../data', import.meta.url), { recursive: true });
const file = new URL('../data/access-key.txt', import.meta.url);
let key;
try {
  key = (await readFile(file, 'utf8')).trim();
} catch {
  key = randomBytes(32).toString('base64url');
  await writeFile(file, key + '\n', { mode: 0o600 });
}
if (key.length < 32) throw Error('Chave local inválida. Não foi alterada.');
await writeFile(
  new URL('../data/cloudflare-secrets.json', import.meta.url),
  JSON.stringify({ ACCESS_KEY: key }),
  { mode: 0o600 },
);
console.log('Chave privada preparada em data/access-key.txt (ignorada pelo Git).');
