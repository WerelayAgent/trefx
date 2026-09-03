/* the world map: pan/zoom pixel canvas, creatures idling at the village and walking expedition paths. */
(function () {
  'use strict';
  const { $, esc, spriteCanvas, fmtEta, renderFeed, prependFeed, tickerFrom, connectState, mountChrome } = window.TLU;
  const TL = window.TL;
  mountChrome('/world');

  const canvas = $('#map');
  const ctx = canvas.getContext('2d');
  const world = TL.map.generate('trefx');
  const TILE = 8, MW = TL.map.W * TILE, MH = TL.map.H * TILE;
  // base map, drawn once
  const base = document.createElement('canvas'); base.width = MW; base.height = MH;
  TL.map.drawMap(base.getContext('2d'), world, TILE);

  const cam = { x: TL.map.ZONES.village.x * TILE, y: TL.map.ZONES.village.y * TILE, zoom: 2, tx: null, ty: null };
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    if (!resize.done) { cam.zoom = snap(Math.max(W / MW, H / MH) * 1.25); resize.done = true; }
  }
  const snap = (z) => Math.max(1, Math.min(8, Math.round(z * 4) / 4));
  window.addEventListener('resize', resize);
  resize();

  // ---------- state ----------
  let state = null, stateAt = performance.now();
  const shown = new Map(); // id -> {x, y, tx, ty, facing, frameT}
  let selected = null, follow = null, hover = null;
  const params = new URLSearchParams(location.search);
  if (params.get('follow')) follow = Number(params.get('follow'));
  if (params.get('focus')) selected = Number(params.get('focus'));

  function bossSpot() { const v = TL.map.ZONES.village; return { x: v.x, y: v.y - 5 }; }
  function onState(s) {
    state = s; stateAt = performance.now();
    for (const c of s.creatures) {
      let d = shown.get(c.id);
      if (!d) { d = { x: c.x, y: c.y, tx: c.x, ty: c.y, facing: 1, frameT: Math.random() * 1000 }; shown.set(c.id, d); }
      d.tx = c.x; d.ty = c.y; d.c = c; d.inRaid = false;
      if (Math.abs(c.facing) > 0.01) d.facing = c.facing < 0 ? -1 : 1;
    }
    // when the boss is at the village, everyone at home gathers around it
    const r = s.raid;
    if (r && r.boss && (r.phase === 'fight' || r.phase === 'countdown')) {
      const bs = bossSpot();
      const ring = s.creatures.filter((c) => c.status !== 'away');
      ring.forEach((c, i) => {
        const d = shown.get(c.id); if (!d) return;
        const a = (i / Math.max(1, ring.length)) * Math.PI * 2 + (c.id % 7) * 0.13;
        const rad = 3.4 + (c.id % 3) * 1.2;
        d.tx = bs.x + Math.cos(a) * rad;
        d.ty = bs.y + 2.5 + Math.abs(Math.sin(a)) * rad * 0.9;
        d.inRaid = true;
      });
    }
    for (const id of Array.from(shown.keys())) if (!s.creatures.some((c) => c.id === id)) shown.delete(id);
    $('#pop').textContent = s.population;
    $('#away').textContent = s.away;
    tickerFrom(s);
    if (selected != null) updatePanelLive();
    if (params.get('focus') && !panelOpenedOnce) { panelOpenedOnce = true; openPanel(Number(params.get('focus'))); }
  }
  let panelOpenedOnce = false;
  window.__tlSocket = connectState(onState, (e) => prependFeed($('#feed'), e));
  fetch('/api/events?limit=30').then((r) => r.json()).then((j) => renderFeed($('#feed'), j.events));

  // zones legend + list
  const zoneList = Object.entries(TL.map.ZONES).filter(([k]) => k !== 'village');
  $('#legend').innerHTML = zoneList.map(([k, z]) => `<span class="chip zone" data-zone="${k}" style="--zone:${z.color}">${z.label}</span>`).join('');
  $('#zones').innerHTML = zoneList.map(([k, z]) => `<div><span style="color:${z.color}">■</span> <b>${z.label}</b> <span class="dim">· base ${Math.round(z.baseMs / 60000)} min · danger ${z.danger}/6</span></div>`).join('');
  $('#legend').addEventListener('click', (e) => { const z = e.target.closest('[data-zone]'); if (!z) return; const zz = TL.map.ZONES[z.dataset.zone]; follow = null; cam.tx = zz.x * TILE; cam.ty = zz.y * TILE; });

  // ---------- camera controls ----------
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('drag'); });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 3) drag.moved = true; cam.x = drag.cx - dx / cam.zoom; cam.y = drag.cy - dy / cam.zoom; follow = null; cam.tx = cam.ty = null; }
    else hover = hitTest(e.clientX, e.clientY);
    canvas.style.cursor = hover && !drag ? 'pointer' : '';
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) { const hit = hitTest(e.clientX, e.clientY); if (hit) openPanel(hit.id); }
    drag = null; canvas.classList.remove('drag');
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 0.25 : -0.25, e.clientX, e.clientY); }, { passive: false });
  function zoomAt(dz, sx, sy) {
    const r = canvas.getBoundingClientRect();
    const px = sx == null ? W / 2 : sx - r.left, py = sy == null ? H / 2 : sy - r.top;
    const wx = cam.x + (px - W / 2) / cam.zoom, wy = cam.y + (py - H / 2) / cam.zoom;
    const nz = snap(cam.zoom + dz);
    cam.zoom = nz;
    cam.x = wx - (px - W / 2) / nz; cam.y = wy - (py - H / 2) / nz;
  }
  $('#zoomIn').onclick = () => zoomAt(0.5);
  $('#zoomOut').onclick = () => zoomAt(-0.5);
  $('#zoomHome').onclick = () => { follow = null; cam.tx = TL.map.ZONES.village.x * TILE; cam.ty = TL.map.ZONES.village.y * TILE; };

  function toScreen(wx, wy) { return { x: (wx - cam.x) * cam.zoom + W / 2, y: (wy - cam.y) * cam.zoom + H / 2 }; }
  function spriteScale() { return Math.max(1, Math.round(cam.zoom / 2)); }
  function spriteRect(d) {
    const s = spriteScale(), S = TL.creature.sizeFor(d.c.stage) * s;
    const p = toScreen((d.x + 0.5) * TILE, (d.y + 1) * TILE);
    return { x: p.x - S / 2, y: p.y - S + 2 * s, w: S, h: S, s };
  }
  function hitTest(cx, cy) {
    const r = canvas.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    let best = null;
    for (const d of shown.values()) { const rc = spriteRect(d); if (x >= rc.x && x <= rc.x + rc.w && y >= rc.y && y <= rc.y + rc.h) best = d; }
    return best ? best.c : null;
  }

  // ---------- render ----------
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(100, t - last); last = t;
    // camera follow / glide
    if (follow != null) { const d = shown.get(follow); if (d) { cam.tx = (d.x + 0.5) * TILE; cam.ty = (d.y + 0.5) * TILE; } }
    if (cam.tx != null) { cam.x += (cam.tx - cam.x) * 0.08; cam.y += (cam.ty - cam.y) * 0.08; if (Math.hypot(cam.tx - cam.x, cam.ty - cam.y) < 0.2 && follow == null) cam.tx = cam.ty = null; }
    // clamp
    const halfW = W / 2 / cam.zoom, halfH = H / 2 / cam.zoom;
    cam.x = Math.max(Math.min(halfW, MW / 2), Math.min(MW - halfW, cam.x)); cam.y = Math.max(Math.min(halfH, MH / 2), Math.min(MH - halfH, cam.y));
    // creature interpolation
    for (const d of shown.values()) {
      const k = 1 - Math.pow(0.001, dt / 1000);
      const dx = d.tx - d.x, dy = d.ty - d.y;
      if (Math.hypot(dx, dy) > 6) { d.x = d.tx; d.y = d.ty; } else { d.x += dx * k; d.y += dy * k; }
      d.moving = d.c.phase !== 'explore' && Math.hypot(dx, dy) > 0.02;
      if (d.moving && Math.abs(dx) > 0.01) d.facing = dx < 0 ? -1 : 1;
      if (d.inRaid && !d.moving) d.facing = bossSpot().x >= d.x ? 1 : -1; // face the boss
      d.frameT += dt;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#07110c'; ctx.fillRect(0, 0, W, H);
    const o = toScreen(0, 0);
    ctx.drawImage(base, Math.round(o.x), Math.round(o.y), Math.round(MW * cam.zoom), Math.round(MH * cam.zoom));
    // zone labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = Math.max(9, Math.round(cam.zoom * 4.5));
    ctx.font = `${fs}px Silkscreen, monospace`;
    for (const [k, z] of Object.entries(TL.map.ZONES)) {
      const p = toScreen(z.x * TILE + 4, Math.max(2.5, z.y - (k === 'village' ? 8.5 : z.r * 0.9)) * TILE);
      const w = ctx.measureText(z.label).width + 14;
      ctx.fillStyle = 'rgba(11,15,12,.72)'; ctx.fillRect(p.x - w / 2, p.y - fs * 0.8, w, fs * 1.6);
      ctx.fillStyle = z.color; ctx.fillRect(p.x - w / 2, p.y - fs * 0.8, 3, fs * 1.6);
      ctx.fillStyle = '#eae3cf'; ctx.fillText(z.label, p.x + 2, p.y + 1);
    }
    // raid boss at the village (behind the creatures ringed around it)
    const rd = state && state.raid;
    const bossHere = rd && rd.boss && (rd.phase === 'fight' || rd.phase === 'countdown' || rd.phase === 'result');
    if (bossHere) {
      const bs = bossSpot();
      const bScale = Math.max(1, Math.round(cam.zoom / 2));
      const anim = rd.phase === 'fight' ? (Math.floor(t / 300) % 5 === 0 ? 'attack' : 'walk') : 'idle';
      const fr = Math.floor(t / (rd.phase === 'fight' ? 300 : 650)) % 2;
      const sp = spriteCanvas(rd.boss.seed, rd.boss.species, 1, { boss: true, anim, frame: fr, scale: bScale });
      const p = toScreen((bs.x + 0.5) * TILE, (bs.y + 3) * TILE);
      const bx = p.x - sp.width / 2, by = p.y - sp.height;
      ctx.save();
      if (rd.phase === 'countdown') ctx.globalAlpha = 0.75 + Math.sin(t / 250) * 0.2;
      if (rd.phase === 'result') ctx.globalAlpha = 0.45;
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y - bScale, sp.width * 0.32, Math.max(3, bScale * 2.4), 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(sp, bx, by);
      ctx.restore();
      // name + hp bar
      const fs2 = Math.max(10, Math.round(cam.zoom * 4.5));
      ctx.font = `${fs2}px Silkscreen, monospace`;
      const nm = rd.phase === 'countdown' ? rd.boss.name + ' approaches' : rd.boss.name;
      const nw = ctx.measureText(nm).width + 14;
      ctx.fillStyle = 'rgba(11,15,12,.85)'; ctx.fillRect(p.x - nw / 2, by - fs2 * 2.6, nw, fs2 * 1.7);
      ctx.fillStyle = '#ff4d3d'; ctx.fillRect(p.x - nw / 2, by - fs2 * 2.6, 3, fs2 * 1.7);
      ctx.fillStyle = '#eae3cf'; ctx.fillText(nm, p.x + 2, by - fs2 * 1.75);
      if (rd.phase === 'fight' || rd.phase === 'result') {
        const bw = Math.max(60, sp.width), bh = Math.max(4, bScale * 3);
        const frac = Math.max(0, rd.boss.hp / rd.boss.maxHp);
        ctx.fillStyle = 'rgba(11,15,12,.85)'; ctx.fillRect(p.x - bw / 2, by - fs2 * 0.7, bw, bh);
        ctx.fillStyle = '#ff4d3d'; ctx.fillRect(p.x - bw / 2, by - fs2 * 0.7, bw * frac, bh);
      }
    }
    // creatures, back to front
    const list = Array.from(shown.values()).sort((a, b) => a.y - b.y);
    const s = spriteScale();
    for (const d of list) {
      const c = d.c;
      const rc = spriteRect(d);
      if (rc.x + rc.w < -40 || rc.x > W + 40 || rc.y + rc.h < -40 || rc.y > H + 60) continue;
      const anim = d.moving ? 'walk' : 'idle';
      const period = d.moving ? 220 : 700;
      const fr = Math.floor(d.frameT / period) % 2;
      const sp = spriteCanvas(c.seed, c.species, c.stage, { anim, frame: fr, scale: s });
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(rc.x + rc.w / 2, rc.y + rc.h - s, rc.w * 0.3, Math.max(2, s * 1.6), 0, 0, Math.PI * 2); ctx.fill();
      const bob = !d.moving && fr ? 0 : 0;
      if (d.facing < 0) { ctx.save(); ctx.translate(rc.x + rc.w, rc.y + bob); ctx.scale(-1, 1); ctx.drawImage(sp, 0, 0); ctx.restore(); }
      else ctx.drawImage(sp, rc.x, rc.y + bob);
      if (selected === c.id || follow === c.id) { ctx.strokeStyle = '#ff7a45'; ctx.lineWidth = 2; ctx.strokeRect(rc.x - 3, rc.y - 3, rc.w + 6, rc.h + 6); }
      // name tag: always for away creatures / hovered / selected, home creatures when zoomed in
      const showTag = c.status === 'away' || (hover && hover.id === c.id) || selected === c.id || cam.zoom >= 3;
      if (showTag) {
        ctx.font = `${Math.max(9, Math.round(cam.zoom * 3.6))}px "JetBrains Mono", monospace`;
        const label = c.name + (c.hungry ? ' (hungry)' : '');
        const tw = ctx.measureText(label).width + 10, th = Math.max(12, Math.round(cam.zoom * 5));
        const tx = rc.x + rc.w / 2, ty = rc.y - th / 2 - 3;
        ctx.fillStyle = 'rgba(11,15,12,.82)'; ctx.fillRect(tx - tw / 2, ty - th / 2, tw, th);
        if (c.status === 'away') { const zc = (TL.map.ZONES[c.zone] || {}).color || '#fff'; ctx.fillStyle = zc; ctx.fillRect(tx - tw / 2, ty - th / 2, 3, th); }
        ctx.fillStyle = c.status === 'away' ? '#ffd166' : '#eae3cf'; ctx.fillText(label, tx + 1, ty + 1);
      }
    }
    // battle tint while the boss is up
    if (rd && rd.phase === 'fight') {
      ctx.fillStyle = `rgba(255,60,30,${0.05 + Math.sin(t / 400) * 0.02})`;
      ctx.fillRect(0, 0, W, H);
    }
    // raid hud
    if (state) {
      const r = state.raid;
      const el = $('#raidCd'), lb = $('#raidLabel'), ab = $('#arenaBtn');
      if (r.phase === 'fight') { lb.textContent = 'raid'; el.textContent = 'live'; }
      else if (r.phase === 'countdown') { lb.textContent = 'raid opens'; el.textContent = fmtEta(r.startsAt - (state.now + (performance.now() - stateAt))); }
      else { lb.textContent = 'next raid'; el.textContent = fmtEta(state.nextRaidAt - (state.now + (performance.now() - stateAt))); }
      if (ab) {
        const live = r.phase === 'fight';
        if (live !== ab.classList.contains('raidlive')) { ab.classList.toggle('raidlive', live); ab.textContent = live ? 'raid live — watch' : 'watch the arena'; }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- panel ----------
  const panel = $('#panel');
  let panelData = null;
  async function openPanel(id) {
    selected = id;
    const r = await fetch('/api/creatures/' + id);
    if (!r.ok) return;
    panelData = await r.json();
    const c = panelData;
    const sc = $('#pSprite'); const sp = spriteCanvas(c.seed, c.species, c.stage, { scale: 3 }); sc.width = sp.width; sc.height = sp.height; sc.getContext('2d').drawImage(sp, 0, 0);
    $('#pName').textContent = c.name; $('#pSpecies').textContent = c.species; $('#pOwner').textContent = '@' + c.owner; $('#pStage').textContent = c.stage; $('#pLevel').textContent = c.level;
    $('#pXp').style.width = Math.round(c.xpProgress.frac * 100) + '%';
    $('#pAtk').textContent = c.atk; $('#pDef').textContent = c.def; $('#pSpd').textContent = c.spd;
    $('#pAtkB').style.width = Math.min(100, c.effective.atk / 30 * 100) + '%'; $('#pDefB').style.width = Math.min(100, c.effective.def / 30 * 100) + '%'; $('#pSpdB').style.width = Math.min(100, c.effective.spd / 30 * 100) + '%';
    $('#pTraits').innerHTML = (c.traits || []).map((t) => `<span class="chip trait">${esc(t)}</span>`).join('');
    $('#pDiary').textContent = c.diary && c.diary[0] ? c.diary[0].text.split('. ').slice(0, 2).join('. ') + '.' : 'nothing written yet.';
    $('#pPage').href = '/p/' + c.id;
    $('#pWatch').textContent = follow === c.id ? 'stop watching' : 'watch';
    updatePanelLive();
    panel.classList.add('open');
  }
  function updatePanelLive() {
    if (!state || selected == null) return;
    const c = state.creatures.find((x) => x.id === selected);
    if (!c) return;
    const h = Math.round(c.hunger * 100);
    $('#pHunger').style.width = h + '%'; $('#pHungerT').textContent = c.hungry ? 'starving (dramatically)' : h + '%';
    $('#pActivity').textContent = c.status === 'away' ? `${c.phase === 'back' ? 'walking back from' : c.phase === 'explore' ? 'poking around' : 'walking to'} ${c.zoneLabel} · home in ${fmtEta(c.eta)}` : 'at the village, standing meaningfully';
    const cheer = $('#pCheer'); cheer.hidden = !(state.raid && state.raid.phase === 'fight' && c.status !== 'away');
  }
  function closePanel() { panel.classList.remove('open'); selected = null; }
  $('#pClose').onclick = closePanel;
  $('#pWatch').onclick = () => { follow = follow === selected ? null : selected; $('#pWatch').textContent = follow === selected ? 'stop watching' : 'watch'; };
  $('#pCheer').onclick = () => { if (window.io) { const s = window.__tlSocket; if (s) s.emit('cheer', { creatureId: selected }, (r) => window.TLU.toast(r.ok ? 'cheered' : r.reason || 'no')); } };

  // test hooks
  window.__tl = {
    pos(id) { const d = shown.get(Number(id)); return d ? { x: d.x, y: d.y, tx: d.tx, ty: d.ty, moving: !!d.moving } : null; },
    state() { return state; }, openPanel, closePanel, focus(id) { follow = Number(id); openPanel(Number(id)); }, zoom(z) { cam.zoom = snap(z); }, screenPos(id) { const d = shown.get(Number(id)); if (!d) return null; const rc = spriteRect(d); const r = canvas.getBoundingClientRect(); return { x: r.left + rc.x + rc.w / 2, y: r.top + rc.y + rc.h / 2 }; },
    shownCount() { return shown.size; },
  };
})();
