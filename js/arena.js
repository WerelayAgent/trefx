/* live arena page */
(function () {
  'use strict';
  const { $, esc, spriteCanvas, fmtEta, fmtAgo, renderFeed, prependFeed, tickerFrom, connectState, mountChrome, toast } = window.TLU;
  mountChrome('/arena');
  const R = window.ArenaRenderer($('#arena'));
  let state = null, stateAt = performance.now(), lastPhase = null, lastRaidId = null;
  let socket = null;
  let cheerUntil = 0;
  const CHEER_CD = 20000;

  function onState(s) {
    state = s; stateAt = performance.now();
    tickerFrom(s);
    const r = s.raid;
    if (r.id !== lastRaidId) { R.reset(); lastRaidId = r.id; }
    if (r.phase !== lastPhase) { lastPhase = r.phase; loadRecent(); }
    if (r.phase === 'fight') R.ingest(r.recent, r.parts);
    renderDom();
  }
  socket = connectState(onState, (e) => prependFeed($('#feed'), e));
  if (socket) socket.on('cheer', (c) => { R.cheerFx(c.creatureId); $('#cheerCount').textContent = c.count; });
  fetch('/api/events?limit=30').then((r) => r.json()).then((j) => renderFeed($('#feed'), j.events));

  function renderDom() {
    const r = state.raid;
    const now = state.now + (performance.now() - stateAt);
    const ov = $('#overlay');
    const b = r.boss;
    if (r.phase === 'fight' || r.phase === 'result' || r.phase === 'countdown') {
      $('#bossName').textContent = b ? b.name : '-';
      $('#bossEyebrow').textContent = r.phase === 'countdown' ? 'incoming' : r.phase === 'result' ? (r.result && r.result.status === 'won' ? 'defeated' : 'escaped') : 'world boss';
      const frac = b ? b.hp / b.maxHp : 1;
      $('#hpFill').style.width = (frac * 100) + '%';
      $('#hpText').textContent = b ? `${b.hp} / ${b.maxHp}` : '';
      $('#mechs').innerHTML = (b ? b.mechanics : []).map((m) => { const on = (m.key === 'sleep' && b.sleeping) || (m.key === 'enrage' && b.enraged) || (m.key === 'shield' && b.shieldUp); const broken = m.key === 'shield' && !b.shieldUp && r.phase !== 'countdown'; return `<span class="mech ${on ? 'on' : ''} ${broken ? 'broken' : ''}" title="${esc(m.desc)}">${m.label}</span>`; }).join('');
    } else {
      $('#bossName').textContent = r.next ? r.next.name : '-'; $('#bossEyebrow').textContent = 'next boss';
      $('#hpFill').style.width = '0%'; $('#hpText').textContent = 'waiting';
      $('#mechs').innerHTML = (r.next ? r.next.mechanics : []).map((k) => `<span class="mech">${k}</span>`).join('');
    }
    if (r.phase === 'idle') { ov.classList.add('show'); $('#ovEyebrow').textContent = 'next boss'; $('#countdown').textContent = fmtEta(state.nextRaidAt - now); $('#ovSub').textContent = r.last ? `last time: ${r.last.boss.name} ${r.last.status === 'won' ? 'went down' : 'got away'}${r.last.mvp ? ', mvp ' + r.last.mvp.name : ''}` : 'the village is quiet'; }
    else if (r.phase === 'countdown') { ov.classList.add('show'); $('#ovEyebrow').textContent = 'raid opens in'; $('#countdown').textContent = fmtEta(r.startsAt - now); $('#ovSub').textContent = `${r.parts.length} creatures at home are getting ready`; }
    else if (r.phase === 'result') { ov.classList.add('show'); const res = r.result || {}; $('#ovEyebrow').textContent = res.status === 'won' ? 'boss defeated' : res.status === 'timeout' ? 'boss escaped' : 'village wiped'; $('#countdown').textContent = res.mvp ? 'mvp ' + res.mvp.name : 'nobody'; $('#ovSub').textContent = `${res.totalDamage || 0} damage · ${Math.round((res.durationMs || 0) / 1000)}s · ${r.cheers || 0} cheers${r.id ? ' · replay at /raid/' + r.id : ''}`; }
    else ov.classList.remove('show');
    $('#cheerCount').textContent = r.cheers || 0;
    $('#fighters').textContent = r.parts ? `${r.parts.filter((p) => !p.downed).length} / ${r.parts.length} standing` : '-';
    // board
    const board = $('#board');
    const parts = (r.parts || []).slice().sort((a, b) => b.damage - a.damage).slice(0, 12);
    const total = parts.reduce((a, p) => a + p.damage, 0) || 1;
    if (parts.length) {
      board.innerHTML = parts.map((p, i) => `<div class="brow ${i === 0 && p.damage > 0 ? 'mvp' : ''} ${p.downed ? 'downed' : ''}" data-id="${p.id}"><span class="rank">${String(i + 1).padStart(2, '0')}</span><span class="th"></span><span class="name">${esc(p.name)}<small> ${p.house ? 'village' : '@' + esc(p.owner || '')}</small><div class="bar"><i style="width:${Math.round(p.damage / total * 100)}%"></i></div></span><span class="dmg">${p.damage}</span></div>`).join('');
      board.querySelectorAll('.brow').forEach((row) => { const p = parts.find((q) => String(q.id) === row.dataset.id); const c = spriteCanvas(p.seed || 'x', p.species, p.stage, { scale: 1 }); row.querySelector('.th').appendChild(c); });
    } else board.innerHTML = '<div class="dim mono" style="font-size:12px">no fight right now. the creatures are napping.</div>';
    // cheer button
    const btn = $('#cheerBtn');
    const fight = r.phase === 'fight';
    const left = Math.max(0, cheerUntil - performance.now());
    btn.disabled = !fight || left > 0;
    btn.querySelector('.ring').style.setProperty('--p', Math.round(left / CHEER_CD * 100));
    btn.querySelector('.lbl').textContent = !fight ? 'wait' : left > 0 ? Math.ceil(left / 1000) + 's' : 'cheer';
  }
  $('#cheerBtn').addEventListener('click', () => {
    if (!state || state.raid.phase !== 'fight') return;
    const send = (r) => { if (r && r.ok) { cheerUntil = performance.now() + CHEER_CD; $('#cheerCount').textContent = r.count; toast('cheered. +10% for 20s.'); } else if (r) { toast(r.reason === 'cooldown' ? 'wait ' + Math.ceil((r.waitMs || 0) / 1000) + 's' : r.reason || 'no'); if (r.reason === 'cooldown') cheerUntil = performance.now() + (r.waitMs || 0); } renderDom(); };
    if (socket && socket.connected) socket.emit('cheer', { creatureId: mine }, send);
    else fetch('/api/cheer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ creatureId: mine }) }).then((r) => r.json()).then(send);
  });
  let mine = null;
  $('#board').addEventListener('click', (e) => { const row = e.target.closest('.brow'); if (!row) return; mine = Number(row.dataset.id); toast('cheering for ' + row.querySelector('.name').firstChild.textContent); });

  async function loadRecent() {
    const j = await (await fetch('/api/arena')).json();
    $('#recent').innerHTML = j.recent.map((r) => `<a class="r" href="/raid/${r.id}"><span class="who">${esc(r.boss.name)}<small>${r.participants} fought · ${fmtAgo(r.endedAt || r.startedAt)} ago${r.mvp ? ' · mvp ' + esc(r.mvp.name) : ''}</small></span><span class="st ${r.status}">${r.status === 'won' ? 'defeated' : r.status}</span></a>`).join('') || '<div class="dim mono">no raids yet</div>';
  }
  loadRecent();

  let last = performance.now();
  function frame(t) {
    const dt = Math.min(100, t - last); last = t;
    if (state) {
      R.render(state.raid, dt);
      if (state.raid.phase !== 'fight' || cheerUntil > performance.now()) renderDom();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__tl = { arena() { const r = state ? state.raid : null; const st = R.stats(); return { phase: r ? r.phase : null, bossHp: r && r.boss ? r.boss.hp : null, bossMaxHp: r && r.boss ? r.boss.maxHp : null, tick: r ? r.tick : 0, numbers: st.spawned, cheers: r ? r.cheers : 0, parts: r && r.parts ? r.parts.length : 0 }; }, state: () => state };
})();
