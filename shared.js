/* trefx shared game code (generated from src/) */
(function(){
"use strict";
var defs = {}, cache = {};
var alias = {"../rng":"rng","./rng":"rng","../art/creature":"creature","./map":"map","./items":"items","../world/items":"items","./world/items":"items","./names":"names"};
function req(n){ n = alias[n] || String(n).replace(/^\.\.?\//, "").replace(/\.js$/, ""); if (cache[n]) return cache[n].exports; var m = { exports: {} }; cache[n] = m; if (!defs[n]) throw new Error("no module " + n); defs[n](m, m.exports, req); return m.exports; }
defs["rng"] = function (module, exports, require) {
'use strict';
// Deterministic randomness. mulberry32 seeded from a string hash. Shared with the browser via the bundle.

function hashString(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(a) {
  let t = a >>> 0;
  return function next() {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFromString(seed) {
  const next = mulberry32(hashString(seed));
  const api = {
    next,
    float(a = 0, b = 1) { return a + (b - a) * next(); },
    int(a, b) { return a + Math.floor(next() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    chance(p) { return next() < p; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    },
    fork(label) { return rngFromString(seed + ':' + label); },
  };
  return api;
}

// small 2d value noise, deterministic per seed
function noise2d(seed) {
  const base = hashString(seed);
  const lattice = (x, y) => {
    let h = (base ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  return function sample(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = lattice(x0, y0), b = lattice(x0 + 1, y0), c = lattice(x0, y0 + 1), d = lattice(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}

module.exports = { hashString, mulberry32, rngFromString, noise2d };

};
defs["creature"] = function (module, exports, require) {
'use strict';
// Procedural pixel creatures. Pure code, no assets. Works in node (@napi-rs/canvas ctx) and in the browser
// (same file shipped through src/bundle.js). A seed gives a creature def; a def + stage + animation gives a
// pixel grid (Uint8Array of palette indices); the grid is painted with fillRect at any scale.
//
// Palette indices: 0 transparent, 1..4 palette colors (main, light, accent, dark), 5 outline,
// 6 eye white, 7 pupil, 8 gold (accessories), 9 flash white (hurt).
const { rngFromString, hashString } = require('../rng');

const STAGE_SIZES = { 1: 24, 2: 32, 3: 40, boss: 64 };
const BODY_TYPES = ['blob', 'quadruped', 'biped', 'serpent', 'bird', 'mushroom'];

// 12 species: body type, base hue, stat bias (atk/def/spd), one-line vibe for cards.
const SPECIES = [
  { name: 'mossling', body: 'blob', hue: 112, sat: 0.5, bias: { atk: 0, def: 2, spd: -1 }, vibe: 'a damp little moss thing. very soft.' },
  { name: 'embercub', body: 'quadruped', hue: 18, sat: 0.8, bias: { atk: 2, def: 0, spd: 0 }, vibe: 'warm to the touch. do not leave near paper.' },
  { name: 'tidepup', body: 'quadruped', hue: 202, sat: 0.65, bias: { atk: 0, def: 1, spd: 1 }, vibe: 'smells like the sea. always a bit wet.' },
  { name: 'boneling', body: 'biped', hue: 42, sat: 0.18, bias: { atk: 1, def: 1, spd: 0 }, vibe: 'mostly bone. surprisingly polite about it.' },
  { name: 'glimmerfly', body: 'bird', hue: 292, sat: 0.7, bias: { atk: 1, def: -1, spd: 2 }, vibe: 'glows faintly in the dark. knows it.' },
  { name: 'rootwalker', body: 'biped', hue: 88, sat: 0.45, bias: { atk: 0, def: 2, spd: -1 }, vibe: 'part tree. moves when nobody is looking.' },
  { name: 'frostkit', body: 'quadruped', hue: 190, sat: 0.4, bias: { atk: 0, def: 0, spd: 2 }, vibe: 'cold nose, colder heart, fast feet.' },
  { name: 'voidtad', body: 'serpent', hue: 262, sat: 0.6, bias: { atk: 2, def: -1, spd: 1 }, vibe: 'came from the void. eats light, occasionally.' },
  { name: 'capling', body: 'mushroom', hue: 4, sat: 0.7, bias: { atk: -1, def: 3, spd: 0 }, vibe: 'a mushroom with opinions.' },
  { name: 'sparkbat', body: 'bird', hue: 52, sat: 0.85, bias: { atk: 2, def: 0, spd: 1 }, vibe: 'static in a small package. sheds sparks.' },
  { name: 'silthound', body: 'quadruped', hue: 30, sat: 0.35, bias: { atk: 1, def: 1, spd: 1 }, vibe: 'made of river mud. loyal like it.' },
  { name: 'dustmite', body: 'blob', hue: 38, sat: 0.4, bias: { atk: 0, def: 1, spd: 1 }, vibe: 'lives under things. very cozy under things.' },
];

const EYE_STYLES = ['dot', 'round', 'sleepy', 'angry', 'wide', 'happy'];
const HEAD_PARTS = ['none', 'catears', 'roundears', 'horns', 'antennae', 'unihorn', 'longears', 'fins'];
const TAIL_PARTS = ['none', 'stub', 'curl', 'fluffy', 'spikes', 'fin'];
const MARKINGS = ['stripes', 'spots', 'belly', 'mask'];
const ACCESSORIES = ['crown', 'scarf', 'visor', 'halo'];

const OUT = 5, EYEW = 6, PUPIL = 7, GOLD = 8, FLASH = 9;

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + hex(r) + hex(g) + hex(b);
}

function makePalette(rng, sp, boss) {
  const h = sp.hue + rng.int(-14, 14);
  const s = sp.sat + rng.float(-0.08, 0.08);
  const shift = rng.pick([28, -24, 40, 150, 180, 200]);
  const l = boss ? 0.36 : 0.48;
  return {
    palette: [hsl(h, s, l), hsl(h + 8, s * 0.9, l + 0.22), hsl(h + shift, Math.min(0.95, s + 0.2), boss ? 0.6 : 0.56), hsl(h - 6, s, l - 0.16)],
    outline: hsl(h, Math.min(0.8, s + 0.1), boss ? 0.08 : 0.12),
    hue: h,
  };
}

function generate(seed, opts = {}) {
  const rng = rngFromString('creature:' + seed);
  const sp = opts.species ? SPECIES.find((s) => s.name === opts.species) || rng.pick(SPECIES) : rng.pick(SPECIES);
  const pal = makePalette(rng.fork('pal'), sp, !!opts.boss);
  const parts = {
    eyes: rng.int(0, EYE_STYLES.length - 1),
    head: rng.int(0, HEAD_PARTS.length - 1),
    tail: rng.int(0, TAIL_PARTS.length - 1),
    marking: rng.int(0, MARKINGS.length - 1),
    accessory: rng.int(0, ACCESSORIES.length - 1),
    mouth: rng.int(0, 2),
  };
  if (sp.body === 'mushroom' && parts.head === 3) parts.head = 1;
  return { seed: String(seed), species: sp.name, bodyType: sp.body, parts, palette: pal.palette, outline: pal.outline, hue: pal.hue, bias: sp.bias, boss: !!opts.boss };
}

function colorsFor(def) {
  return [null, def.palette[0], def.palette[1], def.palette[2], def.palette[3], def.outline, '#f6f1e4', '#15120f', '#ffd166', '#ffffff'];
}

function sizeFor(stage) { return STAGE_SIZES[stage] || STAGE_SIZES[1]; }

// ---------- rasterizer ----------
function makeGrid(S) { return { S, g: new Uint8Array(S * S) }; }
function set(G, x, y, c) { if (x >= 0 && y >= 0 && x < G.S && y < G.S) G.g[y * G.S + x] = c; }
function get(G, x, y) { return x >= 0 && y >= 0 && x < G.S && y < G.S ? G.g[y * G.S + x] : 0; }
function ell(G, cx, cy, rx, ry, c) {
  const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(G.S - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(G.S - 1, Math.ceil(cy + ry + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) G.g[y * G.S + x] = c;
  }
}
function ellO(G, cx, cy, rx, ry, c) { ell(G, cx, cy, rx + 0.9, ry + 0.9, OUT); ell(G, cx, cy, rx, ry, c); }
function rect(G, x, y, w, h, c) {
  const x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + w), y1 = Math.round(y + h);
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) set(G, xx, yy, c);
}
function rectO(G, x, y, w, h, c) { rect(G, x - 1, y - 1, w + 2, h + 2, OUT); rect(G, x, y, w, h, c); }
function mirror(G) { const S = G.S; for (let y = 0; y < S; y++) for (let x = 0; x < S / 2; x++) G.g[y * S + (S - 1 - x)] = G.g[y * S + x]; }
// breath frame: rows above the waist move down one pixel (a 1px squash), feet stay on the ground
function squash(G) {
  const S = G.S, row = Math.floor(S * 0.6);
  for (let y = row; y >= 1; y--) for (let x = 0; x < S; x++) G.g[y * S + x] = G.g[(y - 1) * S + x];
  for (let x = 0; x < S; x++) G.g[x] = 0;
}
function edgeOutline(G) {
  const S = G.S, src = G.g.slice();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = src[y * S + x];
    if (!v || v === OUT) continue;
    const t = y === 0 ? 0 : src[(y - 1) * S + x], b = y === S - 1 ? 0 : src[(y + 1) * S + x];
    const l = x === 0 ? 0 : src[y * S + x - 1], r = x === S - 1 ? 0 : src[y * S + x + 1];
    if (!t || !b || !l || !r) G.g[y * S + x] = OUT;
  }
}

// ---------- parts ----------
function drawEyes(G, u, style, cx, ey, dx, angry) {
  const es = Math.max(1, Math.round(u));
  const big = Math.max(2, Math.round(2 * u));
  const lx = Math.round(cx - dx - es / 2), rx = Math.round(cx + dx - es / 2);
  const y = Math.round(ey - es / 2);
  const st = angry ? 'angry' : EYE_STYLES[style];
  for (const x of [lx, rx]) {
    if (st === 'dot') rect(G, x, y, es, es, PUPIL);
    else if (st === 'round') { rect(G, x - Math.floor(u / 2), y - Math.floor(u / 2), big, big, EYEW); rect(G, x, y, es, es, PUPIL); }
    else if (st === 'sleepy') { rect(G, x - Math.floor(u / 2), y, big, es, EYEW); rect(G, x, y, es, Math.max(1, Math.round(es / 2)), PUPIL); rect(G, x - Math.floor(u / 2), y - 1, big, 1, OUT); }
    else if (st === 'angry') { rect(G, x, y, es, es, PUPIL); rect(G, x < cx ? x - 1 : x + es - 1, y - Math.max(1, Math.round(u * 0.7)), es + 1, 1, OUT); rect(G, x < cx ? x : x, y - 1, es, 1, OUT); }
    else if (st === 'wide') { rect(G, x - Math.floor(u / 2), y - Math.floor(u / 2), big + 1, big + 1, EYEW); rect(G, x, y, es, es, PUPIL); rect(G, x + es - 1, y - 1, 1, 1, EYEW); rect(G, x - Math.floor(u / 2) - 1, y - Math.floor(u / 2) - 1, big + 3, 1, OUT); }
    else if (st === 'happy') { rect(G, x, y, es, 1, PUPIL); rect(G, x - 1, y + 1, 1, 1, PUPIL); rect(G, x + es, y + 1, 1, 1, PUPIL); }
  }
}

function drawHeadPart(G, u, kind, cx, top, r, c1, c2, bob) {
  const k = HEAD_PARTS[kind];
  const t = top + bob;
  if (k === 'catears') { for (const s of [-1, 1]) { const bx = cx + s * r * 0.62; for (let i = 0; i < Math.round(3.5 * u); i++) { const w = Math.max(1, Math.round((i + 1) * 0.9)); rectO(G, Math.round(bx - w / 2), Math.round(t - 3.5 * u + i), w, 1, c1); } rect(G, Math.round(bx - 0.5), Math.round(t - 1.5 * u), Math.max(1, Math.round(u)), Math.round(1.5 * u), c2); } }
  else if (k === 'roundears') { for (const s of [-1, 1]) { ellO(G, cx + s * r * 0.8, t + 0.5 * u, 2.2 * u, 2.2 * u, c1); ell(G, cx + s * r * 0.8, t + 0.5 * u, 1.1 * u, 1.1 * u, c2); } }
  else if (k === 'horns') { for (const s of [-1, 1]) { const bx = cx + s * r * 0.6; for (let i = 0; i < Math.round(4 * u); i++) { rectO(G, Math.round(bx + s * i * 0.45 - u / 2), Math.round(t - i), Math.max(1, Math.round(u)), 1, c2); } } }
  else if (k === 'antennae') { for (const s of [-1, 1]) { const bx = cx + s * r * 0.4; rectO(G, Math.round(bx + s * u * 0.5), Math.round(t - 4 * u), Math.max(1, Math.round(u * 0.7)), Math.round(4 * u), c2); ellO(G, bx + s * u * 0.8, t - 4.2 * u, 1.2 * u, 1.2 * u, c1); } }
  else if (k === 'unihorn') { for (let i = 0; i < Math.round(4.5 * u); i++) { const w = Math.max(1, Math.round(2.4 * u * (i / (4.5 * u)))); rectO(G, Math.round(cx - w / 2), Math.round(t - 4.5 * u + i), w, 1, GOLD); } }
  else if (k === 'longears') { for (const s of [-1, 1]) { ellO(G, cx + s * r * 0.55, t - 2.5 * u, 1.5 * u, 4.5 * u, c1); ell(G, cx + s * r * 0.55, t - 2.5 * u, 0.6 * u, 3 * u, c2); } }
  else if (k === 'fins') { for (const s of [-1, 1]) { ellO(G, cx + s * (r + 0.6 * u), t + r * 0.9, 2.2 * u, 1.3 * u, c2); } }
}

function drawTail(G, u, kind, cx, baseY, halfW, c1, c2, wag) {
  const k = TAIL_PARTS[kind];
  if (k === 'stub') ellO(G, cx, baseY - 1.5 * u, 2 * u, 1.6 * u, c2);
  else if (k === 'curl') { for (const s of [-1, 1]) { ellO(G, cx + s * (halfW + 1.2 * u) + wag * s, baseY - 3.5 * u, 2.4 * u, 2.4 * u, c1); ell(G, cx + s * (halfW + 1.2 * u) + wag * s, baseY - 3.5 * u, 1 * u, 1 * u, c2); } }
  else if (k === 'fluffy') { for (const s of [-1, 1]) { ellO(G, cx + s * (halfW + 0.8 * u) + wag * s, baseY - 1.8 * u, 2.6 * u, 2.2 * u, c2); ellO(G, cx + s * (halfW + 2.4 * u) + wag * s, baseY - 3.4 * u, 1.8 * u, 1.6 * u, c2); } }
  else if (k === 'spikes') { for (let i = -2; i <= 2; i++) { const bx = cx + i * 2.6 * u; for (let j = 0; j < Math.round(3 * u); j++) { const w = Math.max(1, Math.round(2 * u - j * 0.5)); rectO(G, Math.round(bx - w / 2), Math.round(baseY - 6 * u - (2 - Math.abs(i)) * u + j), w, 1, c2); } } }
  else if (k === 'fin') { for (const s of [-1, 1]) { for (let j = 0; j < Math.round(5 * u); j++) { const w = Math.max(1, Math.round((5 * u - j) * 0.7)); rectO(G, Math.round(cx + s * (halfW - 0.5 * u) + (s < 0 ? -w : 0) + wag * s), Math.round(baseY - 5.5 * u + j), w, 1, c2); } } }
}

function drawMarking(G, u, kind, body, c) {
  const k = MARKINGS[kind];
  const { cx, cy, rx, ry } = body;
  if (k === 'stripes') { for (let i = -1; i <= 1; i++) { const y = cy + i * 2.2 * u; const w = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) * 0.8; rect(G, Math.round(cx - w), Math.round(y), Math.round(w * 2), Math.max(1, Math.round(u * 0.8)), c); } }
  else if (k === 'spots') { const pts = [[-0.45, -0.3], [0.45, -0.3], [-0.2, 0.35], [0.2, 0.35], [0, -0.05]]; for (const [px, py] of pts) ell(G, cx + px * rx, cy + py * ry, 0.9 * u, 0.9 * u, c); }
  else if (k === 'belly') ell(G, cx, cy + ry * 0.35, rx * 0.55, ry * 0.5, 2);
  else if (k === 'mask') rect(G, Math.round(cx - body.mrx), Math.round(body.eyeY - 1.3 * u), Math.round(body.mrx * 2), Math.round(2.6 * u), c);
}

function drawAccessory(G, u, kind, head, bob) {
  const k = ACCESSORIES[kind];
  const t = head.top + bob, cx = head.cx;
  if (k === 'crown') { rectO(G, Math.round(cx - 3 * u), Math.round(t - 2.5 * u), Math.round(6 * u), Math.round(2.5 * u), GOLD); for (const s of [-2, 0, 2]) rectO(G, Math.round(cx + s * u - u / 2), Math.round(t - 4.5 * u), Math.max(1, Math.round(u)), Math.round(2 * u), GOLD); ell(G, cx, t - 1.2 * u, 0.6 * u, 0.6 * u, 3); }
  else if (k === 'scarf') { rectO(G, Math.round(cx - head.r * 0.95), Math.round(head.cy + head.r * 0.75 + bob), Math.round(head.r * 1.9), Math.round(1.8 * u), 3); rectO(G, Math.round(cx + head.r * 0.5), Math.round(head.cy + head.r * 0.75 + 1.8 * u + bob), Math.round(1.5 * u), Math.round(2.5 * u), 3); }
  else if (k === 'visor') { rect(G, Math.round(cx - head.r * 0.95), Math.round(head.eyeY - 1.4 * u), Math.round(head.r * 1.9), Math.round(2.6 * u), 4); rect(G, Math.round(cx - head.r * 0.7), Math.round(head.eyeY - 1 * u), Math.round(head.r * 0.6), Math.max(1, Math.round(0.7 * u)), 2); rect(G, Math.round(cx - head.r * 0.95), Math.round(head.eyeY - 1.4 * u) - 1, Math.round(head.r * 1.9), 1, OUT); }
  else if (k === 'halo') { ell(G, cx, t - 2.6 * u, 4.2 * u, 1.4 * u, GOLD); ell(G, cx, t - 2.6 * u, 3 * u, 0.6 * u, 0); }
}

// ---------- bodies ----------
// each returns head anchor {cx, cy, r, top, eyeY, eyeDx} and body ellipse {cx, cy, rx, ry, mrx, eyeY} for markings
function bodyBlob(G, u, f, walk, bob) {
  const cx = G.S / 2, ground = G.S - 1.5 * u;
  const sq = walk ? (f ? 0.6 : -0.6) : 0;
  const rx = 8 * u + sq * u, ry = 7 * u - Math.abs(sq) * 0.5 * u + (bob ? -0.4 * u : 0);
  const cy = ground - ry - 1.6 * u;
  for (const s of [-1, 1]) ellO(G, cx + s * 4 * u + (walk ? (s < 0 ? (f ? 0 : -u) : (f ? -u : 0)) : 0), ground - 0.6 * u, 2.2 * u, 1.3 * u, 4);
  ellO(G, cx, cy, rx, ry, 1);
  return { head: { cx, cy: cy - 0.5 * u, r: ry, top: cy - ry, eyeY: cy - 1.3 * u, eyeDx: 3.2 * u }, body: { cx, cy: cy + 1 * u, rx, ry: ry - 0.5 * u, mrx: rx * 0.9, eyeY: cy - 1.3 * u } };
}
function bodyQuadruped(G, u, f, walk, bob) {
  const cx = G.S / 2, ground = G.S - 1.5 * u;
  const legH = 4 * u, bw = 8.6 * u, bh = 5.2 * u;
  const bodyCy = ground - legH - bh * 0.55 + bob;
  const legs = [[-6.2, 0], [-2.6, 1], [2.6, 0], [6.2, 1]];
  for (const [lx, phase] of legs) { const lift = walk ? ((phase === f) ? -0.8 * u : 0) : 0; rectO(G, Math.round(cx + lx * u - 1.2 * u), Math.round(bodyCy + bh * 0.4 + lift), Math.round(2.4 * u), Math.round(ground - (bodyCy + bh * 0.4 + lift)), phase ? 4 : 1); }
  ellO(G, cx, bodyCy, bw, bh, 1);
  const hr = 6 * u, hcy = bodyCy - bh * 0.55 - hr * 0.55;
  ellO(G, cx, hcy, hr, hr * 0.92, 1);
  // snout
  ellO(G, cx, hcy + hr * 0.45, 2.6 * u, 1.7 * u, 2);
  rect(G, Math.round(cx - 0.6 * u), Math.round(hcy + hr * 0.15), Math.round(1.2 * u), Math.max(1, Math.round(0.8 * u)), OUT);
  return { head: { cx, cy: hcy, r: hr, top: hcy - hr * 0.92, eyeY: hcy - 0.9 * u, eyeDx: 2.9 * u }, body: { cx, cy: bodyCy + u, rx: bw, ry: bh, mrx: hr * 0.9, eyeY: hcy - 0.9 * u } };
}
function bodyBiped(G, u, f, walk, bob) {
  const cx = G.S / 2, ground = G.S - 1.5 * u;
  const legH = 3.4 * u, brx = 5.2 * u, bry = 5 * u;
  const bcy = ground - legH - bry * 0.7 + bob;
  for (const s of [-1, 1]) { const lift = walk ? ((s < 0) === !!f ? -0.9 * u : 0) : 0; rectO(G, Math.round(cx + s * 2.6 * u - 1.3 * u), Math.round(bcy + bry * 0.4 + lift), Math.round(2.6 * u), Math.round(ground - (bcy + bry * 0.4 + lift)), 4); }
  ellO(G, cx, bcy, brx, bry, 1);
  for (const s of [-1, 1]) { const sw = walk ? ((s < 0) === !!f ? 0.8 * u : -0.8 * u) : 0; ellO(G, cx + s * (brx + 0.9 * u), bcy - 0.4 * u + sw, 1.5 * u, 2.6 * u, 4); }
  const hr = 5.8 * u, hcy = bcy - bry * 0.7 - hr * 0.7;
  ellO(G, cx, hcy, hr, hr * 0.95, 1);
  return { head: { cx, cy: hcy, r: hr, top: hcy - hr * 0.95, eyeY: hcy + 0.2 * u, eyeDx: 2.4 * u }, body: { cx, cy: bcy, rx: brx, ry: bry, mrx: hr * 0.85, eyeY: hcy + 0.2 * u } };
}
function bodySerpent(G, u, f, walk, bob) {
  const cx = G.S / 2, ground = G.S - 1.5 * u;
  const wag = walk ? (f ? 0.8 * u : -0.8 * u) : 0;
  ellO(G, cx, ground - 2.6 * u, 9.2 * u, 2.9 * u, 4);
  ellO(G, cx + wag * 0.5, ground - 5.6 * u, 7.4 * u, 2.7 * u, 1);
  ellO(G, cx - wag * 0.5, ground - 8.4 * u, 5.4 * u, 2.4 * u, 1);
  const hr = 5.6 * u, hcy = ground - 10.6 * u - hr * 0.75 + bob;
  ellO(G, cx, hcy, hr, hr * 0.9, 1);
  ellO(G, cx, hcy + hr * 0.5, 2.6 * u, 1.4 * u, 2);
  return { head: { cx, cy: hcy, r: hr, top: hcy - hr * 0.9, eyeY: hcy - 0.6 * u, eyeDx: 2.6 * u }, body: { cx, cy: ground - 6 * u, rx: 7 * u, ry: 4 * u, mrx: hr * 0.85, eyeY: hcy - 0.6 * u } };
}
function bodyBird(G, u, f, walk, bob) {
  const cx = G.S / 2, ground = G.S - 1.5 * u;
  const br = 6.6 * u, bcy = ground - 3 * u - br + bob;
  for (const s of [-1, 1]) { const lift = walk ? ((s < 0) === !!f ? -0.8 * u : 0) : 0; rectO(G, Math.round(cx + s * 2 * u - 0.8 * u), Math.round(bcy + br * 0.6 + lift), Math.round(1.6 * u), Math.round(ground - (bcy + br * 0.6 + lift)), 3); rect(G, Math.round(cx + s * 2 * u - 1.6 * u), Math.round(ground - u), Math.round(3.2 * u), Math.max(1, Math.round(u)), 3); }
  const flap = walk ? (f ? -1.4 * u : 1 * u) : 0;
  for (const s of [-1, 1]) ellO(G, cx + s * (br + 0.4 * u), bcy + 0.4 * u + flap, 2.6 * u, 4.2 * u, 4);
  ellO(G, cx, bcy, br, br, 1);
  ell(G, cx, bcy + br * 0.35, br * 0.6, br * 0.5, 2);
  // beak
  for (let i = 0; i < Math.round(2.2 * u); i++) { const w = Math.max(1, Math.round(2.6 * u - i * 1.1)); rectO(G, Math.round(cx - w / 2), Math.round(bcy - 0.2 * u + i), w, 1, 3); }
  return { head: { cx, cy: bcy - 1.5 * u, r: br, top: bcy - br, eyeY: bcy - 2.4 * u, eyeDx: 2.4 * u }, body: { cx, cy: bcy + 1.6 * u, rx: br, ry: br, mrx: br * 0.85, eyeY: bcy - 2.4 * u } };
}
function bodyMushroom(G, u, f, walk, bob) {
  const cx = G.S / 2, ground = G.S - 1.5 * u;
  for (const s of [-1, 1]) ellO(G, cx + s * 3 * u + (walk ? (s < 0 ? (f ? 0 : -u) : (f ? -u : 0)) : 0), ground - 0.6 * u, 2.2 * u, 1.3 * u, 4);
  const srx = 4.6 * u, sry = 6.2 * u, scy = ground - 1.8 * u - sry * 0.8;
  ellO(G, cx, scy, srx, sry, 2);
  const crx = 10 * u, cry = 5.2 * u, ccy = scy - sry * 0.8 + bob;
  ellO(G, cx, ccy, crx, cry, 1);
  ell(G, cx, ccy + cry * 0.5, crx * 0.9, 1.2 * u, 4);
  for (const [px, py, r] of [[-0.55, -0.2, 1.3], [0.55, -0.2, 1.3], [0, -0.55, 1.1], [-0.2, 0.25, 0.9], [0.2, 0.25, 0.9]]) ell(G, cx + px * crx, ccy + py * cry, r * u, r * u, 2);
  return { head: { cx, cy: ccy, r: crx * 0.6, top: ccy - cry, eyeY: scy - 0.8 * u, eyeDx: 2.2 * u }, body: { cx, cy: scy + u, rx: srx, ry: sry * 0.6, mrx: srx * 0.9, eyeY: scy - 0.8 * u } };
}
const BODIES = { blob: bodyBlob, quadruped: bodyQuadruped, biped: bodyBiped, serpent: bodySerpent, bird: bodyBird, mushroom: bodyMushroom };

function bossExtras(G, u, def, head, body, bob) {
  const rng = rngFromString('bossx:' + def.seed);
  // spikes along the crown
  const n = 5;
  for (let i = 0; i < n; i++) { const bx = head.cx + (i - (n - 1) / 2) * head.r * 0.45; const h = Math.round((2.5 + (i === 2 ? 1.5 : 0)) * u); for (let j = 0; j < h; j++) { const w = Math.max(1, Math.round((h - j) * 0.5)); rectO(G, Math.round(bx - w / 2), Math.round(head.top + bob - h + j + 0.6 * u), w, 1, 3); } }
  // extra eyes row
  const n2 = rng.int(2, 3);
  for (let i = 0; i < n2; i++) { const dx = (i - (n2 - 1) / 2) * 2.4 * u; rect(G, Math.round(head.cx + dx - u / 2), Math.round(head.eyeY - 2.6 * u), Math.max(1, Math.round(u)), Math.max(1, Math.round(u)), PUPIL); }
  // teeth
  const ty = Math.round(head.eyeY + 2.2 * u);
  rect(G, Math.round(head.cx - 3.2 * u), ty, Math.round(6.4 * u), Math.max(1, Math.round(u * 0.9)), OUT);
  for (let i = -2; i <= 2; i++) rect(G, Math.round(head.cx + i * 1.3 * u - u * 0.35), ty + 1, Math.max(1, Math.round(u * 0.7)), Math.max(1, Math.round(u * 0.8)), EYEW);
  // body spikes
  for (const s of [-1, 1]) for (let j = 0; j < 3; j++) { const bx = body.cx + s * (body.rx - j * 1.5 * u), by = body.cy - body.ry * 0.3 + j * 2.4 * u; ellO(G, bx + s * 1.4 * u, by, 1.6 * u, 0.9 * u, 3); }
}

// grid cache: key -> Uint8Array
const gridCache = new Map();
function pixels(def, stage = 1, anim = 'idle', frame = 0) {
  const key = `${def.seed}|${def.species}|${def.boss ? 'B' : ''}|${stage}|${anim}|${frame}`;
  const hit = gridCache.get(key);
  if (hit) return hit;
  const S = sizeFor(def.boss ? 'boss' : stage);
  const G = makeGrid(S);
  const u = S / 24;
  const f = frame ? 1 : 0;
  const walk = anim === 'walk';
  const bob = 0;
  const wag = walk ? (f ? u : -u) : 0;
  const st = def.boss ? 3 : Number(stage);

  // tail sits behind everything
  const bodyFn = BODIES[def.bodyType] || bodyBlob;
  const probe = bodyFn(makeGrid(S), u, f, walk, bob);
  drawTail(G, u, def.parts.tail, probe.body.cx, probe.body.cy + probe.body.ry, probe.body.rx, 1, 3, wag);
  const { head, body } = bodyFn(G, u, f, walk, bob);
  // head parts behind the head are drawn first then head redrawn? keep simple: parts are drawn on top, they extend upward
  drawHeadPart(G, u, def.parts.head, head.cx, head.top, head.r, 1, 3, 0);
  if (st >= 2 || def.boss) drawMarking(G, u, def.parts.marking, body, 4);
  if (def.boss) bossExtras(G, u, def, head, body, 0);
  drawEyes(G, u, def.parts.eyes, head.cx, head.eyeY, head.eyeDx, anim === 'attack' || def.boss);
  if (def.parts.mouth === 1 && def.bodyType !== 'bird' && def.bodyType !== 'quadruped') rect(G, Math.round(head.cx - u * 0.9), Math.round(head.eyeY + 2 * u), Math.round(u * 1.8), 1, OUT);
  if (def.parts.mouth === 2 && def.bodyType !== 'bird') rect(G, Math.round(head.cx - u * 0.4), Math.round(head.eyeY + 1.6 * u), Math.max(1, Math.round(u * 0.8)), Math.max(1, Math.round(u * 0.8)), OUT);
  if (st >= 3 && !def.boss) drawAccessory(G, u, def.parts.accessory, head, 0);
  edgeOutline(G);
  if (!walk) mirror(G);
  if ((anim === 'idle' || anim === 'walk') && f) squash(G);
  if (anim === 'hurt') for (let i = 0; i < G.g.length; i++) if (G.g[i] && G.g[i] !== OUT) G.g[i] = FLASH;
  gridCache.set(key, G.g);
  return G.g;
}

function spriteHash(def, stage = 1, anim = 'idle', frame = 0) {
  const g = pixels(def, stage, anim, frame);
  let s = '';
  for (let i = 0; i < g.length; i++) s += g[i];
  return hashString(s).toString(16);
}

function isSymmetric(grid) {
  const S = Math.round(Math.sqrt(grid.length));
  for (let y = 0; y < S; y++) for (let x = 0; x < S / 2; x++) if (grid[y * S + x] !== grid[y * S + (S - 1 - x)]) return false;
  return true;
}

// paint a grid onto a 2d context. runs of identical colors are merged per row.
function paintGrid(ctx, grid, colors, x, y, scale, opts = {}) {
  const S = Math.round(Math.sqrt(grid.length));
  const flip = !!opts.flip;
  for (let gy = 0; gy < S; gy++) {
    let gx = 0;
    while (gx < S) {
      const c = grid[gy * S + gx];
      if (!c) { gx++; continue; }
      let run = 1;
      while (gx + run < S && grid[gy * S + gx + run] === c) run++;
      ctx.fillStyle = opts.tint && c !== OUT ? opts.tint : colors[c];
      const px = flip ? x + (S - gx - run) * scale : x + gx * scale;
      ctx.fillRect(px, y + gy * scale, run * scale, scale);
      gx += run;
    }
  }
}

function draw(ctx, def, opts = {}) {
  const { x = 0, y = 0, scale = 1, stage = 1, anim = 'idle', frame = 0 } = opts;
  const grid = pixels(def, stage, anim, frame);
  paintGrid(ctx, grid, colorsFor(def), x, y, scale, opts);
}

// cached offscreen sprites (browser: pass document.createElement('canvas') factory; node: createCanvas)
const spriteCache = new Map();
function sprite(def, opts, createCanvas) {
  const { stage = 1, anim = 'idle', frame = 0, scale = 1 } = opts;
  const key = `${def.seed}|${def.species}|${def.boss ? 'B' : ''}|${stage}|${anim}|${frame}|${scale}`;
  let c = spriteCache.get(key);
  if (c) return c;
  const S = sizeFor(def.boss ? 'boss' : stage);
  c = createCanvas(S * scale, S * scale);
  const ctx = c.getContext('2d');
  draw(ctx, def, { stage, anim, frame, scale });
  spriteCache.set(key, c);
  return c;
}

function speciesInfo(name) { return SPECIES.find((s) => s.name === name) || SPECIES[0]; }

module.exports = {
  SPECIES, BODY_TYPES, STAGE_SIZES, EYE_STYLES, HEAD_PARTS, TAIL_PARTS, MARKINGS, ACCESSORIES,
  generate, pixels, draw, paintGrid, sprite, spriteHash, isSymmetric, colorsFor, sizeFor, speciesInfo, hsl,
};

};
defs["map"] = function (module, exports, require) {
'use strict';
// 96x64 tile world from a fixed seed. Biomes around zone centers, procedural 8px tiles, A* paths from the
// village to every zone (cached). Shared with the browser via src/bundle.js (no canvas import: takes a ctx).
const { noise2d, hashString, rngFromString } = require('../rng');

const W = 96, H = 64, TILE = 8;

const ZONES = {
  village: { x: 48, y: 32, r: 9, label: 'the village', color: '#c9a86a' },
  swamp: { x: 15, y: 50, r: 13, label: 'the swamp', color: '#5f8d4e', baseMs: 30 * 60 * 1000, danger: 1 },
  canopy: { x: 10, y: 27, r: 12, label: 'the canopy', color: '#3f8f5a', baseMs: 60 * 60 * 1000, danger: 2 },
  ruins: { x: 85, y: 35, r: 12, label: 'the ruins', color: '#c8b070', baseMs: 2 * 60 * 60 * 1000, danger: 3 },
  glacier: { x: 48, y: 7, r: 12, label: 'the glacier', color: '#a8d8e8', baseMs: 3 * 60 * 60 * 1000, danger: 4 },
  volcano: { x: 82, y: 10, r: 13, label: 'the volcano', color: '#ff7a45', baseMs: 4 * 60 * 60 * 1000, danger: 5 },
  void: { x: 48, y: 57, r: 10, label: 'the void', color: '#8a5cff', baseMs: 6 * 60 * 60 * 1000, danger: 6 },
};
const ZONE_NAMES = ['swamp', 'canopy', 'ruins', 'glacier', 'volcano', 'void'];

// tile codes
const T = {
  GRASS: 'g', TREES: 't', WATER: 'w', SAND: 's', ROCK: 'r', LAVA: 'l', SNOW: 'n', ICE: 'i', VOID: 'v', VOIDGROUND: 'o',
  MARSH: 'm', ASH: 'a', DIRT: 'd', HUT: 'h', PILLAR: 'u', FLOWERS: 'f',
};
const WALKABLE = new Set([T.GRASS, T.SAND, T.ROCK, T.SNOW, T.ICE, T.VOIDGROUND, T.MARSH, T.ASH, T.DIRT, T.FLOWERS]);
const COST = { d: 1, g: 1.6, f: 1.6, s: 1.8, m: 2.2, n: 2, i: 2.4, r: 2.4, a: 2, o: 2.2 };

const worldCache = new Map();

function generate(seed = 'trefx') {
  if (worldCache.has(seed)) return worldCache.get(seed);
  const n1 = noise2d(seed + ':a'), n2 = noise2d(seed + ':b'), n3 = noise2d(seed + ':c');
  const tiles = new Array(W * H).fill(T.GRASS);
  const biome = new Array(W * H).fill('meadow');
  const idx = (x, y) => y * W + x;

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // warped distance to each zone center
    let best = 'meadow', bestD = Infinity;
    for (const [name, z] of Object.entries(ZONES)) {
      const warp = (n1(x / 9 + 3, y / 9 + 7) - 0.5) * 10;
      const d = Math.hypot(x - z.x, (y - z.y) * 1.25) + warp;
      if (d < z.r && d < bestD) { best = name; bestD = d; }
    }
    biome[idx(x, y)] = best;
    const a = n2(x / 5.5, y / 5.5), b = n3(x / 3, y / 3);
    let t = T.GRASS;
    if (best === 'meadow') {
      if (a > 0.66) t = T.TREES;
      else if (a < 0.19) t = T.WATER;
      else if (a < 0.24) t = T.SAND;
      else if (b > 0.78) t = T.FLOWERS;
    } else if (best === 'village') {
      t = b > 0.8 ? T.FLOWERS : T.GRASS;
    } else if (best === 'swamp') {
      t = a < 0.42 ? T.WATER : a > 0.72 ? T.TREES : T.MARSH;
    } else if (best === 'canopy') {
      t = a > 0.36 ? T.TREES : b > 0.6 ? T.FLOWERS : T.GRASS;
    } else if (best === 'ruins') {
      t = a > 0.7 ? T.PILLAR : a < 0.3 ? T.GRASS : T.SAND;
    } else if (best === 'glacier') {
      t = a < 0.34 ? T.ICE : a > 0.76 ? T.ROCK : T.SNOW;
    } else if (best === 'volcano') {
      t = a < 0.33 ? T.LAVA : a > 0.7 ? T.ROCK : T.ASH;
    } else if (best === 'void') {
      t = a < 0.45 ? T.VOID : T.VOIDGROUND;
    }
    // ocean rim
    const edge = Math.min(x, W - 1 - x, y, H - 1 - y);
    if (edge < 1 + n1(x / 4, y / 4) * 2.2 && best !== 'void') t = edge < 1 ? T.WATER : (t === T.WATER ? T.WATER : T.SAND);
    if (y >= H - 2 && best === 'void') t = T.VOID;
    tiles[idx(x, y)] = t;
  }
  // village plaza + huts
  const v = ZONES.village;
  for (let y = v.y - 3; y <= v.y + 3; y++) for (let x = v.x - 4; x <= v.x + 4; x++) if (Math.hypot(x - v.x, (y - v.y) * 1.3) < 4.2) tiles[idx(x, y)] = T.DIRT;
  for (const [dx, dy] of [[-6, -4], [6, -4], [-7, 2], [7, 2], [0, -6], [-3, 5], [4, 5]]) tiles[idx(v.x + dx, v.y + dy)] = T.HUT;
  // roads from the village to each zone (guarantees reachability)
  const roads = {};
  for (const name of ZONE_NAMES) {
    const z = ZONES[name];
    const rr = rngFromString(seed + ':road:' + name);
    const pts = [];
    let cx = v.x, cy = v.y;
    const steps = Math.ceil(Math.hypot(z.x - v.x, z.y - v.y) * 1.2);
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const wob = Math.sin(f * Math.PI * 2 + rr.float(0, 0.4)) * 3 * (n1(f * 7 + hashString(name) % 10, 2) - 0.5) * 2;
      const tx = v.x + (z.x - v.x) * f + wob * (z.y - v.y) / Math.max(1, Math.hypot(z.x - v.x, z.y - v.y));
      const ty = v.y + (z.y - v.y) * f - wob * (z.x - v.x) / Math.max(1, Math.hypot(z.x - v.x, z.y - v.y));
      cx = Math.max(1, Math.min(W - 2, Math.round(tx))); cy = Math.max(1, Math.min(H - 2, Math.round(ty)));
      pts.push([cx, cy]);
    }
    // connect consecutive points with a 4-connected line so the road has no diagonal gaps
    let px = pts[0][0], py = pts[0][1];
    const carve = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const cur = tiles[idx(x, y)]; if (cur !== T.HUT) tiles[idx(x, y)] = T.DIRT; };
    carve(px, py);
    for (const [x, y] of pts) {
      while (px !== x || py !== y) { if (px !== x) px += Math.sign(x - px); else py += Math.sign(y - py); carve(px, py); }
    }
    // zone landing: a small walkable clearing at the target
    for (let y = z.y - 1; y <= z.y + 1; y++) for (let x = z.x - 1; x <= z.x + 1; x++) if (!WALKABLE.has(tiles[idx(x, y)]) || tiles[idx(x, y)] === T.HUT) tiles[idx(x, y)] = name === 'void' ? T.VOIDGROUND : name === 'glacier' ? T.SNOW : name === 'volcano' ? T.ASH : name === 'ruins' ? T.SAND : name === 'swamp' ? T.MARSH : T.GRASS;
    roads[name] = pts;
  }
  const world = { seed, w: W, h: H, tiles, biome, zones: ZONES, roads, paths: {} };
  worldCache.set(seed, world);
  return world;
}

function tileAt(world, x, y) { return x < 0 || y < 0 || x >= W || y >= H ? T.WATER : world.tiles[y * W + x]; }
function walkable(world, x, y) { return WALKABLE.has(tileAt(world, x, y)); }

// A* with 8 neighbours (no corner cutting); roads are cheap so creatures follow them
function astar(world, sx, sy, tx, ty) {
  const key = (x, y) => y * W + x;
  const open = new Map();
  const g = new Float64Array(W * H).fill(Infinity);
  const from = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const h = (x, y) => Math.hypot(x - tx, y - ty);
  g[key(sx, sy)] = 0;
  open.set(key(sx, sy), h(sx, sy));
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (open.size) {
    let bestK = -1, bestF = Infinity;
    for (const [k, f] of open) if (f < bestF) { bestF = f; bestK = k; }
    open.delete(bestK);
    const cx = bestK % W, cy = Math.floor(bestK / W);
    if (cx === tx && cy === ty) {
      const path = [];
      let k = bestK;
      while (k !== -1) { path.push({ x: k % W, y: Math.floor(k / W) }); k = from[k]; }
      return path.reverse();
    }
    closed[bestK] = 1;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!walkable(world, nx, ny)) continue;
      if (dx && dy && (!walkable(world, cx + dx, cy) || !walkable(world, cx, cy + dy))) continue;
      const nk = key(nx, ny);
      if (closed[nk]) continue;
      const step = (COST[tileAt(world, nx, ny)] || 2) * (dx && dy ? 1.414 : 1);
      const ng = g[bestK] + step;
      if (ng < g[nk]) { g[nk] = ng; from[nk] = bestK; open.set(nk, ng + h(nx, ny)); }
    }
  }
  return null;
}

function pathTo(world, zone) {
  if (world.paths[zone]) return world.paths[zone];
  const z = ZONES[zone];
  if (!z) return null;
  const p = astar(world, ZONES.village.x, ZONES.village.y, z.x, z.y);
  world.paths[zone] = p;
  return p;
}

// ---------- drawing ----------
const C = {
  grass: ['#3a6a33', '#437a3a', '#2f5a2a'], trees: ['#244d27', '#1c3b1f', '#5c9a4a'], water: ['#1d4560', '#25587a', '#3a7aa0'],
  sand: ['#c9b274', '#d8c48a', '#b39a5e'], rock: ['#6a6e66', '#7d8178', '#4f534b'], lava: ['#ff7a45', '#ffb347', '#5a1e14'],
  snow: ['#e3ecf0', '#f4f8fa', '#c5d6de'], ice: ['#9fd3e6', '#c6eaf5', '#7cbad0'], void: ['#08050f', '#1a0f2e', '#8a5cff'],
  voidground: ['#241a35', '#2e2244', '#4a3a6a'], marsh: ['#31512f', '#3d6039', '#243d23'], ash: ['#3b3338', '#4a4047', '#ff7a45'],
  dirt: ['#7a5a3a', '#8a6a48', '#5c4229'], hut: ['#7a5a3a', '#d8c090', '#8a3f2a'], pillar: ['#c9b274', '#9fa39a', '#6a6e66'], flowers: ['#3a6a33', '#e86b8a', '#f0d35c'],
};
const NAME = { g: 'grass', t: 'trees', w: 'water', s: 'sand', r: 'rock', l: 'lava', n: 'snow', i: 'ice', v: 'void', o: 'voidground', m: 'marsh', a: 'ash', d: 'dirt', h: 'hut', u: 'pillar', f: 'flowers' };

function h2(x, y, s) { return hashString(`${x},${y},${s}`) / 4294967296; }

// draw one tile at pixel (px, py) with size s (multiple of 8 looks best)
function drawTile(ctx, code, x, y, px, py, s) {
  const pal = C[NAME[code]] || C.grass;
  const u = s / 8;
  const P = (ox, oy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(px + ox * u, py + oy * u, w * u, h * u); };
  P(0, 0, 8, 8, pal[0]);
  const r1 = h2(x, y, 1), r2 = h2(x, y, 2), r3 = h2(x, y, 3);
  switch (code) {
    case 'g': case 'm': case 'f': case 'a': case 'o': case 's': case 'n': case 'd':
      P(Math.floor(r1 * 6), Math.floor(r2 * 6), 2, 1, pal[1]);
      P(Math.floor(r3 * 7), Math.floor(r1 * 7), 1, 1, pal[2]);
      if (code === 'f') { P(Math.floor(r2 * 6) + 1, Math.floor(r3 * 6), 1, 1, r1 > 0.5 ? pal[1] : pal[2]); P(Math.floor(r1 * 5), Math.floor(r2 * 5) + 2, 1, 1, pal[2]); }
      if (code === 'a' && r2 > 0.8) P(Math.floor(r1 * 7), Math.floor(r3 * 7), 1, 1, pal[2]);
      if (code === 'o' && r2 > 0.7) P(Math.floor(r1 * 7), Math.floor(r3 * 7), 1, 1, '#8a5cff');
      if (code === 'm' && r1 > 0.7) P(Math.floor(r2 * 5), Math.floor(r3 * 5) + 2, 3, 1, '#1d4560');
      if (code === 'n' && r1 > 0.6) P(Math.floor(r2 * 7), Math.floor(r3 * 7), 1, 1, '#ffffff');
      break;
    case 't':
      P(0, 0, 8, 8, C.grass[0]);
      P(1, 1, 6, 6, pal[0]); P(2, 0, 4, 1, pal[0]); P(0, 2, 1, 4, pal[0]); P(7, 2, 1, 4, pal[0]);
      P(2, 2, 3, 2, pal[2]); P(3, 5, 2, 2, pal[1]); P(5, 4, 2, 2, pal[1]);
      P(3, 7, 2, 1, '#3b2a1c');
      break;
    case 'w': case 'i':
      P(Math.floor(r1 * 5), Math.floor(r2 * 3) + 1, 3, 1, pal[1]);
      P(Math.floor(r3 * 5), Math.floor(r1 * 3) + 4, 2, 1, pal[2]);
      break;
    case 'r':
      P(1, 2, 6, 5, pal[1]); P(2, 1, 4, 1, pal[1]); P(3, 3, 2, 1, pal[2]); P(1 + Math.floor(r1 * 3), 5, 3, 1, pal[2]);
      break;
    case 'l':
      P(0, 0, 8, 8, pal[2]); P(1, 1, 6, 6, pal[0]); P(2 + Math.floor(r1 * 2), 2 + Math.floor(r2 * 2), 3, 2, pal[1]); P(1, 5, 2, 1, pal[1]);
      break;
    case 'v':
      if (r1 > 0.86) P(Math.floor(r2 * 8), Math.floor(r3 * 8), 1, 1, r2 > 0.5 ? pal[2] : '#e2d8ff');
      if (r3 > 0.75) P(Math.floor(r1 * 6), Math.floor(r2 * 6), 2, 2, pal[1]);
      break;
    case 'h':
      P(1, 3, 6, 5, pal[1]); P(0, 3, 8, 1, pal[2]); P(1, 2, 6, 1, pal[2]); P(2, 1, 4, 1, pal[2]); P(3, 0, 2, 1, pal[2]);
      P(3, 5, 2, 3, '#3b2a1c'); P(5, 5, 1, 1, '#ffd166');
      break;
    case 'u':
      P(Math.floor(r1 * 3), Math.floor(r2 * 4), 2, 1, pal[0]);
      P(2, 1, 4, 7, pal[1]); P(1, 0, 6, 1, pal[2]); P(2, 3, 1, 4, pal[2]); P(5, 2, 1, 2, pal[2]);
      break;
    default: break;
  }
}

// draw a rectangle of tiles (tile coords) at pixel (dx, dy) with tile size s
function drawRegion(ctx, world, x0, y0, w, h, s, dx = 0, dy = 0) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tx = x0 + x, ty = y0 + y;
    const code = tileAt(world, tx, ty);
    drawTile(ctx, code, tx, ty, dx + x * s, dy + y * s, s);
  }
}
function drawMap(ctx, world, s = TILE) { drawRegion(ctx, world, 0, 0, W, H, s, 0, 0); }

function mapHash(world) { return hashString(world.tiles.join('')).toString(16); }

// deterministic idle spot in the village for a creature
function homeSpot(world, seed) {
  const r = rngFromString('home:' + seed);
  const v = ZONES.village;
  for (let i = 0; i < 40; i++) {
    const x = v.x + r.int(-7, 7), y = v.y + r.int(-5, 5);
    if (walkable(world, x, y) && tileAt(world, x, y) !== T.HUT) return { x, y };
  }
  return { x: v.x, y: v.y };
}

module.exports = { W, H, TILE, T, ZONES, ZONE_NAMES, WALKABLE, generate, tileAt, walkable, astar, pathTo, drawTile, drawRegion, drawMap, mapHash, homeSpot };

};
defs["items"] = function (module, exports, require) {
'use strict';
// Items: seeded rarity, zone-flavored names. Used for evolution and sold for gold.
const RARITIES = ['common', 'rare', 'epic', 'mythic'];
const RARITY_P = { common: 0.70, rare: 0.22, epic: 0.07, mythic: 0.01 };
const RARITY_COLOR = { common: '#9aa39c', rare: '#5ba8ff', epic: '#b06bff', mythic: '#ffd166' };
const VALUE = { common: 5, rare: 30, epic: 140, mythic: 900 };

const ZONE_ITEMS = {
  swamp: { common: ['bog pearl', 'wet stick', 'frog button', 'moss clump', 'reed whistle'], rare: ['marsh lantern', 'toad crown'], epic: ['drowned key'], mythic: ['heart of the bog'] },
  canopy: { common: ['leaf coin', 'acorn cap', 'bark strip', 'sap drop', 'bright feather'], rare: ['owl bead', 'vine ring'], epic: ['canopy compass'], mythic: ['first seed'] },
  ruins: { common: ['chipped tile', 'old nail', 'sand coin', 'dust jar', 'broken idol'], rare: ['temple glass', 'gilded shard'], epic: ['sealed tablet'], mythic: ['crown of the last mayor'] },
  glacier: { common: ['ice chip', 'frost moth', 'blue stone', 'cold pebble', 'snow lens'], rare: ['frozen rose', 'glacier tooth'], epic: ['aurora vial'], mythic: ['the unmelting'] },
  volcano: { common: ['ember shard', 'ash cake', 'warm rock', 'sulfur bead', 'cinder'], rare: ['magma pearl', 'lava glass'], epic: ['dragon scale'], mythic: ['core fragment'] },
  void: { common: ['void tooth', 'null pebble', 'dim spark', 'quiet dust', 'echo shell'], rare: ['star splinter', 'hollow coin'], epic: ['gravity knot'], mythic: ['the missing hour'] },
  raid: { common: ['boss scale', 'boss lint', 'chipped fang', 'loot crumb', 'bent spear'], rare: ['boss eye', 'war bead'], epic: ['boss heart'], mythic: ['the gilded grub egg'] },
};

function rollRarity(rng, luck = 0) {
  let r = rng.next() - luck;
  for (const k of ['mythic', 'epic', 'rare']) { r -= RARITY_P[k]; if (r < 0) return k; }
  return 'common';
}

function rollItem(rng, zone = 'swamp', opts = {}) {
  const rarity = opts.rarity || rollRarity(rng, opts.luck || 0);
  const bank = ZONE_ITEMS[zone] || ZONE_ITEMS.swamp;
  const name = rng.pick(bank[rarity]);
  return { name, rarity, zone, value: VALUE[rarity] };
}

function rarityIndex(r) { return RARITIES.indexOf(r); }

module.exports = { RARITIES, RARITY_P, RARITY_COLOR, VALUE, ZONE_ITEMS, rollRarity, rollItem, rarityIndex };

};
defs["expedition"] = function (module, exports, require) {
'use strict';
// Expeditions: fully deterministic plans from (creature, zone, seed, startAt). The creature's position at
// time t is interpolated between waypoints so the site can show it walking. Shared with the browser.
const { rngFromString } = require('../rng');
const map = require('./map');
const items = require('./items');

const OUT_END = 0.42, EXPLORE_END = 0.58;

const STORY = {
  open: {
    swamp: ['the swamp was wetter than advertised.', 'mud up to the eyes within a minute.', 'a frog gave directions. they were wrong.'],
    canopy: ['the trees were tall and mostly indifferent.', 'climbed a root. then a bigger root.', 'birds argued overhead the whole way.'],
    ruins: ['the ruins had a gift shop once. not anymore.', 'sand in every fold. every single one.', 'read the old walls. understood none of it.'],
    glacier: ['the glacier was cold, which was expected, and rude, which was not.', 'slid most of the way. on purpose, allegedly.', 'saw its breath. chased it briefly.'],
    volcano: ['the volcano was warm like a bad idea.', 'the rocks glowed. it did not touch them. mostly.', 'ash everywhere. it looked distinguished.'],
    void: ['the void said nothing. it said nothing back.', 'walked into the dark like it owed it money.', 'the stars down there are on the floor.'],
  },
  item: ['found a {item}. did not ask where it came from.', 'dug up a {item}. very pleased about it.', 'a {item} fell into its paws. destiny, probably.', 'traded a stare for a {item}.'],
  wildWin: ['a wild {foe} tried it. it did not go well for the {foe}.', 'won a fight with a {foe}. barely. still counts.', 'stared down a {foe} until it left.'],
  wildLose: ['a {foe} won. it will not talk about it.', 'lost to a {foe}. limped on anyway.', 'the {foe} was bigger up close. lesson learned.'],
  encounter: ['met {other} on the road. they compared mud.', 'walked a while with {other}. nobody said much. it was nice.', 'bumped into {other}. exchanged nods, the good kind.'],
  lost: ['took a wrong turn. dropped half the loot. it blames the map.', 'got lost for a bit. some loot fell out of the bag. it says the bag was bad.'],
  rest: ['slept under a rock for a while. good rock.', 'stopped to nap. woke up mildly heroic.'],
  home: ['it came back muddy. it is proud of the mud.', 'home again. it went straight to sleep in your name.', 'back at the village. told everyone. twice.', 'came home with the loot held very high.', 'it is home. it would like a snack about it.'],
};
const FOES = { swamp: ['bog rat', 'leech lord', 'angry heron'], canopy: ['bark wasp', 'sap bear', 'thief monkey'], ruins: ['sand golem', 'tomb beetle', 'dust wraith'], glacier: ['ice hare', 'frost wolf', 'snow maw'], volcano: ['cinder hound', 'magma slug', 'ash drake'], void: ['null cat', 'echo', 'the shape'] };

function stageMult(stage) { return { 1: 1, 2: 1.4, 3: 1.9 }[stage] || 1; }

function durationFor(zone, creature, demoFast) {
  const z = map.ZONES[zone];
  const spd = Number(creature.spd || 5);
  const scale = Math.max(0.6, Math.min(1.4, 1 / (1 + (spd - 5) * 0.05)));
  let ms = z.baseMs * scale;
  if (creature.hungry) ms *= 1.3;
  if (demoFast) ms /= 60;
  return Math.round(ms);
}

function plan(creature, zone, seed, startAt, opts = {}) {
  const world = map.generate(opts.worldSeed);
  const z = map.ZONES[zone];
  if (!z || zone === 'village') throw new Error('unknown zone ' + zone);
  const rng = rngFromString(`exp:${seed}:${creature.id}:${zone}`);
  const path = map.pathTo(world, zone);
  const durationMs = durationFor(zone, creature, opts.demoFast);
  const n = path.length;
  const waypoints = [];
  for (let i = 0; i < n; i++) waypoints.push({ t: (i / (n - 1)) * OUT_END, x: path[i].x, y: path[i].y });
  // wander around the zone landing
  const wander = [];
  let wx = z.x, wy = z.y;
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 12; k++) { const nx = z.x + rng.int(-3, 3), ny = z.y + rng.int(-2, 2); if (map.walkable(world, nx, ny)) { wx = nx; wy = ny; break; } }
    wander.push({ t: OUT_END + ((i + 1) / 5) * (EXPLORE_END - OUT_END), x: wx, y: wy });
  }
  waypoints.push(...wander);
  waypoints.push({ t: EXPLORE_END, x: z.x, y: z.y });
  for (let i = n - 1; i >= 0; i--) waypoints.push({ t: EXPLORE_END + ((n - 1 - i) / (n - 1)) * (1 - EXPLORE_END), x: path[i].x, y: path[i].y });

  // events
  const danger = z.danger;
  const count = 2 + danger + rng.int(0, 2);
  const events = [];
  const others = (opts.others || []).filter((o) => o.id !== creature.id);
  let hp = Number(creature.hp || 30), hpMax = hp, lost = false;
  const power = Number(creature.atk || 5) * stageMult(creature.stage) + Number(creature.def || 5) * 0.5 + Number(creature.level || 1) * 0.4;
  for (let i = 0; i < count; i++) {
    const t = 0.1 + (0.85 * (i + rng.float(0.1, 0.9))) / count;
    const roll = rng.next();
    if (roll < 0.45) {
      const item = items.rollItem(rng, zone, { luck: danger * 0.006 });
      events.push({ t, type: 'item', item });
    } else if (roll < 0.62 && others.length) {
      const other = rng.pick(others);
      events.push({ t, type: 'encounter', otherId: other.id, otherName: other.name });
    } else if (roll < 0.62 + danger * 0.05) {
      const foe = rng.pick(FOES[zone]);
      const foePower = danger * 2.2 + rng.float(0, danger * 2.5);
      const win = power * rng.float(0.8, 1.2) >= foePower;
      const dmg = win ? Math.round(hpMax * rng.float(0.05, 0.15)) : Math.round(hpMax * rng.float(0.25, 0.6));
      hp = Math.max(1, hp - dmg);
      const e = { t, type: 'wild', foe, win, dmg };
      if (win) e.item = items.rollItem(rng, zone, { luck: 0.03 });
      events.push(e);
    } else if (roll < 0.95 && !lost && danger >= 2) {
      lost = true;
      events.push({ t, type: 'lost' });
    } else {
      events.push({ t, type: 'rest' });
    }
  }
  events.sort((a, b) => a.t - b.t);
  let loot = events.filter((e) => e.item).map((e) => e.item);
  if (lost) loot = loot.slice(0, Math.ceil(loot.length / 2));
  const xp = Math.min(200, 40 + danger * 22 + events.length * 6 + (lost ? -10 : 0));
  const story = buildStory(rng.fork('story'), zone, events, creature);
  return {
    creatureId: creature.id, zone, seed: String(seed), startAt, durationMs, endAt: startAt + durationMs,
    waypoints, events, loot, xp, story, hpAfter: hp, hpLoss: hpMax - hp, lost, path: path.map((p) => [p.x, p.y]),
  };
}

function buildStory(rng, zone, events, creature) {
  const lines = [rng.pick(STORY.open[zone])];
  const mid = events.filter((e) => e.type !== 'rest');
  const e = mid.length ? rng.pick(mid) : { type: 'rest' };
  const fill = (s, m) => s.replace(/\{(\w+)\}/g, (_, k) => m[k] || '');
  if (e.type === 'item') lines.push(fill(rng.pick(STORY.item), { item: e.item.name }));
  else if (e.type === 'wild') lines.push(fill(rng.pick(e.win ? STORY.wildWin : STORY.wildLose), { foe: e.foe }));
  else if (e.type === 'encounter') lines.push(fill(rng.pick(STORY.encounter), { other: e.otherName }));
  else if (e.type === 'lost') lines.push(rng.pick(STORY.lost));
  else lines.push(rng.pick(STORY.rest));
  lines.push(rng.pick(STORY.home));
  return lines;
}

// position at absolute time now (ms) -> {x, y, phase, progress, done}
function positionAt(p, now) {
  const f = (now - p.startAt) / p.durationMs;
  const wp = p.waypoints;
  if (f <= 0) return { x: wp[0].x, y: wp[0].y, phase: 'out', progress: 0, f: 0 };
  if (f >= 1) return { x: wp[wp.length - 1].x, y: wp[wp.length - 1].y, phase: 'home', progress: 1, f: 1, done: true };
  let i = 0;
  while (i < wp.length - 2 && wp[i + 1].t <= f) i++;
  const a = wp[i], b = wp[i + 1];
  const span = Math.max(1e-9, b.t - a.t);
  const k = Math.max(0, Math.min(1, (f - a.t) / span));
  const phase = f < OUT_END ? 'out' : f < EXPLORE_END ? 'explore' : 'back';
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, phase, progress: f, f, segment: i, facing: b.x - a.x };
}

