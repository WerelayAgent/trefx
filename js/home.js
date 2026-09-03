/* trefx landing page: agent activity ledger + hatched creatures. */
(function () {
  'use strict';
  const { $, esc, spriteEl, spriteCanvas, fmtAgo, fmtEta, tickerFrom, connectState, mountChrome } = window.TLU;
  mountChrome('/');

  const X_SVG = '<svg class="xicon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
  const xPost = (url, label) => url ? `<a class="xlink" href="${esc(url)}" target="_blank" rel="noopener">${X_SVG}${label}</a>` : '';
  const xUser = (u) => `<a href="https://x.com/${esc(u)}" target="_blank" rel="noopener">@${esc(u)} ${X_SVG}</a>`;

  // fallback avatar: a little pixel sprite seeded from the username
  function avatarEl(url, seedName) {
    if (url) return `<img class="avatar" src="${esc(url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
    return `<span class="avatar pix" data-avseed="${esc(seedName)}"></span>`;
  }
  function fillPixAvatars(root) {
    (root || document).querySelectorAll('.avatar.pix[data-avseed]').forEach((el) => {
      const c = spriteCanvas(el.dataset.avseed, null, 1, { scale: 2 });
      c.style.width = '100%'; c.style.height = '100%'; c.className = '';
      el.appendChild(c); el.removeAttribute('data-avseed');
    });
  }

  // ---------- activity ----------
  async function loadActivity() {
    try {
      const a = await (await fetch('/api/activity?limit=25')).json();
      $('#stReplies').textContent = a.replies;
      $('#actMode').innerHTML = a.mode === 'live'
        ? '<span class="badge live">live on x</span> polling mentions every minute'
        : '<span class="badge">mock mode</span> no x keys set, replies are simulated';
      const rows = (a.activity || []).map((r) => {
        const said = r.replyText && !r.replyText.startsWith('[FAILED]') ? r.replyText : null;
        return `<div class="actrow">
          ${avatarEl(r.profileImageUrl, r.username || '?')}
          <div>
            <div class="who">
              <b>${r.live && r.username ? xUser(r.username) : '@' + esc(r.username || '?')}</b>
              <span class="cmd">${esc(r.kind === 'card' ? r.command + ' card' : r.command)}</span>
              <span class="ago">${fmtAgo(r.createdAt)} ago</span>
              ${r.live ? '' : '<span class="badge">sim</span>'}
            </div>
            ${said ? `<div class="said">${esc(said)}</div>` : ''}
          </div>
          <div class="links">${xPost(r.mentionUrl, 'their post')}${xPost(r.replyUrl, 'our reply')}</div>
        </div>`;
      });
      $('#activity').innerHTML = rows.join('') || '<div class="dim mono">nothing yet. the agent is listening. say hatch to @trefxworld and be the first row.</div>';
      fillPixAvatars($('#activity'));
    } catch (e) { $('#activity').innerHTML = '<div class="dim mono">could not load the ledger.</div>'; }
  }

  // ---------- creatures ----------
  async function loadCreatures() {
    try {
      const d = await (await fetch('/api/creatures')).json();
      const all = (d.creatures || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      $('#petCount').textContent = `${d.count} creatures, newest first`;
      const grid = $('#pets');
      grid.innerHTML = all.slice(0, 24).map((c) => `
        <div class="pet-card" data-id="${c.id}" data-seed="${esc(c.seed)}" data-species="${esc(c.species)}" data-stage="${c.stage}">
          <div class="top">
            <span class="spr"></span>
            <div><div class="nm">${esc(c.name)}</div><div class="meta">${esc(c.species)} · stage ${c.stage} · lv ${c.level}</div></div>
          </div>
          <div class="meta">${c.status === 'away' ? 'away in ' + esc(c.zoneLabel || c.zone) : 'home at the village'}</div>
          <div class="ownerline">
            ${c.demo ? '<span>raised by the village (demo)</span>'
              : `${c.profileImageUrl ? `<img src="${esc(c.profileImageUrl)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<span>raised by ${xUser(c.owner)}</span>`}
          </div>
          <div class="foot"><a class="btn small" href="/p/${c.id}">creature page</a><a class="xlink" href="/world?follow=${c.id}">watch it</a></div>
        </div>`).join('');
      grid.querySelectorAll('.pet-card').forEach((el) => {
        el.querySelector('.spr').replaceWith(spriteEl(el.dataset.seed, el.dataset.species, Number(el.dataset.stage), 3));
      });
      // hero: a few idling creatures
      $('#heroPets').innerHTML = '';
      all.slice(0, 4).forEach((c, i) => {
        const s = spriteEl(c.seed, c.species, c.stage, i === 0 ? 4 : 3);
        $('#heroPets').appendChild(s);
      });
    } catch (e) { /* leave placeholders */ }
  }

  // ---------- live state (stats + ticker) ----------
  connectState((s) => {
    $('#stPop').textContent = s.population;
    const r = s.raid || {};
    $('#stRaid').textContent = r.phase === 'fight' ? 'LIVE' : r.phase === 'countdown' ? fmtEta(r.startsAt - s.now) : fmtEta(s.nextRaidAt - s.now);
    tickerFrom(s);
  });

  loadActivity();
  loadCreatures();
  setInterval(loadActivity, 30000);
})();
