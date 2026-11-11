/* =========================================================
   KERIGAMES — diák profil
   Belépés: STUDENT_AUTH (Google, @keri.mako.hu)
   Adat: POST /api/profile
   ========================================================= */
(function () {
  'use strict';

  var MONTHS = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
  var DAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
  var STATUS = {
    pending: { label: 'Jóváhagyásra vár', cls: 'warn' },
    approved: { label: 'Jóváhagyva', cls: 'ok' },
    rejected: { label: 'Elutasítva', cls: 'bad' }
  };
  var MATCH_STATUS = { scheduled: 'Kiírva', done: 'Lejátszva', 'no-show': 'Nem jelent meg' };

  var state = { session: null, data: null };

  function $(s) { return document.querySelector(s); }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function parts(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 ? p : null;
  }

  function fmtDate(iso) {
    var p = parts(iso);
    if (!p) return esc(iso || '—');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return p[0] + '. ' + MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) + '. · ' + DAYS[d.getDay()];
  }

  function fmtShort(iso) {
    var p = parts(iso);
    if (!p) return esc(iso || '—');
    return Number(p[2]) + '. ' + MONTHS[Number(p[1]) - 1];
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function nowDate() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function nowTime() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function hint(el, msg, isError) {
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('is-error');
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle('is-error', !!isError);
  }

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.json().then(function (json) {
        return { ok: res.ok, status: res.status, body: json || {} };
      });
    });
  }

  /* ---------------- megjelenítés ---------------- */

  function chips(list) {
    var items = list.filter(Boolean);
    if (!items.length) return '';
    return '<div class="pf-chips">' + items.join('') + '</div>';
  }

  function teamCard(t, meQuery) {
    var st = STATUS[t.status] || STATUS.pending;

    var roster = (t.players || []).map(function (p, i) {
      var me = String(p || '').trim().toLowerCase() === meQuery;
      return '<li' + (me ? ' class="is-me"' : '') + '>' +
        '<span class="pf-num">' + (i + 1) + '</span>' +
        '<b>' + esc(p) + '</b>' +
        (me ? '<em>te</em>' : '') +
      '</li>';
    }).join('');

    var standing = t.standing
      ? '<div class="pf-chips">' +
          '<span class="pf-chip strong">' + t.standing.pos + '. hely</span>' +
          '<span class="pf-chip">' + t.standing.wins + ' győzelem</span>' +
          '<span class="pf-chip">' + t.standing.losses + ' vereség</span>' +
          '<span class="pf-chip">' + t.standing.points + ' pont</span>' +
        '</div>'
      : '<p class="pf-empty-sm">A tabellán a nevezés jóváhagyása után jelenik meg.</p>';

    return '<div class="pf-team-top">' +
        '<div>' +
          '<span class="pf-tag">' + esc(t.short || t.game || 'Csapat') + '</span>' +
          '<h2>' + esc(t.name) + '</h2>' +
          '<p class="pf-sub">Kapitány: ' + esc(t.captain || '—') +
            (t.teacher ? ' · Tanár: ' + esc(t.teacher) : '') +
          '</p>' +
        '</div>' +
        '<span class="pf-badge ' + st.cls + '">' + st.label + '</span>' +
      '</div>' +
      (t.status === 'rejected' && t.rejectReason
        ? '<p class="pf-reason">Indok: ' + esc(t.rejectReason) + '</p>'
        : '') +
      standing +
      (roster ? '<ul class="pf-roster">' + roster + '</ul>' : '');
  }

  function allMatches(teams) {
    var out = [];
    teams.forEach(function (t) {
      (t.matches || []).forEach(function (m) { out.push(m); });
    });
    return out;
  }

  function nextCard(teams) {
    var list = allMatches(teams);
    var now = nowDate() + nowTime();

    var upcoming = list.filter(function (m) {
      return m.status === 'scheduled' && (String(m.date) + (m.time || '00:00')) >= now;
    }).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });

    if (upcoming.length) return renderNext(upcoming[0], 'Következő meccsem');

    var played = list.filter(function (m) { return m.status !== 'scheduled'; })
      .sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });

    if (played.length) return renderNext(played[0], 'Utolsó meccsem');

    return '<h2>Következő meccs</h2>' +
      '<p class="pf-empty">Még nincs kiírt meccsed. A fordulók beosztása hamarosan érkezik — addig a naptárban látod a napokat.</p>';
  }

  function renderNext(m, label) {
    var done = m.status === 'done' || m.status === 'no-show';
    return '<span class="pf-eyebrow">' + label + '</span>' +
      '<h2 class="pf-next-title">' + esc(m.opponent || '?') + '</h2>' +
      '<p class="pf-next-when">' + fmtDate(m.date) + ' · ' + esc(m.time || '') + '</p>' +
      chips([
        '<span class="pf-chip">' + (m.home ? 'hazai' : 'vendég') + '</span>',
        m.round ? '<span class="pf-chip">' + m.round + '. forduló</span>' : '',
        m.room ? '<span class="pf-chip">' + esc(m.room) + '</span>' : '',
        done && m.score ? '<span class="pf-chip strong">' + esc(m.score) + '</span>' : ''
      ]) +
      (done ? '' : '<p class="pf-empty-sm">' + (MATCH_STATUS[m.status] || 'Kiírva') + ' · a mérkőzést a tanár indítja a helyszínen.</p>');
  }

  function matchRow(m) {
    var done = m.status === 'done' || m.status === 'no-show';
    var score = done ? (m.score || '—') : (MATCH_STATUS[m.status] || 'Kiírva');
    return '<div class="pf-match">' +
      '<div class="pf-when"><b>' + fmtShort(m.date) + '</b><span>' + esc(m.time || '') + '</span></div>' +
      '<div class="pf-opp"><b>' + esc(m.opponent || '?') + '</b><span>' +
        (m.home ? 'hazai' : 'vendég') +
        (m.round ? ' · ' + m.round + '. forduló' : '') +
        (m.room ? ' · ' + esc(m.room) : '') +
      '</span></div>' +
      '<div class="pf-score' + (done ? ' is-done' : '') + '">' + esc(score) + '</div>' +
    '</div>';
  }

  function registrationRow(t) {
    var st = STATUS[t.status] || STATUS.pending;
    return '<div class="pf-reg">' +
      '<div><b>' + esc(t.name) + '</b>' +
        '<span class="pf-reg-sub">' + esc(t.game || '') + (t.short ? ' · ' + esc(t.short) : '') + '</span>' +
      '</div>' +
      '<span class="pf-badge ' + st.cls + '">' + st.label + '</span>' +
      '<span class="pf-reg-meta">' + (t.createdAt ? fmtShort(t.createdAt) : '—') + '</span>' +
      (t.status === 'rejected' && t.rejectReason
        ? '<p class="pf-reason">Indok: ' + esc(t.rejectReason) + '</p>'
        : '') +
    '</div>';
  }

  function render(data) {
    var teams = data.teams || [];
    var meQuery = String(data.query || '').trim().toLowerCase();
    var captain = teams.some(function (t) { return t.isCaptain; });

    $('#pfEyebrow').textContent = captain ? 'Kapitány profil' : 'Diák profil';
    $('#pfHello').textContent = 'Szia' + (captain ? ' kapitány' : '') + '!';
    $('#pfWho').textContent = teams.map(function (t) {
      return t.name + (t.game ? ' · ' + t.game : '');
    }).join('  ·  ');

    $('#pfTeam').innerHTML = '<div class="pf-card-head"><h2>Saját csapat</h2>' +
      '<span class="pf-note">' + (teams.length > 1 ? teams.length + ' nevezés' : '') + '</span></div>' +
      teams.map(function (t) { return teamCard(t, meQuery); }).join('<div class="pf-sep"></div>');

    $('#pfNext').innerHTML = nextCard(teams);

    $('#pfRegs').innerHTML = teams.map(registrationRow).join('');
    $('#pfRegNote').textContent = teams.length + ' nevezés';

    var list = allMatches(teams);
    var now = nowDate() + nowTime();
    var upcoming = list.filter(function (m) {
      return m.status === 'scheduled' && (String(m.date) + (m.time || '00:00')) >= now;
    }).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    var past = list.filter(function (m) {
      return !(m.status === 'scheduled' && (String(m.date) + (m.time || '00:00')) >= now);
    }).sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });

    var html = '';
    if (upcoming.length) html += '<span class="pf-section-label">Következnek</span>' + upcoming.map(matchRow).join('');
    if (past.length) html += '<span class="pf-section-label">Korábbi meccsek</span>' + past.map(matchRow).join('');
    if (!list.length) {
      html = '<p class="pf-empty">Még nincs mérkőzés a csapatodhoz. Ha a fordulók beosztása elkészül, itt jelenik meg.</p>';
    }
    $('#pfMatches').innerHTML = html;
    $('#pfMatchNote').textContent = list.length ? list.length + ' meccs' : '';

    state.query = data.query;
    renderStats(data);
    renderVote(data.votes || { options: [], total: 0, mine: '' });
    renderSeek(data);
    renderSwap(data);

    var ics = $('#pfIcs');
    if (ics && data.icsUrl) ics.href = data.icsUrl;

    document.title = 'KERIGAMES — ' + teams[0].name;
  }

  /* ---------------- visszajelzés és újratöltés ---------------- */
  var toastTimer = null;

  function showToast(msg, isError) {
    var el = $('#pfToast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    el.classList.toggle('is-error', !!isError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3600);
  }

  function identityQuery() {
    if (state.query) return state.query;
    if (state.session && state.session.email) {
      return STUDENT_AUTH.nameFor(state.session.email) || state.session.email;
    }
    return '';
  }

  function loadIntoView() {
    var q = identityQuery();
    if (!q) return Promise.resolve();
    return fetchProfile(q).then(function (res) {
      if (res.ok) { state.data = res.data; render(res.data); }
      return res;
    });
  }

  /* ---------------- statisztika és megosztható kártya ---------------- */
  function renderStats(data) {
    var host = $('#pfStats');
    if (!host) return;

    var blocks = (data.stats || []).map(function (s) {
      var st = s.stats || {};
      var badges = (st.badges || []).map(function (b) {
        return '<span class="pf-badge-pill">' + esc(b.icon || '◆') + ' ' + esc(b.label) + '</span>';
      }).join('');

      return '<div class="pf-card-head"><h2>' + esc(s.name) + ' · statisztika</h2>' +
          '<button type="button" class="pf-ghost pf-ghost--sm" data-share="' + esc(s.id) + '">Kártya mentése</button></div>' +
        '<div class="pf-stats">' +
          '<div class="pf-stat"><b>' + (st.played || 0) + '</b><span>meccs</span></div>' +
          '<div class="pf-stat"><b>' + (st.wins || 0) + '</b><span>győzelem</span></div>' +
          '<div class="pf-stat"><b>' + (st.losses || 0) + '</b><span>vereség</span></div>' +
          '<div class="pf-stat"><b>' + (st.rate || 0) + '%</b><span>győzelmi arány</span></div>' +
          '<div class="pf-stat"><b>' + (st.streak || 0) + '</b><span>sorozat</span></div>' +
        '</div>' +
        (badges
          ? '<div class="pf-badges">' + badges + '</div>'
          : '<p class="pf-empty-sm">A statisztika az első lejátszott meccs után indul.</p>');
    }).join('<div class="pf-sep"></div>');

    host.innerHTML = blocks || '<h2>Statisztika</h2><p class="pf-empty">Még nincs meccs, amiből statisztika készülhetne.</p>';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var words = String(text || '').split(' ');
    var line = '';
    var curY = y;
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, curY);
        line = w;
        curY += lineHeight;
      } else {
        line = test;
      }
    });
    if (line) ctx.fillText(line, x, curY);
  }

  function shareTeam(id) {
    var entry = ((state.data && state.data.stats) || []).find(function (s) { return s.id === id; });
    if (!entry) return;
    var st = entry.stats || {};

    var c = document.createElement('canvas');
    c.width = 900;
    c.height = 1200;
    var x = c.getContext('2d');

    var g = x.createLinearGradient(0, 0, 900, 1200);
    g.addColorStop(0, '#0b1224');
    g.addColorStop(0.5, '#14305c');
    g.addColorStop(1, '#0a1020');
    x.fillStyle = g;
    x.fillRect(0, 0, 900, 1200);

    var rg = x.createRadialGradient(180, 120, 30, 180, 120, 760);
    rg.addColorStop(0, 'rgba(79,124,255,.45)');
    rg.addColorStop(1, 'rgba(79,124,255,0)');
    x.fillStyle = rg;
    x.fillRect(0, 0, 900, 760);

    x.fillStyle = 'rgba(200,220,255,.8)';
    x.font = '600 24px Inter, Arial, sans-serif';
    x.fillText('KERI ESPORT KUPA · 2026/27', 64, 104);

    x.fillStyle = '#fff';
    x.font = '700 72px "Clash Display", Inter, Arial, sans-serif';
    wrapText(x, entry.name, 64, 240, 780, 82);

    x.fillStyle = 'rgba(159,192,255,.95)';
    x.font = '600 28px Inter, Arial, sans-serif';
    x.fillText('Csapatkártya', 64, 360);

    var items = [
      [st.played || 0, 'meccs'],
      [st.wins || 0, 'győzelem'],
      [st.losses || 0, 'vereség'],
      [(st.rate || 0) + '%', 'győzelmi arány']
    ];
    items.forEach(function (it, i) {
      var px = 64 + (i % 2) * 404;
      var py = 430 + Math.floor(i / 2) * 158;
      x.fillStyle = 'rgba(255,255,255,.07)';
      roundRect(x, px, py, 372, 128, 24);
      x.fill();
      x.fillStyle = '#fff';
      x.font = '700 52px Inter, Arial, sans-serif';
      x.fillText(String(it[0]), px + 28, py + 74);
      x.fillStyle = 'rgba(163,178,205,.95)';
      x.font = '500 22px Inter, Arial, sans-serif';
      x.fillText(it[1], px + 28, py + 106);
    });

    var by = 780;
    (st.badges || []).slice(0, 4).forEach(function (b, i) {
      var yy = by + i * 62;
      x.fillStyle = 'rgba(255,255,255,.08)';
      roundRect(x, 64, yy, 772, 50, 16);
      x.fill();
      x.fillStyle = '#dfe9ff';
      x.font = '600 24px Inter, Arial, sans-serif';
      x.fillText(String(b.icon || '◆') + '   ' + b.label, 88, yy + 33);
    });

    x.fillStyle = 'rgba(163,178,205,.7)';
    x.font = '500 22px Inter, Arial, sans-serif';
    x.fillText('kerigames · 304-es terem', 64, 1148);

    c.toBlob(function (blob) {
      if (!blob) { showToast('A kártya mentése nem sikerült.', true); return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kerigames-' + String(entry.name).toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
      showToast('Kártya mentve.');
    }, 'image/png');
  }

  /* ---------------- szavazás ---------------- */
  function renderVote(v) {
    var host = $('#pfVote');
    if (!host) return;
    var total = Math.max(1, v.total || 0);

    host.innerHTML = '<div class="pf-card-head"><h2>Melyik játék induljon?</h2>' +
        '<span class="pf-note">' + (v.total || 0) + ' szavazat</span></div>' +
      '<div class="pf-vote">' +
        (v.options || []).map(function (o) {
          var pct = Math.round((o.votes / total) * 100);
          return '<button type="button" class="pf-vote-item' + (v.mine === o.game ? ' is-mine' : '') + '" data-vote="' + esc(o.game) + '">' +
            '<span class="pf-vote-label">' + esc(o.label) + '</span>' +
            '<span class="pf-vote-bar"><i style="width:' + pct + '%"></i></span>' +
            '<span class="pf-vote-count">' + o.votes + '</span>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<p class="pf-empty-sm">' +
        (v.mine ? 'A szavazatod rögzítve — bármikor módosíthatod.' : 'Egy szavazatod van; kattints arra, amelyiket látnád szívesen.') +
      '</p>';
  }

  function castVote(game) {
    var q = identityQuery();
    if (!q) { showToast('Előbb lépj be.', true); return; }
    post('/api/vote', { query: q, game: game }).then(function (res) {
      if (!res.ok) throw new Error((res.body && res.body.error) || 'Nem sikerült szavazni.');
      if (state.data) { state.data.votes = res.body.votes; renderVote(res.body.votes); }
      showToast('Szavazat rögzítve.');
    }).catch(function (err) { showToast(err.message, true); });
  }

  /* ---------------- csapatkereső ---------------- */
  function renderSeek(data) {
    var host = $('#pfSeek');
    if (!host) return;

    var captainTeam = (data.teams || []).find(function (t) {
      return t.isCaptain && t.status === 'approved';
    });

    var ads = (data.seekers || []).map(function (s) {
      return '<div class="pf-ad' + (s.mine ? ' is-mine' : '') + '">' +
        '<div class="pf-ad-main">' +
          '<b>' + esc(s.teamName) + '</b>' +
          '<span class="pf-tag">' + esc(s.game || '') + '</span>' +
          '<span class="pf-ad-need">' + s.needed + ' játékos kell</span>' +
          (s.note ? '<p class="pf-ad-note">' + esc(s.note) + '</p>' : '') +
          '<span class="pf-ad-meta">' + esc(s.contact || '') + ' · ' + fmtShort(s.createdAt) + '</span>' +
        '</div>' +
        (s.mine ? '<button type="button" class="pf-ghost pf-ghost--sm" data-close-ad="' + esc(s.id) + '">Lezárás</button>' : '') +
      '</div>';
    }).join('');

    host.innerHTML = '<div class="pf-card-head"><h2>Csapatkereső</h2>' +
        '<span class="pf-note">' + (data.seekers || []).length + ' hirdetés</span></div>' +
      (captainTeam
        ? '<form class="pf-form pf-form--tight" id="pfSeekForm">' +
            '<select class="pf-input" id="pfSeekNeed" aria-label="Hány játékos kell">' +
              '<option value="1">1 játékos kell</option>' +
              '<option value="2">2 játékos kell</option>' +
              '<option value="3">3 játékos kell</option>' +
            '</select>' +
            '<input class="pf-input" id="pfSeekNote" maxlength="160" placeholder="Pl. support posztra, hétfő délután">' +
            '<button class="btn-primary" type="submit">Hirdetés</button>' +
          '</form>'
        : '<p class="pf-empty-sm">Hirdetést csak jóváhagyott csapat kapitánya adhat fel.</p>') +
      (ads || '<p class="pf-empty-sm">Most nincs nyitott hirdetés.</p>');
  }

  function createAd(form) {
    var needed = Number((form.querySelector('#pfSeekNeed') || {}).value || 1);
    var note = ((form.querySelector('#pfSeekNote') || {}).value || '').trim();
    post('/api/seeking', { query: identityQuery(), needed: needed, note: note }).then(function (res) {
      if (!res.ok) throw new Error((res.body && res.body.error) || 'Nem sikerült a hirdetés.');
      showToast('Hirdetés feladva.');
      return loadIntoView();
    }).catch(function (err) { showToast(err.message, true); });
  }

  function closeAd(id) {
    post('/api/seeking/' + encodeURIComponent(id) + '/close', { query: identityQuery() }).then(function (res) {
      if (!res.ok) throw new Error((res.body && res.body.error) || 'Nem sikerült lezárni.');
      showToast('Hirdetés lezárva.');
      return loadIntoView();
    }).catch(function (err) { showToast(err.message, true); });
  }

  /* ---------------- játékoscsere ---------------- */
  function renderSwap(data) {
    var host = $('#pfSwap');
    if (!host) return;

    var captainTeam = (data.teams || []).find(function (t) {
      return t.isCaptain && t.status === 'approved';
    });
    var list = data.requests || [];

    host.hidden = !captainTeam && !list.length;
    if (host.hidden) return;

    var pending = list.some(function (r) { return r.status === 'pending'; });
    var rows = list.map(function (r) {
      var label = r.status === 'approved' ? 'Jóváhagyva' : r.status === 'rejected' ? 'Elutasítva' : 'Függőben';
      var cls = r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'bad' : 'warn';
      return '<div class="pf-ad">' +
        '<div class="pf-ad-main"><b>' + esc(r.outPlayer) + ' → ' + esc(r.inPlayer) + '</b>' +
          (r.note ? '<p class="pf-ad-note">' + esc(r.note) + '</p>' : '') +
          '<span class="pf-ad-meta">' + fmtShort(r.createdAt) + '</span></div>' +
        '<span class="pf-badge ' + cls + '">' + label + '</span>' +
      '</div>';
    }).join('');

    host.innerHTML = '<div class="pf-card-head"><h2>Játékoscsere</h2>' +
        '<span class="pf-note">a tanár hagyja jóvá</span></div>' +
      (captainTeam && !pending
        ? '<form class="pf-form pf-form--tight" id="pfSwapForm">' +
            '<select class="pf-input" id="pfSwapOut" aria-label="Kimenő játékos">' +
              (captainTeam.players || []).map(function (p) {
                return '<option value="' + esc(p) + '">' + esc(p) + '</option>';
              }).join('') +
            '</select>' +
            '<input class="pf-input" id="pfSwapIn" maxlength="50" placeholder="Új játékos neve">' +
            '<input class="pf-input" id="pfSwapNote" maxlength="160" placeholder="Indok (nem kötelező)">' +
            '<button class="btn-primary" type="submit">Csere kérése</button>' +
          '</form>'
        : '') +
      (pending ? '<p class="pf-empty-sm">Függő cserekérelem — a tanár döntésére vár.</p>' : '') +
      (rows || '');
  }

  function createSwap(form) {
    var outPlayer = (form.querySelector('#pfSwapOut') || {}).value || '';
    var inPlayer = ((form.querySelector('#pfSwapIn') || {}).value || '').trim();
    var note = ((form.querySelector('#pfSwapNote') || {}).value || '').trim();

    if (inPlayer.length < 3) { showToast('Add meg az új játékos nevét.', true); return; }

    post('/api/requests', { query: identityQuery(), outPlayer: outPlayer, inPlayer: inPlayer, note: note })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'Nem sikerült a kérés.');
        showToast('Cserekérelem elküldve a tanárnak.');
        return loadIntoView();
      }).catch(function (err) { showToast(err.message, true); });
  }

  /* ---------------- képernyők ---------------- */
  function showGate() {
    $('#pfProfile').hidden = true;
    $('#pfNoTeam').hidden = true;
    $('#pfGate').hidden = false;
    document.title = 'KERIGAMES — Profil';
  }

  function showProfile() {
    $('#pfGate').hidden = true;
    $('#pfNoTeam').hidden = true;
    $('#pfProfile').hidden = false;
  }

  function showNoTeam(email) {
    $('#pfGate').hidden = true;
    $('#pfProfile').hidden = true;
    $('#pfNoTeam').hidden = false;
    var el = $('#pfNoTeamEmail');
    if (el) el.textContent = email || '';
    hint($('#pfLinkHint'), '', false);
    fillNames();   /* közben nevezett csapatok is bekerüljenek a listába */
    document.title = 'KERIGAMES — Profil';
  }

  function fetchProfile(query) {
    return post('/api/profile', { query: query }).then(function (res) {
      if (res.ok) return { ok: true, data: res.body };
      return { ok: false, status: res.status, error: (res.body && res.body.error) || 'Nem sikerült betölteni a profilt.' };
    });
  }

  function openProfile(query, missHandler) {
    return fetchProfile(query).then(function (res) {
      if (res.ok) {
        state.data = res.data;
        showProfile();
        render(res.data);
      } else if (missHandler) {
        missHandler(res);
      }
      return res;
    }).catch(function () {
      hint($('#pfAuthMsg'), 'A szerver nem érhető el — indítsd el az „npm start" paranccsal.', true);
      return { ok: false, error: 'offline' };
    });
  }

  /* ---------------- belépés ---------------- */
  function onIdentity(session) {
    state.session = session;

    var who = $('#pfWhoEmail');
    if (!session) {
      state.data = null;
      if (who) who.textContent = '';
      showGate();
      return;
    }

    if (who) who.textContent = session.email + (session.mode === 'demo' ? ' · demó belépés' : '');

    var linked = STUDENT_AUTH.nameFor(session.email);
    openProfile(linked || session.email, function (res) {
      if (res.status === 404) {
        showNoTeam(session.email);
      } else {
        hint($('#pfAuthMsg'), res.error, true);
      }
    });
  }

  /* ---------------- névjavaslatok ---------------- */
  function rosterNames(teams) {
    var names = [];
    (teams || []).forEach(function (t) {
      (t.players || []).forEach(function (p) {
        var n = String(p || '').trim();
        if (n && names.indexOf(n) === -1) names.push(n);
      });
    });
    return names.sort(function (a, b) { return a.localeCompare(b, 'hu'); });
  }

  function fillNames() {
    return fetch('/api/site', { cache: 'no-store' }).then(function (r) {
      return r.json();
    }).then(function (v) {
      var names = rosterNames(v.teams);

      var dl = $('#pfNames');
      if (dl) {
        dl.innerHTML = names.map(function (n) {
          return '<option value="' + esc(n) + '"></option>';
        }).join('');
      }

      /* a fiókhoz kötéshez csak valóban létező nevek választhatók */
      var sel = $('#pfLinkName');
      if (sel) {
        sel.innerHTML = '<option value="">Válaszd ki a neved…</option>' +
          names.map(function (n) {
            return '<option value="' + esc(n) + '">' + esc(n) + '</option>';
          }).join('');
      }

      var hasTeams = (v.teams || []).length > 0;
      var form = $('#pfLinkForm');
      var empty = $('#pfNoTeamEmpty');
      if (form) form.hidden = !(hasTeams && names.length);
      if (empty) empty.hidden = !!(hasTeams && names.length);
    }).catch(function () {});
  }

  /* ---------------- indítás ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    fillNames();

    /* a dinamikusan rajzolt kártyák kezelői */
    document.addEventListener('click', function (e) {
      var vote = e.target.closest('[data-vote]');
      if (vote) { castVote(vote.getAttribute('data-vote')); return; }
      var share = e.target.closest('[data-share]');
      if (share) { shareTeam(share.getAttribute('data-share')); return; }
      var close = e.target.closest('[data-close-ad]');
      if (close) { closeAd(close.getAttribute('data-close-ad')); return; }
    });

    document.addEventListener('submit', function (e) {
      if (e.target.id === 'pfSeekForm') { e.preventDefault(); createAd(e.target); }
      else if (e.target.id === 'pfSwapForm') { e.preventDefault(); createSwap(e.target); }
    });

    /* a korábbi (névalapú) profil-kulcs már nem kell */
    try { localStorage.removeItem('keri_profile_query'); } catch (e) {}

    STUDENT_AUTH.init({ onAuth: onIdentity });

    /* ha nincs csapat: a név egyszeri hozzákötése */
    var linkForm = $('#pfLinkForm');
    if (linkForm) {
      linkForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = $('#pfLinkName').value.trim();
        if (name.length < 3) { hint($('#pfLinkHint'), 'Válaszd ki a neved a listából.', true); return; }
        hint($('#pfLinkHint'), '', false);
        openProfile(name, function () {
          hint($('#pfLinkHint'), 'Ezt a nevet nem találom a nevezésekben. Kérdezd meg a kapitányt, milyen néven neveztetek.', true);
        }).then(function (res) {
          if (res.ok && state.session && state.session.email) {
            STUDENT_AUTH.setName(state.session.email, name);
          }
        });
      });
    }

    /* kilépés / vissza a belépőhöz */
    var sw = $('#pfSwitch');
    if (sw) {
      sw.addEventListener('click', function () {
        if (state.session && state.session.mode !== 'manual') {
          STUDENT_AUTH.signOut();
        } else {
          state.session = null;
          state.data = null;
          showGate();
        }
      });
    }

    /* tartalék: névvel vagy e-maillel keresés (ha a Google nincs beállítva) */
    var toggle = $('#pfManualToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var form = $('#pfForm');
        form.hidden = !form.hidden;
        if (!form.hidden) $('#pfQuery').focus();
      });
    }

    var form = $('#pfForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var q = $('#pfQuery').value.trim();
        if (q.length < 3) { hint($('#pfHint'), 'Adj meg legalább 3 karaktert (e-mail vagy név).', true); return; }
        hint($('#pfHint'), '', false);
        openProfile(q, function (res) {
          hint($('#pfHint'), res.error, true);
        }).then(function (res) {
          if (res.ok) {
            state.session = { mode: 'manual', email: '' };
            var who = $('#pfWhoEmail');
            if (who) who.textContent = 'Név szerinti profil';
          }
        });
      });
    }
  });
})();
