// Variant finder: which formations could each concept be presented on, but isn't yet?
//   node tools/variants.mjs              candidates for every concept
//   node tools/variants.mjs mesh power   only these concepts
//   node tools/variants.mjs --add mesh:gun_bunch_11 ...   append presentations {formation} to concept files
// A candidate = the concept expands on that formation with its default roles/side AND
// the resulting play passes resolve.js validation. That's necessary, not sufficient:
// review each for football sense, then run tools/check.sh (geometry) and look at it.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const text = (p) => readFileSync(new URL(p, root), 'utf8');
const read = (p) => JSON.parse(text(p));
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['renderer/geometry.js', 'renderer/primitives.js', 'renderer/relationships.js', 'data/vocabulary.js', 'data/resolve.js', 'data/concepts.js']) {
  vm.runInContext(text(`src/${f}`), ctx, { filename: f });
}
const FD = ctx.FD;
const manifest = read('src/data/manifest.json');
const formations = Object.fromEntries(manifest.formations.map((f) => { const j = read(`src/data/${f}`); return [j.id, j]; }));
const files = Object.fromEntries((manifest.concepts || []).map((f) => [read(`src/data/${f}`).conceptId, f]));

const args = process.argv.slice(2);
if (args[0] === '--add') {
  for (const pair of args.slice(1)) {
    const [cid, fid] = pair.split(':');
    const f = files[cid];
    if (!f || !formations[fid]) { console.log(`skip ${pair}: unknown concept or formation`); continue; }
    const c = read(`src/data/${f}`);
    if (c.presentations.some((p) => p.formation === fid && !p.id)) { console.log(`skip ${pair}: already presented`); continue; }
    c.presentations.push({ formation: fid });
    writeFileSync(new URL(`src/data/${f}`, root), JSON.stringify(c, null, 1));
    console.log(`added ${cid} × ${fid}`);
  }
  process.exit(0);
}

const only = new Set(args);
let total = 0;
for (const [cid, f] of Object.entries(files)) {
  if (only.size && !only.has(cid)) continue;
  const c = read(`src/data/${f}`);
  const have = new Set(c.presentations.map((p) => p.formation));
  const ok = [];
  for (const fid of Object.keys(formations)) {
    if (have.has(fid)) continue;
    const { plays, errors } = FD.Concepts.expand(Object.assign({}, c, { presentations: [{ formation: fid }] }), formations);
    if (errors.length || !plays.length) continue;
    const { fatal } = FD.Resolve.resolve(plays[0], formations);
    if (!fatal.length) ok.push(`${fid}${plays[0].side === 'left' ? ' (left)' : ''}`);
  }
  total += ok.length;
  console.log(`${cid.padEnd(18)} has ${String(have.size).padStart(2)} · candidates: ${ok.join(', ') || '—'}`);
}
console.log(`\n${total} candidate presentations. Add with: node tools/variants.mjs --add concept:formation ...`);
