/* arena renderer: boss in the middle breathing, creatures on an arc, lunges, hurt flashes, floating damage. */
(function () {
  'use strict';
  const TL = window.TL;
  const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  function ArenaRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    const fx = new Map(); // id -> {lunge, hurt}
    const numbers = [];
    let W = 0, H = 0, dpr = 1, t0 = performance.now(), bossHurt = 0, lastTick = -1, spawned = 0, lastFlash = 0;
    function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    window.addEventListener('resize', resize); resize();
    const sprite = (seed, species, stage, opts) => TL.creature.sprite(TL.creature.generate(seed, { species, boss: !!(opts && opts.boss) }), opts, cvs);

    function layout(parts) {
      const n = parts.length;
      const cx = W / 2, cy = H * 0.40;
      const rows = n > 14 ? 2 : 1;
      return parts.map((p, i) => {
        const row = i % rows, idx = Math.floor(i / rows), per = Math.ceil(n / rows);
        const t = per <= 1 ? 0.5 : (idx + 0.5) / per;
        const th = Math.PI * (0.12 + 0.76 * t);
        const Rx = W * (0.44 - row * 0.09), Ry = H * (0.34 - row * 0.08);
        return { x: cx + Rx * Math.cos(th), y: cy + Ry * Math.sin(th) + 20 + row * 10 };
      });
    }

    // consume new tick entries -> effects
    function ingest(recent, parts) {
      if (!recent) return;
      for (const e of recent) {
        const [tick, , hits, attack] = e;
        if (tick <= lastTick) continue;
        lastTick = tick;
        for (const [id, dmg] of hits) if (dmg > 0) { const f = fx.get(id) || {}; f.lunge = 1; fx.set(id, f); if (Math.random() < 0.35 || dmg > 20) { numbers.push({ id, text: String(dmg), age: 0, color: '#ffb347', boss: true, ox: (Math.random() - 0.5) * 80, oy: (Math.random() - 0.5) * 40 }); spawned++; } if (dmg > 12 && performance.now() - lastFlash > 1400) { bossHurt = 1; lastFlash = performance.now(); } }
        if (attack) { const f = fx.get(attack[0]) || {}; f.hurt = 1; fx.set(attack[0], f); numbers.push({ id: attack[0], text: '-' + attack[1], age: 0, color: '#ff5c5c' }); spawned++; }
      }
    }
    function reset() { fx.clear(); numbers.length = 0; lastTick = -1; bossHurt = 0; }
    function cheerFx(id) { numbers.push({ id, text: '+cheer', age: 0, color: '#ffd166' }); spawned++; }

    // view: {phase, boss:{seed,name,hp,maxHp,sleeping,enraged,shieldUp}, parts:[{id,seed,species,stage,hp,maxHp,downed,name,house}], recent, next:{seed}}
    function render(view, dt) {
      const now = performance.now();
      const T = now - t0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, W, H);
      // floor
      ctx.fillStyle = 'rgba(255,255,255,.03)';
      ctx.beginPath(); ctx.ellipse(W / 2, H * 0.62, W * 0.42, H * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.stroke();
      const phase = view.phase;
      const bossSeed = view.boss ? view.boss.seed : view.next ? view.next.seed : 'nobody';
      const bs = Math.max(3, Math.min(7, Math.round(Math.min(W, H) / 95)));
      const breathe = Math.floor(T / 700) % 2;
      const bsp = sprite('boss:' + bossSeed, null, 3, { boss: true, stage: 3, anim: view.boss && bossHurt > 0.4 ? 'hurt' : 'idle', frame: breathe, scale: bs });
      const bx = W / 2 - bsp.width / 2, by = H * 0.40 - bsp.height / 2 + (view.boss && view.boss.sleeping ? 6 : 0);
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(W / 2, by + bsp.height - 4, bsp.width * 0.42, bs * 3, 0, 0, Math.PI * 2); ctx.fill();
      if (phase === 'idle' || phase === 'countdown' && !view.boss) {
        // silhouette
        ctx.save(); ctx.globalAlpha = 0.92; ctx.filter = 'brightness(0.12) contrast(1.2)'; ctx.drawImage(bsp, bx, by); ctx.restore();
        ctx.save(); ctx.globalAlpha = 0.25 + 0.15 * Math.sin(T / 400); ctx.filter = 'brightness(0.4)'; ctx.drawImage(bsp, bx, by); ctx.restore();
      } else {
        if (view.boss && view.boss.enraged) { ctx.save(); ctx.shadowColor = '#ff3b1f'; ctx.shadowBlur = 30; ctx.drawImage(bsp, bx, by); ctx.restore(); }
        else ctx.drawImage(bsp, bx, by);
        if (view.boss && view.boss.enraged) { ctx.save(); ctx.globalAlpha = 0.25; ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = '#ff3b1f'; ctx.fillRect(bx, by, bsp.width, bsp.height); ctx.restore(); }
        if (view.boss && view.boss.shieldUp) { ctx.strokeStyle = 'rgba(91,168,255,.7)'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -T / 30; ctx.beginPath(); ctx.ellipse(W / 2, by + bsp.height / 2, bsp.width * 0.62, bsp.height * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        if (view.boss && view.boss.sleeping) { ctx.font = `${bs * 4}px Silkscreen, monospace`; ctx.fillStyle = '#9fd3e6'; ctx.textAlign = 'left'; const zz = Math.floor(T / 500) % 3; ctx.fillText('z'.repeat(zz + 1), bx + bsp.width * 0.8, by + 10 - zz * 6); }
        ctx.font = `${Math.max(10, bs * 2.2)}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(234,227,207,.75)';
        if (view.boss) ctx.fillText(view.boss.name, W / 2, by + bsp.height + 18);
      }
      bossHurt = Math.max(0, bossHurt - dt / 110);
      // creatures
      const parts = view.parts || [];
      const pos = layout(parts);
      const cs = Math.max(1, Math.min(3, Math.round(Math.min(W, H) / 260)));
      const order = parts.map((p, i) => i).sort((a, b) => pos[a].y - pos[b].y);
      for (const i of order) {
        const p = parts[i], f = fx.get(p.id) || {};
        f.lunge = Math.max(0, (f.lunge || 0) - dt / 320); f.hurt = Math.max(0, (f.hurt || 0) - dt / 260);
        fx.set(p.id, f);
        const lunge = f.lunge > 0 ? Math.sin(f.lunge * Math.PI) : 0;
        const dx = (W / 2 - pos[i].x), dy = (H * 0.40 - pos[i].y);
        const len = Math.hypot(dx, dy) || 1;
        const x = pos[i].x + (dx / len) * lunge * 26, y = pos[i].y + (dy / len) * lunge * 26;
        const anim = p.downed ? 'idle' : f.hurt > 0.4 ? 'hurt' : lunge > 0.3 ? 'attack' : 'idle';
        const sp = sprite(p.seed || 'x', p.species, p.stage || 1, { stage: p.stage || 1, anim, frame: Math.floor((T + i * 137) / 650) % 2, scale: cs });
        ctx.save();
        if (p.downed) { ctx.globalAlpha = 0.35; ctx.translate(x, y); ctx.rotate(Math.PI / 2 * 0.9); ctx.drawImage(sp, -sp.width / 2, -sp.height / 2); }
        else { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + sp.height / 2 - 2, sp.width * 0.32, cs * 2, 0, 0, Math.PI * 2); ctx.fill(); if (x > W / 2) { ctx.translate(x + sp.width / 2, y - sp.height / 2); ctx.scale(-1, 1); ctx.drawImage(sp, 0, 0); } else ctx.drawImage(sp, x - sp.width / 2, y - sp.height / 2); }
        ctx.restore();
        // mini hp
        if (!p.downed && p.maxHp > 1) { const w = Math.max(18, sp.width * 0.8); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - w / 2, y + sp.height / 2 + 3, w, 3); ctx.fillStyle = p.hp / p.maxHp > 0.4 ? '#7ad08a' : '#ff7a45'; ctx.fillRect(x - w / 2, y + sp.height / 2 + 3, w * (p.hp / p.maxHp), 3); }
        ctx.font = `${Math.max(9, cs * 4)}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.fillStyle = p.house ? 'rgba(234,227,207,.5)' : '#eae3cf';
        ctx.fillText(p.name, x, y + sp.height / 2 + 15);
        p._x = x; p._y = y - sp.height / 2;
      }
      // numbers
      ctx.font = `${Math.max(11, cs * 5)}px Silkscreen, monospace`; ctx.textAlign = 'center';
      for (let i = numbers.length - 1; i >= 0; i--) {
        const n = numbers[i]; n.age += dt;
        if (n.age > 1100) { numbers.splice(i, 1); continue; }
        const a = 1 - n.age / 1100;
        let x, y;
        if (n.boss) { x = W / 2 + n.ox; y = by + bsp.height * 0.45 + n.oy - n.age / 14; }
        else { const p = parts.find((q) => q.id === n.id); if (!p || p._x == null) { numbers.splice(i, 1); continue; } x = p._x; y = p._y - 6 - n.age / 18; }
        ctx.globalAlpha = a; ctx.fillStyle = '#000'; ctx.fillText(n.text, x + 1, y + 1); ctx.fillStyle = n.color; ctx.fillText(n.text, x, y); ctx.globalAlpha = 1;
      }
      if (numbers.length > 60) numbers.splice(0, numbers.length - 60);
    }
    return { render, ingest, reset, cheerFx, stats: () => ({ spawned, numbers: numbers.length, lastTick }) };
  }
  window.ArenaRenderer = ArenaRenderer;
})();
