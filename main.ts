import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard } from './lib/model.js';
import { buildDossier } from './vendor/makefun-board.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const inputFlag = process.argv.indexOf('--input');
const input = inputFlag >= 0 ? process.argv[inputFlag + 1] : '/input/snapshot.json';
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';
if (!input || !existsSync(input)) throw new Error(`snapshot not found: ${input}`);
const snapshot = JSON.parse(readFileSync(input, 'utf8'));
const rows = buildBoard(snapshot);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), JSON.stringify({ rows }) + '\n');
writeFileSync(join(out, 'data.js'), `window.RADAR=${JSON.stringify({ as_of: snapshot.as_of, watchlist_size: snapshot.watchlist.length, rows })};\n`);
function copyDir(from, to, include = (_name) => true) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const path = join(from, name);
    if (statSync(path).isFile() && include(name)) copyFileSync(path, join(to, name));
  }
}
copyDir(join(root, 'dashboard'), join(out, 'dashboard'));
copyDir(join(root, 'screenshots'), join(out, 'screenshots'), name => /\.(png|jpe?g)$/i.test(name));
const shots = readdirSync(join(out, 'screenshots')).filter(name => !name.startsWith('.'));
if (shots.length) {
  const dossier = buildDossier(out, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } });
  writeFileSync(join(out, 'dossier.json'), dossier);
} else {
  process.stderr.write('Screenshots are pending session 2; board and dashboard were written, dossier build skipped.\n');
}
console.log(`Built ${rows.length} rows covering ${snapshot.watchlist.length} watchlist protocols.`);