// bring it home early: walk back from the current spot along the path. loot halved.
function recall(p, now, opts = {}) {
  const pos = positionAt(p, now);
  if (pos.done) return p;
  const path = p.path;
  // nearest path index to the current position
  let bi = 0, bd = Infinity;
  for (let i = 0; i < path.length; i++) { const d = Math.hypot(path[i][0] - pos.x, path[i][1] - pos.y); if (d < bd) { bd = d; bi = i; } }
  const back = [];
  for (let i = bi; i >= 0; i--) back.push({ x: path[i][0], y: path[i][1] });
  const perTile = (p.durationMs * OUT_END) / Math.max(1, path.length - 1);
  const durationMs = Math.max(1000, Math.round(back.length * perTile * (opts.demoFast ? 1 : 1)));
  const waypoints = [{ t: 0, x: pos.x, y: pos.y }];
  for (let i = 0; i < back.length; i++) waypoints.push({ t: ((i + 1) / back.length), x: back[i].x, y: back[i].y });
  const seen = p.events.filter((e) => e.t <= pos.f);
  let loot = seen.filter((e) => e.item).map((e) => e.item);
  loot = loot.slice(0, Math.floor(loot.length / 2));
  return {
    ...p, recalled: true, startAt: now, durationMs, endAt: now + durationMs, waypoints, events: seen, loot,
    xp: Math.round(p.xp * pos.f * 0.5), story: [p.story[0], 'you called it home early. it came, eventually.', 'half the loot fell out on the way back.'],
  };
}

