import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard } from './lib/model.js';
import { buildDossier } from './vendor/makefun-board.ts';

function validateBoard(rows, snapshot) {
  if (!Array.isArray(rows) || rows.length < 100) throw new Error(`board validation failed: expected at least 100 rows, got ${Array.isArray(rows) ? rows.length : 'not an array'}`);
  const seenSlugs = new Set();
  const seenRanks = new Set();
  let previousValue = Infinity;
  for (const row of rows) {
    if (typeof row.slug !== 'string' || !row.slug) throw new Error(`board validation failed: row ${row.rank} has no slug`);
    if (seenSlugs.has(row.slug)) throw new Error(`board validation failed: duplicate slug ${row.slug}`);
    seenSlugs.add(row.slug);
    if (!Number.isInteger(row.rank) || row.rank < 1 || row.rank > rows.length) throw new Error(`board validation failed: bad rank ${row.rank} for slug ${row.slug}`);
    if (seenRanks.has(row.rank)) throw new Error(`board validation failed: duplicate rank ${row.rank}`);
    seenRanks.add(row.rank);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) throw new Error(`board validation failed: implied_value_usd for ${row.slug} must be a positive whole number, got ${row.implied_value_usd}`);
    if (row.implied_value_usd > previousValue) throw new Error(`board validation failed: implied_value_usd rises with rank at ${row.slug} (${row.implied_value_usd} after ${previousValue})`);
    previousValue = row.implied_value_usd;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) throw new Error(`board validation failed: farm_steps for ${row.slug} must have 3-12 entries, got ${Array.isArray(row.farm_steps) ? row.farm_steps.length : 'not an array'}`);
    for (const step of row.farm_steps) {
      const trimmed = typeof step === 'string' ? step.trim() : '';
      if (trimmed.length < 20 || trimmed.length > 600) throw new Error(`board validation failed: farm step for ${row.slug} must be 20-600 chars trimmed, got ${trimmed.length}`);
    }
  }
  for (let rank = 1; rank <= rows.length; rank++) {
    if (!seenRanks.has(rank)) throw new Error(`board validation failed: missing rank ${rank}`);
  }
  const watchlist = Array.isArray(snapshot.watchlist) ? snapshot.watchlist : [];
  for (const slug of watchlist) {
    if (!seenSlugs.has(slug)) throw new Error(`board validation failed: watchlist slug ${slug} is missing from the board`);
  }
}

function summarizeBoard(rows, snapshot) {
  const values = rows.map(row => row.implied_value_usd).sort((a, b) => a - b);
  const totalImpliedValueUsd = values.reduce((sum, value) => sum + value, 0);
  const middle = Math.floor(values.length / 2);
  const medianImpliedValueUsd = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  const categoryCounts = new Map();
  for (const row of rows) {
    const category = row.category || 'Other';
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }
  const topCategories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([category, count]) => ({ category, count }));
  const rowSlugs = new Set(rows.map(row => row.slug));
  const watchlistCovered = (Array.isArray(snapshot.watchlist) ? snapshot.watchlist : []).filter(slug => rowSlugs.has(slug)).length;
  const preTokenCount = rows.filter(row => row.token_status === 'records no token').length;
  return { rowCount: rows.length, watchlistCovered, totalImpliedValueUsd, medianImpliedValueUsd, topCategories, preTokenCount, generatedAt: new Date().toISOString() };
}

const root = fileURLToPath(new URL('.', import.meta.url));
const inputFlag = process.argv.indexOf('--input');
const input = inputFlag >= 0 ? process.argv[inputFlag + 1] : '/input/snapshot.json';
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';
if (!input || !existsSync(input)) throw new Error(`snapshot not found: ${input}`);
const snapshot = JSON.parse(readFileSync(input, 'utf8'));
const rows = buildBoard(snapshot);
validateBoard(rows, snapshot);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), JSON.stringify({ rows }) + '\n');
const summary = summarizeBoard(rows, snapshot);
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`Board summary: ${summary.rowCount} rows, ${summary.watchlistCovered} of ${snapshot.watchlist.length} watchlist protocols covered, total implied value $${summary.totalImpliedValueUsd.toLocaleString()}.`);
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
console.log(`Validation passed for ${rows.length} rows; summary written to summary.json.`);
