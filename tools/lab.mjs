// Headless lab: load the data + DOM-free engine pieces into a vm for quick inspection.
//   node tools/lab.mjs <play-id> [coverage]   → prints the defense for that play
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
export function load() {
  const ctx = { console, location: { search: '' } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['renderer/geometry.js', 'layout/coordinates.js', 'renderer/primitives.js', 'renderer/relationships.js',
    'data/vocabulary.js', 'data/resolve.js', 'data/concepts.js', 'defense/align.js']) {
    vm.runInContext(read(`src/${f}`), ctx, { filename: f });
  }
  const FD = ctx.FD;
  const manifest = JSON.parse(read('src/data/manifest.json'));
  const formations = {};
  for (const f of manifest.formations) { const j = JSON.parse(read(`src/data/${f}`)); formations[j.id] = j; }
  const plays = [];
  for (const c of manifest.concepts || []) plays.push(...FD.Concepts.expand(JSON.parse(read(`src/data/${c}`)), formations).plays);
  for (const p of manifest.plays) plays.push(JSON.parse(read(`src/data/${p}`)));
  const resolved = plays.map((raw) => FD.Resolve.resolve(raw, formations).play);
  return { FD, plays: resolved, formations };
}

if (process.argv[2]) {
  const { FD, plays } = load();
  const play = plays.find((p) => p.id === process.argv[2]);
  const look = process.argv[3] ? { coverage: process.argv[3] } : play.defense;
  const D = FD.Defense.build(play, look, 0);
  for (const d of D.defenders) console.log(d.id.padEnd(7), d.glyph, JSON.stringify(d.at), d.job || '', d.man ? `man ${d.man}` : '', d.drop ? `drop ${JSON.stringify(d.drop)}` : '', d.rushPath ? 'rush' : '');
}
