// Validate every play in the manifest without a browser:
//   node tools/validate.mjs
// Runs the same resolver the wallpaper uses (11 players, personnel, QB/C rule,
// unknown vocabulary, references, display copy). Exit code 1 on any fatal.
// Geometry/relationship warnings need the renderer: open ?debug=1 and read the console.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['renderer/geometry.js', 'renderer/primitives.js', 'renderer/relationships.js', 'data/vocabulary.js', 'data/resolve.js']) {
  vm.runInContext(read(`src/${f}`), ctx, { filename: f });
}
const FD = ctx.FD;
const manifest = JSON.parse(read('src/data/manifest.json'));
const formations = {};
for (const f of manifest.formations) { const j = JSON.parse(read(`src/data/${f}`)); formations[j.id] = j; }

let fatalCount = 0;
const ids = new Set();
const concepts = {};
for (const p of manifest.plays) {
  const raw = JSON.parse(read(`src/data/${p}`));
  const { fatal, warn } = FD.Resolve.resolve(raw, formations);
  if (ids.has(raw.id)) fatal.push('duplicate play id');
  ids.add(raw.id);
  if (!raw.conceptId) warn.push('missing conceptId');
  if (!raw.sources || !raw.sources.length) warn.push('missing sources');
  const fam = raw.family || '?';
  concepts[fam] = (concepts[fam] || 0) + 1;
  fatalCount += fatal.length;
  const mark = fatal.length ? '✗' : warn.length ? '!' : '✓';
  console.log(`${mark} ${raw.id}`);
  for (const m of fatal) console.log(`    FATAL ${m}`);
  for (const m of warn) console.log(`    warn  ${m}`);
}
console.log(`\n${ids.size} plays · ${Object.entries(concepts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
process.exit(fatalCount ? 1 : 0);
