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
if (key.length < 6) throw Error('Senha local inválida. Não foi alterada.');
const encryptionFile = new URL('../data/calendar-encryption-key.txt', import.meta.url);
let encryption;
try {
  encryption = (await readFile(encryptionFile, 'utf8')).trim();
} catch {
  encryption = randomBytes(32).toString('base64url');
  await writeFile(encryptionFile, encryption + '\n', { mode: 0o600 });
}
if (Buffer.from(encryption, 'base64url').length !== 32)
  throw Error('Chave de criptografia local inválida.');
let existing = {};
try {
  existing = JSON.parse(
    await readFile(new URL('../data/cloudflare-secrets.json', import.meta.url), 'utf8'),
  );
} catch {}
if (existing.CALENDAR_ENCRYPTION_KEY && existing.CALENDAR_ENCRYPTION_KEY !== encryption)
  throw Error('As chaves de criptografia não correspondem. Nenhum secret foi alterado.');
await writeFile(
  new URL('../data/cloudflare-secrets.json', import.meta.url),
  JSON.stringify({ ...existing, ACCESS_KEY: key, CALENDAR_ENCRYPTION_KEY: encryption }),
  { mode: 0o600 },
);
console.log('Senha e chave de criptografia preparadas em data/ (ignoradas pelo Git).');
