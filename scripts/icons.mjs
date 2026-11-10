import { Resvg } from '@resvg/resvg-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// SVG is the single source of truth for the favicon and installable app icons.
// The opaque background also supports circular and rounded maskable icons.
const source = await readFile(new URL('../icons/icon.svg', import.meta.url), 'utf8');
await mkdir(new URL('../icons', import.meta.url), { recursive: true });

for (const size of [192, 512]) {
  const icon = new Resvg(source, { fitTo: { mode: 'width', value: size } });
  await writeFile(new URL(`../icons/icon-${size}.png`, import.meta.url), icon.render().asPng());
}

console.log('Ícones de 192 e 512 pixels gerados a partir do SVG.');