module.exports = { plan, positionAt, recall, durationFor, stageMult, OUT_END, EXPLORE_END, STORY, FOES };

};
defs["boss"] = function (module, exports, require) {
'use strict';
// World bosses: a menacing seeded variant of the creature generator with extra parts, a name, hp scaled to
// the number of eligible creatures and 1-2 seeded mechanics.
const { rngFromString } = require('../rng');
const creature = require('../art/creature');

const NAMES = ['the gilded grub', 'ashmaw', 'the tax collector', 'old wetlord', 'the null moth', 'grandpa lava', 'the ledger', 'mildew king',
  'the quiet one', 'rugpull', 'the auditor', 'glass hog', 'the bog tenant', 'crumbfather', 'the landlord', 'sir dampness', 'the unpaid invoice', 'big yawn'];

const MECHANICS = {
  enrage: { label: 'enrage', desc: 'below 30% hp it hits twice as hard', threshold: 0.3, mult: 2 },
  sleep: { label: 'sleep', desc: 'naps every 25s for 5s; sleeping skin is thick, damage halved', every: 125, length: 25, mult: 0.5 },
  shield: { label: 'shield', desc: 'a shield that breaks after 40 hits, then never comes back', hits: 40 },
};

function makeBoss(seed, eligibleCount = 4) {
  const rng = rngFromString('boss:' + seed);
  const n = Math.max(4, eligibleCount);
  const def = creature.generate('boss:' + seed, { boss: true });
  const picks = rng.shuffle(Object.keys(MECHANICS)).slice(0, rng.int(1, 2));
  const maxHp = Math.round(4200 * n * rng.float(0.9, 1.15));
  return {
    seed: String(seed), name: rng.pick(NAMES), species: def.species, sprite: def,
    maxHp, hp: maxHp, atk: Math.round(8 + n * 0.5 + rng.int(0, 3)), def: Math.round(1 + n * 0.1),
    mechanics: picks.map((k) => ({ key: k, ...MECHANICS[k] })),
  };
}

function drawBoss(ctx, boss, opts = {}) { creature.draw(ctx, boss.sprite || creature.generate('boss:' + boss.seed, { boss: true }), { ...opts, stage: 3 }); }

module.exports = { makeBoss, drawBoss, NAMES, MECHANICS };

};
defs["raid"] = function (module, exports, require) {
'use strict';
// Raid simulation. Deterministic given (seed, participants, cheer log). 5 ticks/s for up to 180s.
// Per tick each creature attacks; the boss attacks one random creature. Creatures get downed, never die.
// Compact tick log for replays. Shared with the browser (replay page).
const { rngFromString, hashString } = require('../rng');
const items = require('../world/items');

const TICK_MS = 200, TICKS_PER_S = 5, MAX_TICKS = 900, COUNTDOWN_MS = 20000;
const CHEER_WINDOW = 100; // ticks (20s)
const BOSS_EVERY = 5; // boss swings once per second
const CHEER_BONUS = 0.10;
const STAGE_MULT = { 1: 1, 2: 1.4, 3: 1.9 };

function createRaid({ seed, boss, participants }) {
  return {
    seed: String(seed), boss: { ...boss, hp: boss.maxHp }, tick: 0, status: 'fight',
    parts: participants.map((p) => ({
      id: p.id, name: p.name, owner: p.owner || null, atk: Number(p.atk || 5), def: Number(p.def || 5), stage: Number(p.stage || 1),
      hungry: !!p.hungry, house: !!p.house, maxHp: Math.round(150 + Number(p.def || 5) * 8 + Number(p.level || 1) * 3), hp: 0,
      damage: 0, downed: false, hits: 0,
    })).map((p) => ({ ...p, hp: p.maxHp })),
    cheers: [], log: [], shieldHits: 0, shieldUp: boss.mechanics.some((m) => m.key === 'shield'), sleeping: false, enraged: false,
  };
}

function addCheer(state, creatureId, tick = state.tick) {
  state.cheers.push({ tick, creatureId });
}
function cheerActive(state, creatureId, tick) {
  for (let i = state.cheers.length - 1; i >= 0; i--) {
    const c = state.cheers[i];
    if (c.tick > tick) continue;
    if (c.tick <= tick - CHEER_WINDOW) break;
    if (c.creatureId === creatureId) return true;
  }
  return false;
}

function stepTick(state) {
  if (state.status !== 'fight') return null;
  const t = state.tick;
  const rng = rngFromString(`${state.seed}:t${t}`);
  const boss = state.boss;
  const mech = Object.fromEntries(boss.mechanics.map((m) => [m.key, m]));
  const sleeping = mech.sleep ? (t % mech.sleep.every) >= (mech.sleep.every - mech.sleep.length) && t > 0 : false;
  const enraged = mech.enrage ? boss.hp <= boss.maxHp * mech.enrage.threshold : false;
  state.sleeping = sleeping; state.enraged = enraged;
  const hits = [];
  for (const p of state.parts) {
    if (p.downed) continue;
    let dmg = p.atk * (STAGE_MULT[p.stage] || 1) * (1 + (cheerActive(state, p.id, t) ? CHEER_BONUS : 0)) * rng.float(0.8, 1.2) - boss.def;
    if (p.hungry) dmg *= 0.5;
    if (sleeping) dmg *= mech.sleep.mult;
    dmg = Math.max(0, Math.round(dmg));
    if (state.shieldUp) { state.shieldHits++; if (state.shieldHits >= mech.shield.hits) state.shieldUp = false; dmg = 0; }
    if (dmg > 0) { boss.hp = Math.max(0, boss.hp - dmg); p.damage += dmg; p.hits++; }
    hits.push([p.id, dmg]);
    if (boss.hp <= 0) break;
  }
  let attack = null;
  if (boss.hp > 0 && !sleeping && t % BOSS_EVERY === 0) {
    const alive = state.parts.filter((p) => !p.downed);
    if (alive.length) {
      const target = rng.pick(alive);
      let dmg = Math.max(1, Math.round(boss.atk * rng.float(0.7, 1.3) * (enraged ? mech.enrage.mult : 1) - target.def * 0.3));
      target.hp = Math.max(0, target.hp - dmg);
      if (target.hp === 0) target.downed = true;
      attack = [target.id, dmg, target.hp];
    }
  }
  const flags = (sleeping ? 'S' : '') + (enraged ? 'E' : '') + (state.shieldUp ? 'H' : '');
  const entry = [t, boss.hp, hits, attack, flags];
  state.log.push(entry);
  state.tick++;
  if (boss.hp <= 0) state.status = 'won';
  else if (state.tick >= MAX_TICKS) state.status = 'timeout';
  else if (state.parts.every((p) => p.downed)) state.status = 'wiped';
  return entry;
}

function run(state) { while (state.status === 'fight') stepTick(state); return state; }

function stateHash(state) {
  const s = JSON.stringify({ hp: state.boss.hp, t: state.tick, st: state.status, p: state.parts.map((p) => [p.id, p.hp, p.damage, p.downed]) });
  return hashString(s).toString(16);
}

function result(state) {
  const total = state.parts.reduce((a, p) => a + p.damage, 0) || 1;
  const ranked = state.parts.filter((p) => p.damage > 0).sort((a, b) => b.damage - a.damage || String(a.id).localeCompare(String(b.id)));
  const top = ranked.map((p) => ({ id: p.id, name: p.name, owner: p.owner, house: p.house, damage: p.damage, share: p.damage / total, downed: p.downed }));
  const mvp = top[0] || null;
  return { status: state.status, ticks: state.tick, durationMs: state.tick * TICK_MS, bossHp: state.boss.hp, bossMaxHp: state.boss.maxHp, totalDamage: total, top, mvp, downed: state.parts.filter((p) => p.downed).length };
}

// loot: won -> top 10 by share get an item (rarity luck by share, mvp 25% mythic); timeout -> 1 common to everyone who hit
function distributeLoot(state) {
  const res = result(state);
  const rng = rngFromString(`loot:${state.seed}`);
  const out = [];
  if (res.status === 'won') {
    res.top.slice(0, 10).forEach((p, i) => {
      if (p.house) return;
      const count = 1 + (p.share > 0.15 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const it = i === 0 && k === 0 && rng.chance(0.25) ? items.rollItem(rng, 'raid', { rarity: 'mythic' }) : items.rollItem(rng, 'raid', { luck: p.share * 0.5 });
        out.push({ creatureId: p.id, item: it, share: p.share });
      }
    });
  } else {
    for (const p of res.top) if (!p.house) out.push({ creatureId: p.id, item: items.rollItem(rng, 'raid', { rarity: 'common' }), share: p.share });
  }
  return out;
}

// replay: apply the log to a fresh state built from the same inputs; returns state at tick n (or the end)
function replay(initial, log, uptoTick = Infinity) {
  const st = { boss: { ...initial.boss, hp: initial.boss.maxHp }, parts: initial.parts.map((p) => ({ ...p, hp: p.maxHp, damage: 0, downed: false, hits: 0 })), tick: 0, status: 'fight' };
  const byId = Object.fromEntries(st.parts.map((p) => [p.id, p]));
  for (const [t, bossHp, hits, attack] of log) {
    if (t >= uptoTick) break;
    for (const [id, dmg] of hits) { if (dmg > 0) { byId[id].damage += dmg; byId[id].hits++; } }
    if (attack) { const p = byId[attack[0]]; p.hp = attack[2]; if (p.hp === 0) p.downed = true; }
    st.boss.hp = bossHp;
    st.tick = t + 1;
  }
  if (st.boss.hp <= 0) st.status = 'won';
  else if (st.tick >= MAX_TICKS) st.status = 'timeout';
  else if (st.parts.every((p) => p.downed)) st.status = 'wiped';
  return st;
}

module.exports = { TICK_MS, TICKS_PER_S, MAX_TICKS, COUNTDOWN_MS, CHEER_WINDOW, CHEER_BONUS, STAGE_MULT, createRaid, addCheer, cheerActive, stepTick, run, result, distributeLoot, replay, stateHash };

};
defs["care"] = function (module, exports, require) {
'use strict';
// Care loop math: hunger, cooldowns, xp/levels, stage multipliers, evolution checks, memory extraction
// (regex fallback), diary/feed/talk fallback banks. All deterministic.
const { rngFromString } = require('./rng');
const items = require('./world/items');

const H = 3600 * 1000;
const FEED_COOLDOWN_MS = 2 * H, TRAIN_COOLDOWN_MS = 6 * H, HUNGER_DECAY_MS = 8 * H;
const STAGE_MULT = { 1: 1, 2: 1.4, 3: 1.9 };
const XP = { feed: 10, train: 5 };
const STATS = ['atk', 'def', 'spd'];

function hunger(fedAt, now = Date.now()) {
  if (!fedAt) return 0;
  return Math.max(0, Math.min(1, 1 - (now - fedAt) / HUNGER_DECAY_MS));
}
function isHungry(fedAt, now) { return hunger(fedAt, now) <= 0; }
function cooldown(lastAt, ms, now = Date.now()) {
  const wait = lastAt ? lastAt + ms - now : 0;
  return { ok: wait <= 0, waitMs: Math.max(0, wait) };
}
const canFeed = (c, now) => cooldown(c.fed_at, FEED_COOLDOWN_MS, now);
const canTrain = (c, now) => cooldown(c.trained_at, TRAIN_COOLDOWN_MS, now);

function xpForLevel(level) { return 20 * (level - 1) * (level - 1); }
function levelFor(xp) { return Math.max(1, Math.min(60, Math.floor(Math.sqrt(Math.max(0, xp) / 20)) + 1)); }
function xpProgress(xp) {
  const l = levelFor(xp);
  const a = xpForLevel(l), b = xpForLevel(l + 1);
  return { level: l, into: xp - a, need: b - a, frac: Math.max(0, Math.min(1, (xp - a) / (b - a))) };
}

function effectiveStats(c) {
  const m = STAGE_MULT[c.stage] || 1;
  return { atk: Math.round(c.atk * m * 10) / 10, def: Math.round(c.def * m * 10) / 10, spd: Math.round(c.spd * m * 10) / 10 };
}

// evolution: stage 2 = level >= 10 + 1 rare item; stage 3 = level >= 25 + 1 epic item + 3 bonds
function evolveCheck(c, inventory = [], bondCount = 0) {
  const level = levelFor(c.xp);
  const has = (r) => inventory.find((i) => !i.consumed && items.rarityIndex(i.rarity) >= items.rarityIndex(r));
  if (c.stage >= 3) return { ok: false, next: null, missing: ['it is already fully grown. it says thanks.'] };
  const missing = [];
  let consume = null;
  if (c.stage === 1) {
    if (level < 10) missing.push(`level 10 (it is ${level})`);
    consume = has('rare');
    if (!consume) missing.push('one rare item');
  } else {
    if (level < 25) missing.push(`level 25 (it is ${level})`);
    consume = has('epic');
    if (!consume) missing.push('one epic item');
    if (bondCount < 3) missing.push(`3 bonds (it has ${bondCount})`);
  }
  return { ok: missing.length === 0, next: c.stage + 1, missing, consume: missing.length ? null : consume };
}

// ---------- memories ----------
const MEM_PATTERNS = [
  [/\bi am ((?:a |an )?[a-z][a-z0-9' -]{1,38}?)(?=[.,!?]|$| and | but )/i, (m) => `is ${m[1].trim()}`],
  [/\bi'?m ((?:a |an )?[a-z][a-z0-9' -]{1,38}?)(?=[.,!?]|$| and | but )/i, (m) => `is ${m[1].trim()}`],
  [/\bi (?:really )?(like|love|hate|miss|want) ([a-z][a-z0-9' -]{1,38}?)(?=[.,!?]|$| and | but )/i, (m) => `${m[1].toLowerCase()}s ${m[2].trim()}`],
  [/\bmy ([a-z]+) is (?:called |named )?([a-z][a-z0-9' -]{1,30}?)(?=[.,!?]|$| and | but )/i, (m) => `their ${m[1].toLowerCase()} is ${m[2].trim()}`],
  [/\bi (?:work|live) (?:as|at|in|on) (?:a |an |the )?([a-z][a-z0-9' -]{1,38}?)(?=[.,!?]|$| and | but )/i, (m) => `spends time at ${m[1].trim()}`],
  [/\bi have (?:a |an |two |three |\d+ )?([a-z][a-z0-9' -]{1,38}?)(?=[.,!?]|$| and | but )/i, (m) => `has ${m[1].trim()}`],
];
function extractMemories(text) {
  const t = String(text || '').replace(/@\w+/g, '').replace(/\s+/g, ' ').trim();
  const out = [];
  for (const [re, fmt] of MEM_PATTERNS) {
    const m = t.match(re);
    if (m) { const f = fmt(m).toLowerCase(); if (f.length <= 60 && !/hatch|feed|train|status/.test(f) && !out.includes(f)) out.push(f); }
  }
  return out.slice(0, 3);
}

// ---------- fallback banks ----------
const FOOD_WORDS = ['pizza', 'taco', 'tacos', 'soup', 'bread', 'apple', 'apples', 'cake', 'rice', 'noodles', 'ramen', 'burger', 'fries', 'sushi', 'cheese', 'berries', 'mushroom', 'mushrooms', 'worm', 'worms', 'bug', 'bugs', 'meat', 'fish', 'salad', 'cookie', 'cookies', 'chips', 'candy', 'eggs', 'steak', 'curry', 'moss', 'rocks', 'coal', 'a snack', 'leftovers', 'gum', 'coffee', 'tea', 'beans', 'toast', 'grapes', 'banana', 'mango', 'chicken'];
function parseFood(text) {
  const t = String(text || '').toLowerCase().replace(/@\w+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = t.match(/\b(?:feed(?:\s+(?:it|him|her|them|my\s+\w+))?|eat|give(?:\s+(?:it|him|her))?|snack on|here(?:'s| is)?|have|i brought)\s+(?:some|a|an|the)?\s*([a-z][a-z' -]{1,30}?)(?=[.,!?]|$| for )/);
  if (m && !/^(it|him|her|them|please|pls|now|me|us|you)$|^my\b/.test(m[1].trim())) return m[1].trim().replace(/^(some|a|an|the) /, '');
  for (const w of FOOD_WORDS) if (new RegExp(`\\b${w}\\b`).test(t)) return w;
  return 'something';
}
const FEED_BANK = [
  '{food}. it ate the whole thing. no chewing.', 'it sniffed the {food}, doubted you, ate it anyway.', '{food}? for it? it is going to remember this.',
  'ate the {food} in one motion. looked at you for more.', 'it licked the {food} first. then everything else.', 'the {food} is gone. it says it was fine.',
  'it hid half the {food} for later. later is now.', 'it approved of the {food} with a small nod.',
];
function feedReaction(food, seed) {
  const r = rngFromString('feed:' + seed + ':' + food);
  let s = r.pick(FEED_BANK).replace(/\{food\}/g, food);
  if (s.length > 60) s = s.slice(0, 57).replace(/\s+\S*$/, '') + '...';
  return s;
}

const TRAIT_LINES = {
  anxious: ['it is worried about that. it is worried about most things.', 'ok but what if it goes wrong. it is asking for a friend. the friend is it.'],
  greedy: ['does that come with loot. asking early.', 'it heard you. it also heard the word gold somewhere. was it you.'],
  brave: ['it would fight that. it would fight anything, really.', 'noted. it is not scared. it is never scared. it says.'],
  sleepy: ['it heard about half of that. the good half.', 'mm. yes. it will think about it after the nap.'],
  nosy: ['tell it more. it needs to know. for reasons.', 'interesting. who else knows about this.'],
  loyal: ['it will remember that. it remembers everything you say. most of it.', 'it is on your side. it was always on your side.'],
  smug: ['it knew that already, obviously.', 'sure. it could have told you that. it chose not to.'],
  clingy: ['do not go anywhere. it is fine. it just prefers you here.', 'it missed you between this message and the last one.'],
  feral: ['it bit the air in response. affectionately.', 'grr. that is the whole reply. grr.'],
  polite: ['thank you for telling it. it means that.', 'noted, with respect. it bowed a little.'],
  dramatic: ['this changes everything. it is lying down about it.', 'it gasped. nobody saw. it gasped again.'],
  stubborn: ['no. well. maybe. no.', 'it disagrees on principle. it will not say which principle.'],
  curious: ['why though. it needs the why.', 'it tilted its head so far it fell over. worth it.'],
  moody: ['it is not in the mood. it will be later. maybe.', 'fine. whatever. it cares, secretly.'],
  chill: ['cool. it is vibing about it.', 'yeah. that tracks. all good here.'],
  hungry: ['is that food. it heard food. was that food.', 'it will consider this after a snack.'],
  vain: ['did you see its scales today. anyway, what.', 'it looked in a puddle while you said that. sorry. it agrees.'],
  shy: ['it hid behind a rock. it is peeking. hi.', 'it wrote a reply and then ate it.'],
  chaotic: ['it flipped the message over and read it upside down. same meaning, somehow.', 'ok but hear it out: what if the opposite.'],
  gentle: ['it patted the ground near you. that is a hug from here.', 'it hopes you are ok. it really does.'],
  jealous: ['who else are you talking to. just checking.', 'it noticed you fed someone else. it is fine. it is FINE.'],
  proud: ['it stood taller while reading that.', 'it agrees, chin up, chest out.'],
  forgetful: ['it forgot the question but the answer is yes.', 'wait, what were we. yes. that.'],
  poetic: ['the swamp is a mirror that learned to breathe. anyway yes.', 'a small thought under a big sky. it likes that you said it.'],
  salty: ['great. love that for you.', 'ok. it did not ask, but ok.'],
  cheerful: ['yes! it does not know what you mean but yes!', 'good day for it. good day for you. good day.'],
  paranoid: ['do not say that near the huts. they listen.', 'it checked behind you. clear. for now.'],
  tidy: ['it swept the reply before sending it.', 'noted and filed. it has a system.'],
  muddy: ['it rolled in something while reading that. no regrets.', 'the mud approves. it is speaking for the mud now.'],
  ambitious: ['one day it will run this village. today it just listens.', 'it is adding that to the plan. there is a plan.'],
};
function talkReply(text, creature, memories = [], seed = '') {
  const r = rngFromString('talk:' + seed + ':' + text);
  const traits = (creature.traits || []).filter((t) => TRAIT_LINES[t]);
  let line = traits.length ? r.pick(TRAIT_LINES[r.pick(traits)]) : 'it heard you. it blinked. that is a lot for it.';
  if (memories.length && r.chance(0.6)) line += ` it remembers you ${r.pick(memories)}.`;
  return line.slice(0, 240);
}

const DIARY_OPEN = ['dear diary. day {day} with {owner}.', '{owner} log, entry {day}.', 'notes on {owner}, kept by {name}.', 'day {day}. still living at the village. still {trait}.'];
const DIARY_MEM = ['{owner} {mem}. i keep that in the front of my head.', 'i learned {owner} {mem}. i think about it when it rains.', '{owner} {mem}. i pretend not to care. i care.'];
const DIARY_EXP = ['went to {zone} this week. came back with {loot}. {owner} did not come but i felt them cheering.', 'the trip to {zone} was long. i brought back {loot}. i am keeping the best one under my bed.'];
const DIARY_RAID = ['there was a boss. {boss}. i did {dmg} damage. {owner} would have been proud, or at least awake.', '{boss} came to the village. we fought it together. i hit it {dmg} times worth of hits. good hits.'];
const DIARY_CLOSE = ['anyway. i am {trait}. it is who i am.', 'i hope {owner} feeds me tomorrow. i will not say it out loud.', 'that is all. the moss is calling.', 'goodnight. i am putting the diary under the rock again.', 'i am proud of the mud. the mud is proud of me.'];
function diaryFallback({ creature, owner, memories = [], expedition = null, raid = null, seed = '' }) {
  const r = rngFromString('diary:' + seed);
  const m = { owner: '@' + (owner || creature.owner || 'someone'), name: creature.name, trait: r.pick(creature.traits || ['muddy']), day: r.int(3, 400) };
  const fill = (s, extra = {}) => s.replace(/\{(\w+)\}/g, (_, k) => (extra[k] ?? m[k] ?? ''));
  const lines = [fill(r.pick(DIARY_OPEN))];
  if (memories.length) lines.push(fill(r.pick(DIARY_MEM), { mem: r.pick(memories) }));
  if (expedition) lines.push(fill(r.pick(DIARY_EXP), { zone: /^the /.test(expedition.zone) ? expedition.zone : 'the ' + expedition.zone, loot: expedition.loot && expedition.loot.length ? expedition.loot.map((i) => i.name).slice(0, 2).join(' and ') : 'nothing but stories' }));
  if (raid) lines.push(fill(r.pick(DIARY_RAID), { boss: raid.bossName, dmg: raid.damage }));
  lines.push(fill(r.pick(DIARY_CLOSE)));
  return lines.join(' ');
}

module.exports = {
  FEED_COOLDOWN_MS, TRAIN_COOLDOWN_MS, HUNGER_DECAY_MS, STAGE_MULT, XP, STATS,
  hunger, isHungry, cooldown, canFeed, canTrain, xpForLevel, levelFor, xpProgress, effectiveStats, evolveCheck,
  extractMemories, parseFood, feedReaction, talkReply, diaryFallback, TRAIT_LINES, FEED_BANK,
};

};
defs["names"] = function (module, exports, require) {
'use strict';
// Creature names and personality traits. Deterministic from a seed.
const { rngFromString } = require('./rng');

const SYL_A = ['mo', 'pip', 'bo', 'tu', 'ni', 'za', 'ko', 'lu', 'fen', 'wim', 'gro', 'tik', 'nub', 'oz', 'pem', 'ru', 'squ', 'dal', 'ivy', 'bri', 'mug', 'sn', 'quo', 'yam'];
const SYL_B = ['bble', 'kin', 'ff', 'ppo', 'sh', 'dge', 'nk', 'rlo', 'zz', 'mp', 'ttle', 'wick', 'bo', 'lo', 'ss', 'nchy', 'dle', 'pp', 'g', 'ni', 'x', 'ver', 'll', 'root'];

const TRAITS = [
  'anxious', 'greedy', 'brave', 'sleepy', 'nosy', 'loyal', 'smug', 'clingy', 'feral', 'polite', 'dramatic', 'stubborn',
  'curious', 'moody', 'chill', 'hungry', 'vain', 'shy', 'chaotic', 'gentle', 'jealous', 'proud', 'forgetful', 'poetic',
  'salty', 'cheerful', 'paranoid', 'tidy', 'muddy', 'ambitious',
];

function creatureName(seed) {
  const r = rngFromString('name:' + seed);
  let n = r.pick(SYL_A) + r.pick(SYL_B);
  if (r.chance(0.25)) n += r.pick(['o', 'y', 'a', 'et', 'ie']);
  n = n.replace(/(.)\1\1/g, '$1$1');
  return n;
}

function pickTraits(seed, n = 3) {
  const r = rngFromString('traits:' + seed);
  return r.shuffle(TRAITS).slice(0, n);
}

module.exports = { creatureName, pickTraits, TRAITS };

};
var P = {}; Object.keys(defs).forEach(function (k) { P[k] = req(k); });
window.TL = P;
})();
