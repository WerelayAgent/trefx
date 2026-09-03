/* trefx shared page chrome + helpers (browser). requires /shared.js (window.TL) for sprites. */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAV = [['/', 'home'], ['/world', 'world'], ['/arena', 'arena'], ['/leaderboard', 'leaderboard'], ['/docs', 'docs'], ['/stream', 'stream']];
  const embed = /[?&]embed=1/.test(location.search);
  if (embed) document.body.classList.add('embed');

  function mountChrome(active) {
    const top = $('#chrome-top');
    if (top) {
      top.innerHTML = `<header class="site-header">
        <a class="logo" href="/"><span class="px"></span>trefx</a>
        <nav class="nav">${NAV.map(([h, l]) => `<a href="${h}" class="${h === active ? 'active' : ''}">${l}</a>`).join('')}</nav>
        <span class="spacer"></span>
        <span class="pill" id="livePill"><span class="dot off" id="liveDot"></span><span class="label" id="liveText">connecting</span></span>
        <a class="btn primary small hide-mobile" href="https://x.com/intent/post?text=${encodeURIComponent('@trefxworld hatch me one')}" target="_blank" rel="noopener">get one on x</a>
      </header>
      <div class="ticker"><div class="track" id="ticker"><span>loading the village...</span></div></div>`;
    }
    const bottom = $('#chrome-bottom');
    if (bottom) {
      bottom.innerHTML = `<footer class="site-footer"><span><b>@trefxworld</b> / trefxx.world</span><span>a creature that lives on x. feed it. send it places. watch it fight.</span><span id="footMode">mock mode</span></footer>`;
    }
  }
  function setLive(on, text) { const d = $('#liveDot'), t = $('#liveText'); if (d) d.classList.toggle('off', !on); if (t) t.textContent = text; }

  // ---------- sprites ----------
  const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function spriteCanvas(seed, species, stage, opts) {
    const TL = window.TL;
    const def = TL.creature.generate(seed, { species, boss: !!(opts && opts.boss) });
    return TL.creature.sprite(def, Object.assign({ stage: stage || 1, anim: 'idle', frame: 0, scale: 3 }, opts || {}), cvs);
  }
  // <canvas> element that idles (2-frame breath)
  function spriteEl(seed, species, stage, scale, cls) {
    const c = cvs(1, 1); c.className = (cls || '') + ' sprite-thumb';
    let f = 0;
    const draw = () => { const s = spriteCanvas(seed, species, stage, { scale, frame: f }); if (c.width !== s.width) { c.width = s.width; c.height = s.height; } const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.drawImage(s, 0, 0); };
    draw();
    const t = setInterval(() => { if (!c.isConnected) { clearInterval(t); return; } f = 1 - f; draw(); }, 700);
    return c;
  }

  // ---------- time ----------
  const fmtAgo = (ts, now) => { const s = Math.max(0, Math.round(((now || Date.now()) - ts) / 1000)); if (s < 60) return s + 's'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; };
  const fmtEta = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return m + 'm' + String(s % 60).padStart(2, '0') + 's'; return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') + 'm'; };
  const fmtClock = (ts) => new Date(ts).toTimeString().slice(0, 8);
  const fmtDate = (ts) => new Date(ts).toISOString().slice(0, 10);

  // ---------- feed ----------
  function feedRow(e) {
    const raid = /raid/.test(e.verb);
    return `<div class="row ${raid ? 'raid' : ''}"><span class="t">${fmtClock(e.ts)}</span><span class="h">${e.handle === 'village' ? 'village' : '@' + esc(e.handle || '?')}</span><span class="v">${esc(e.verb)}</span><span class="o">${e.refId && !raid ? `<a href="/p/${e.refId}">${esc(e.object)}</a>` : raid && e.refId ? `<a href="/raid/${e.refId}">${esc(e.object)}</a>` : esc(e.object)}</span></div>`;
  }
  function renderFeed(el, events) { if (!el) return; el.innerHTML = events.map(feedRow).join('') || '<div class="dim mono">quiet. suspiciously quiet.</div>'; }
  function prependFeed(el, e, max) { if (!el) return; el.insertAdjacentHTML('afterbegin', feedRow(e)); while (el.children.length > (max || 40)) el.lastElementChild.remove(); }

  // ---------- ticker ----------
  function tickerFrom(state) {
    const el = $('#ticker'); if (!el || !state) return;
    const r = state.raid || {};
    const next = r.phase === 'fight' ? `<i>raid live</i> ${r.boss ? r.boss.name : ''}` : r.phase === 'countdown' ? `<i>raid opens in ${fmtEta(r.startsAt - state.now)}</i>` : `next boss in <b>${fmtEta(state.nextRaidAt - state.now)}</b>${r.next ? ' (' + r.next.name + ')' : ''}`;
    const away = (state.creatures || []).filter((c) => c.status === 'away').slice(0, 6).map((c) => `<b>${esc(c.name)}</b> walking ${c.phase === 'back' ? 'back from' : 'to'} ${esc(c.zoneLabel)}`);
    const parts = [`<b>${state.population}</b> trefxs in the village`, `<b>${state.away}</b> away on expeditions`, next, ...away, `say <i>hatch</i> to @trefxworld on x to get one`];
    const html = parts.map((p) => `<span>${p}</span>`).join('');
    el.innerHTML = html + html;
  }

  // ---------- state stream ----------
  function connectState(onState, onEvent) {
    let socket = null;
    const apply = (s) => { try { onState(s); } catch (e) { console.error(e); } };
    if (window.io) {
      socket = window.io({ transports: ['websocket', 'polling'] });
      socket.on('connect', () => setLive(true, 'live'));
      socket.on('disconnect', () => setLive(false, 'reconnecting'));
      socket.on('state', apply);
      if (onEvent) socket.on('event', onEvent);
    } else {
      setLive(true, 'polling');
      const poll = async () => { try { apply(await (await fetch('/api_state.json')).json()); } catch (e) { /* */ } setTimeout(poll, 1000); };
      poll();
    }
    fetch('/api/health').then((r) => r.json()).then((h) => { const f = $('#footMode'); if (f) f.textContent = `${h.mode} mode · v${h.version}${h.demoFast ? ' · demo fast' : ''}`; }).catch(() => {});
    return socket;
  }

  function toast(msg) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200); }

  window.TLU = { $, $$, esc, mountChrome, setLive, spriteCanvas, spriteEl, cvs, fmtAgo, fmtEta, fmtClock, fmtDate, renderFeed, prependFeed, tickerFrom, connectState, toast, embed };
})();
