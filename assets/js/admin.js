/* =========================================================
   KERIGAMES — szervezői admin (demó, helyi adatokkal)
   Adat: localStorage ('keri_admin_v1') — a Sheet + Apps Script
   később ugyanezt a felületet szolgálja ki.
   ========================================================= */
'use strict';

const LS_KEY = 'keri_admin_v1';
const TODAY = new Date();

/* a nap neve magyarul, rövidítve */
const WEEKDAY = new Intl.DateTimeFormat('hu-HU', { weekday: 'short' });
const MONTHS_HU = ['január','február','március','április','május','június','július','augusztus','szeptember','október','november','december'];

const BAD_WORDS = ['fuck','shit','bitch','kurva','fasz','picsa','geci','basz','segg'];

const ROOMS = ['304-es terem','Emeleti aula','Online (Discord)'];

/* ---------- segédek ---------- */
function $(sel, root){ return (root || document).querySelector(sel); }
function $$(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function esc(v){
  if (v == null) return '';
  return String(v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function pad(n){ return (n < 10 ? '0' : '') + n; }
function todayKey(){
  return TODAY.getFullYear() + '-' + pad(TODAY.getMonth() + 1) + '-' + pad(TODAY.getDate());
}
function fmtDay(dk){
  if (!dk) return '—';
  const d = new Date(dk + 'T00:00:00');
  const wd = isNaN(d) ? '' : WEEKDAY.format(d).replace('.', '');
  return dk.slice(0, 4) + '. ' + dk.slice(5, 7) + '. ' + dk.slice(8, 10) + '.' + (wd ? ' (' + wd + ')' : '');
}
function fmtShort(dk){
  if (!dk) return '—';
  return dk.slice(0, 4) + '.' + dk.slice(5, 7) + '.' + dk.slice(8, 10) + '.';
}
function fmtStamp(iso){
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + '. ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function uid(prefix){
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}
function norm(v){
  return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function hasBadWord(v){
  const low = norm(v);
  return BAD_WORDS.some(w => low.indexOf(w) !== -1);
}

/* ---------- toast ---------- */
function toast(msg, isError){
  const host = $('#admToasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'adm-toast' + (isError ? ' is-error' : '');
  el.setAttribute('role', 'status');
  el.innerHTML = '<i aria-hidden="true">' + (isError ? '!' : '✓') + '</i><span></span>';
  el.lastChild.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 320);
  }, isError ? 4200 : 3000);
}

/* =========================================================
   DEMÓ ADATOK
   ========================================================= */
function seed(){
  const t = (comp, name, captain, players, teacher, klass, status) => ({
    id: uid('t'), comp, name, captain, players, teacher, klass, status,
    createdAt: new Date(TODAY.getTime() - Math.random() * 6 * 864e5).toISOString()
  });
  const m = (comp, round, a, b, date, time, room, bestOf, status, scoreA, scoreB) => ({
    id: uid('m'), comp, round, stage: 'group', a, b, date, time, room, bestOf,
    scoreA: scoreA == null ? '' : scoreA,
    scoreB: scoreB == null ? '' : scoreB,
    status, reportedBy: status === 'done' ? 'tanár' : ''
  });

  const teams = [
    /* CS2 — jóváhagyott */
    t('cs2-2026-27', 'Zöreg SC', 'dani.benedek-2021@keri.mako.hu',
      ['Tóth László Gábor','Dani Benedek','Suba Benjamin','Répa Norbert','Sötét Ármin'],
      'Vidéki Gyula Milán', '13/A', 'approved'),
    t('cs2-2026-27', 'Bűnvadászok', 'knoch.henrik-2021@keri.mako.hu',
      ['Badó-Gulácsi Dániel','Suhajda Ádám Dominik','Herczeg Máté János','Szalontai László','Knoch Henrik'],
      'Vidéki Gyula Milán', '12/B', 'approved'),
    t('cs2-2026-27', 'SprayAndPray', 'raffai.daniel-2024@keri.mako.hu',
      ['Pelle Zalán','Pál Leon','Valentényi Attila Ferenc','Nagy Attila Antal','Raffai Dániel Zsolt'],
      'Sinkovicz Andrea', '11/C', 'approved'),
    t('cs2-2026-27', '240KM/H KERI PEEK', 'farkas.bence-2023@keri.mako.hu',
      ['Farkas Bence','Ádók Patrik','Kiss Attila Sándor','Olasz Balázs','Kovács Krisztián'],
      'Kiss Andrea', '12/A', 'approved'),
    t('cs2-2026-27', "WortexSport's", 'marjai.bence-2024@keri.mako.hu',
      ['Marjai Bence','Kiss Balázs','Török Gergő','Kiss Levente','Juhász Patrik'],
      'Szentirmai Ádám', '11/A', 'approved'),
    t('cs2-2026-27', 'Frázsgáli nyeda', 'gera.bence-2022@keri.mako.hu',
      ['Gera Bence','Haluska Dénes','Borka Bercel','Borka Zsombor','Barta Erik'],
      'Risch Ilona', '13/B', 'approved'),

    /* CS2 — jóváhagyásra vár (szándékosan hibás esetekkel) */
    t('cs2-2026-27', 'V1per team', 'juhasz.patrik-2024@keri.mako.hu',
      ['Juhász Patrik','Kovács Gergő','Varga Zétény','Károly Bendegúz'],
      'Vidéki Gyula Milán', '11/B', 'pending'),
    t('cs2-2026-27', 'Tartalék', 'miklos.martin-2021@keri.mako.hu',
      ['Kis Dávid Csaba','Kulcsár Tamás Ámon','Kardos Zoli','Tokai Ádám','Dani Benedek'],
      'Vidéki Gyula Milán', '13/A', 'pending'),
    t('cs2-2026-27', 'Csipet csapat', 'csipet.kapitany@keri.mako.hu',
      ['Kis(raketa)Csaba','Nagy(Feco)Ferenc','Álmos(célzóvíz)Aurél','Jakob(öcsi)Ákos','Malaj(Hollywood)Zsolt'],
      'Sinkovicz Andrea', '10/D', 'pending'),

    /* FC — 1v1 */
    t('fc26-2026-27', 'Gera Bence', 'gera.bence-2022@keri.mako.hu', ['Gera Bence'], 'Risch Ilona', '13/B', 'approved'),
    t('fc26-2026-27', 'Knoch Henrik', 'knoch.henrik-2021@keri.mako.hu', ['Knoch Henrik'], 'Vidéki Gyula Milán', '12/B', 'approved'),
    t('fc26-2026-27', 'Raffai Dániel', 'raffai.daniel-2024@keri.mako.hu', ['Raffai Dániel Zsolt'], 'Sinkovicz Andrea', '11/C', 'approved'),
    t('fc26-2026-27', 'Pelle Zalán', 'pelle.zalan-2024@keri.mako.hu', ['Pelle Zalán'], 'Sinkovicz Andrea', '11/C', 'pending')
  ];

  const id = name => teams.find(x => x.name === name).id;

  const matches = [
    m('cs2-2026-27', 1, id('Zöreg SC'), id('Bűnvadászok'), '2026-11-09', '14:00', '304-es terem', 1, 'done', 13, 7),
    m('cs2-2026-27', 1, id('SprayAndPray'), id('240KM/H KERI PEEK'), '2026-11-11', '15:30', '304-es terem', 1, 'live', 4, 2),
    m('cs2-2026-27', 2, id("WortexSport's"), id('Frázsgáli nyeda'), '2026-11-18', '14:00', '304-es terem', 1, 'scheduled'),
    m('cs2-2026-27', 2, id('Zöreg SC'), id('SprayAndPray'), '2026-11-18', '15:30', '304-es terem', 1, 'scheduled'),
    m('cs2-2026-27', 3, id('Bűnvadászok'), id("WortexSport's"), '2026-11-25', '14:00', '304-es terem', 1, 'scheduled'),
    m('fc26-2026-27', 1, id('Gera Bence'), id('Knoch Henrik'), '2026-11-12', '14:30', '304-es terem', 1, 'scheduled'),
    m('fc26-2026-27', 1, id('Raffai Dániel'), id('Gera Bence'), '2026-11-12', '15:00', '304-es terem', 1, 'scheduled')
  ];

  return {
    version: 1,
    competitions: [
      { id: 'cs2-2026-27', game: 'Counter-Strike 2', short: 'CS2', label: 'CS2 · 2026/27', teamSize: 5, bestOf: 1, allowDraw: false, state: 'live' },
      { id: 'fc26-2026-27', game: 'EA SPORTS FC', short: 'FC', label: 'FC · 2026/27', teamSize: 1, bestOf: 1, allowDraw: true, state: 'live' },
      { id: 'rl-2026-27', game: 'Rocket League', short: 'RL', label: 'RL · 2026/27', teamSize: 3, bestOf: 3, allowDraw: false, state: 'soon' }
    ],
    teams,
    matches,
    log: [{
      id: uid('l'),
      at: new Date(TODAY.getTime() - 2 * 36e5).toISOString(),
      actor: 'tanár',
      action: 'Demó adatok betöltve',
      detail: '7 mérkőzés, 13 csapat — helyi példaadat'
    }]
  };
}

/* ---------- tárolás (a helyi Node adatkiszolgálón keresztül) ---------- */
let db;
let LAST = { teams: [], matches: [] };   /* a legutóbb a szerverről kapott állapot */
let OFFLINE = false;
/* a naplóban megjelenő személy — a belépett tanár e-mail címe */
let currentActor = 'tanár';

const Api = {
  async req(url, options){
    const res = await fetch(url, Object.assign({
      headers: { 'Content-Type': 'application/json', 'x-admin-actor': currentActor }
    }, options || {}));
    if (!res.ok){
      let msg = res.status + ' ' + res.statusText;
      try { const body = await res.json(); if (body && body.error) msg = body.error; } catch (e) {}
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  },
  state(){ return this.req('/api/state', { cache: 'no-store' }); },
  teamStatus(id, status, reason){
    return this.req('/api/teams/' + encodeURIComponent(id) + '/status', {
      method: 'POST', body: JSON.stringify({ status: status, reason: reason || '' })
    });
  },
  result(id, scoreA, scoreB, noShowSide){
    return this.req('/api/matches/' + encodeURIComponent(id) + '/result', {
      method: 'POST', body: JSON.stringify({ scoreA: scoreA, scoreB: scoreB, noShowSide: noShowSide || null })
    });
  },
  addMatch(match){
    return this.req('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        comp: match.comp, round: match.round, stage: match.stage,
        a: match.a, b: match.b, date: match.date, time: match.time,
        room: match.room, bestOf: match.bestOf
      })
    });
  },
  deleteMatch(id){ return this.req('/api/matches/' + encodeURIComponent(id), { method: 'DELETE' }); },
  requestDecide(id, status, reason){
    return this.req('/api/requests/' + encodeURIComponent(id), {
      method: 'POST', body: JSON.stringify({ status: status, reason: reason || '' })
    });
  },
  eventMatches(id, body){
    return this.req('/api/events/' + encodeURIComponent(id) + '/matches', {
      method: 'POST', body: JSON.stringify(body || {})
    });
  },
  newsCreate(data){ return this.req('/api/news', { method: 'POST', body: JSON.stringify(data) }); },
  newsUpdate(id, data){ return this.req('/api/news/' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify(data) }); },
  newsDelete(id){ return this.req('/api/news/' + encodeURIComponent(id), { method: 'DELETE' }); },
  eventCreate(data){ return this.req('/api/events', { method: 'POST', body: JSON.stringify(data) }); },
  eventUpdate(id, data){ return this.req('/api/events/' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify(data) }); },
  eventDelete(id){ return this.req('/api/events/' + encodeURIComponent(id), { method: 'DELETE' }); },
  teamAdjust(id, points, note){
    return this.req('/api/teams/' + encodeURIComponent(id) + '/adjust', {
      method: 'POST', body: JSON.stringify({ points: points, note: note || '' })
    });
  },
  reset(){ return this.req('/api/reset', { method: 'POST' }); }
};

function snapshot(state){
  return {
    teams: JSON.parse(JSON.stringify(state.teams || [])),
    matches: JSON.parse(JSON.stringify(state.matches || []))
  };
}

/* betöltés: a Node szerver az adatforrás; ha nem érhető el, demó adat + jelzés */
async function load(){
  try {
    const fresh = await Api.state();
    OFFLINE = false;
    LAST = snapshot(fresh);
    return fresh;
  } catch (e) {
    OFFLINE = true;
    const demo = seed();
    LAST = snapshot(demo);
    return demo;
  }
}

/* frissítés: menet közben beérkező nevezések/eredmények átvétele a szerverről */
async function refreshData(){
  if (OFFLINE) return;
  try {
    db = await Api.state();
    LAST = snapshot(db);
    renderAll();
  } catch (e) { /* átmeneti hiba: marad a jelenlegi nézet */ }
}

/* mentés: csak a megváltozott tételeket küldjük el a szervernek */
async function save(){
  if (OFFLINE){
    toast('Nincs kapcsolat az adatkiszolgálóval — a módosítás nem mentődött.', true);
    return;
  }
  const ops = [];

  db.teams.forEach(function (t) {
    const prev = LAST.teams.find(x => x.id === t.id);
    if (!prev) return;
    if (prev.status !== t.status) ops.push(Api.teamStatus(t.id, t.status, t.rejectReason));
  });

  db.matches.forEach(function (m) {
    const prev = LAST.matches.find(x => x.id === m.id);
    if (!prev){ ops.push(Api.addMatch(m)); return; }
    const changed = prev.status !== m.status
      || String(prev.scoreA) !== String(m.scoreA)
      || String(prev.scoreB) !== String(m.scoreB);
    if (changed){
      const noShow = m.status === 'no-show' ? (Number(m.scoreA) === 0 ? 'a' : 'b') : null;
      ops.push(Api.result(m.id, m.scoreA, m.scoreB, noShow));
    }
  });

  LAST.matches.forEach(function (m) {
    if (!db.matches.some(x => x.id === m.id)) ops.push(Api.deleteMatch(m.id));
  });

  if (!ops.length) return;
  try {
    await Promise.all(ops);
    db = await Api.state();
    LAST = snapshot(db);
    renderAll();
  } catch (e) {
    toast('Mentés nem sikerült: ' + e.message, true);
  }
}
function log(action, detail){
  db.log.unshift({
    id: uid('l'),
    at: new Date().toISOString(),
    actor: currentActor,
    action: action,
    detail: detail || ''
  });
  db.log = db.log.slice(0, 120);
}

/* ---------- nézet állapot ---------- */
const ui = {
  tab: 'eredmeny',
  resultComp: 'cs2-2026-27',
  teamFilter: 'pending',
  hideDone: false,
  newsEditId: null,
  eventEditId: null,
  tableComp: 'cs2-2026-27'
};

const TITLES = {
  eredmeny: ['Eredménybeírás', 'Válaszd ki a mérkőzést, írd be a pontszámot, és kész.'],
  nevezesek: ['Nevezések', 'Ellenőrizd a létszámot és a neveket, majd hagyd jóvá a csapatot.'],
  utemezes: ['Meccsütemezés', 'Új mérkőzés beütemezése, ütközés- és szünetfigyeléssel.'],
  hirek: ['Hírek', 'A kezdőlap hír-karusszeljének tartalma — bármikor szerkeszthető.'],
  naptar: ['Naptár', 'Események a versenynaptárba: határidők, fordulók, döntők.'],
  tabella: ['Tabella', 'A tabella a meccsekből számolódik — itt pontkorrekciót adhatsz.'],
  naplo: ['Napló', 'A szervezői műveletek időrendben, visszakereshetően.']
};

/* ---------- lekérdezések ---------- */
function comp(id){ return db.competitions.find(c => c.id === id) || db.competitions[0]; }
function teamById(id){ return db.teams.find(t => t.id === id); }
function teamsOf(compId, status){
  return db.teams.filter(t => t.comp === compId && (!status || t.status === status));
}
function matchesOf(compId){
  return db.matches
    .filter(m => m.comp === compId)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/* iskolai szünet / ünnepnap egy adott napon (a SCHOOL_YEARS a data.js-ből jön) */
function schoolYearKey(dk){
  const y = +dk.slice(0, 4), mo = +dk.slice(5, 7);
  return mo >= 8 ? y + '/' + pad((y + 1) % 100) : (y - 1) + '/' + pad(y % 100);
}
function dayInfo(dk){
  if (typeof SCHOOL_YEARS === 'undefined') return null;
  const sy = SCHOOL_YEARS[schoolYearKey(dk)];
  if (!sy) return null;
  for (const b of sy.breaks || []){
    if (dk >= b.from && dk <= b.to) return { kind: 'break', name: b.name };
  }
  for (const h of sy.holidays || []){
    if (h.d === dk) return { kind: 'holiday', name: h.name };
  }
  return null;
}

/* mérkőzés-ütközés: ugyanaz a terem + időpont, vagy ugyanaz a csapat két helyen */
function matchConflicts(candidate){
  return db.matches.filter(m => {
    if (m.id === candidate.id) return false;
    if (m.date !== candidate.date) return false;
    const sameSlot = m.time === candidate.time;
    if (!sameSlot) return false;
    if (m.room === candidate.room) return 'room';
    if (m.a === candidate.a || m.b === candidate.a || m.a === candidate.b || m.b === candidate.b) return 'team';
    return false;
  });
}

/* ---------- nevezés-ellenőrzés ---------- */
function teamIssues(team){
  const out = [];
  const c = comp(team.comp);
  const others = db.teams.filter(t => t.comp === team.comp && t.id !== team.id && t.status !== 'rejected');
  const roster = (team.players || []).map(p => String(p || '').trim()).filter(Boolean);

  if (roster.length !== c.teamSize){
    out.push({ hard: true, text: 'Létszám: <b>' + roster.length + '/' + c.teamSize + ' fő</b> — a ' + esc(c.game) + ' ' + c.teamSize + ' fős csapatot vár.' });
  }
  const seen = {};
  roster.forEach(p => {
    const k = norm(p);
    if (!k) return;
    if (seen[k]) out.push({ hard: true, text: 'Kétszer szerepel a listán: <b>' + esc(p) + '</b>.' });
    seen[k] = 1;
  });
  roster.forEach(p => {
    if (hasBadWord(p)) out.push({ hard: true, text: 'Sértő szót tartalmaz: <b>' + esc(p) + '</b>.' });
    const dupTeam = others.find(t => (t.players || []).some(op => norm(op) === norm(p)));
    if (dupTeam) out.push({ hard: false, text: '<b>' + esc(p) + '</b> már a(z) <b>' + esc(dupTeam.name) + '</b> csapatban szerepel.' });
  });
  const nameDup = others.find(t => norm(t.name) === norm(team.name));
  if (nameDup) out.push({ hard: true, text: 'Ilyen nevű csapat már van: <b>' + esc(nameDup.name) + '</b> (' + (nameDup.status === 'approved' ? 'jóváhagyott' : 'függőben') + ').' });
  if (hasBadWord(team.name)) out.push({ hard: true, text: 'A csapatnév sértő szót tartalmaz.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(team.captain || '')){
    out.push({ hard: false, text: 'A kapitány e-mail címe hiányosnak tűnik.' });
  }
  return out;
}

/* =========================================================
   RENDER
   ========================================================= */
function renderCounts(){
  const pending = db.teams.filter(t => t.status === 'pending').length;
  /* eredményre váró meccsek: élő + ütemezett, minden versenyben */
  const openMatches = db.matches.filter(m => m.status === 'scheduled' || m.status === 'live').length;
  /* a tanárnak ma ez a fontos: hány meccs van még ma */
  const today = todayKey();
  const todayOpen = db.matches.filter(m => m.date === today && m.status !== 'done' && m.status !== 'no-show').length;
  const set = (id, n) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !n;
    el.textContent = n;
  };
  set('cntResults', openMatches);
  set('cntTeams', pending);
  set('cntScheduled', todayOpen);
}

function renderResultCompSwitch(){
  const host = $('#resultCompSwitch');
  if (!host) return;
  host.innerHTML = db.competitions.map(c =>
    '<button type="button" class="adm-seg-item' + (c.id === ui.resultComp ? ' active' : '') + '"' +
      ' role="tab" aria-selected="' + (c.id === ui.resultComp) + '" data-comp="' + esc(c.id) + '">' +
      esc(c.short) + ' · ' + esc(c.game) +
    '</button>'
  ).join('');
}

const STATUS_LABEL = {
  scheduled: ['is-scheduled', 'Ütemezett'],
  live: ['is-live', 'ÉLŐ'],
  done: ['is-done', 'Kész'],
  'no-show': ['is-noshow', 'Nem jelent meg'],
  disputed: ['is-pending', 'Óvás']
};

function renderResults(){
  const host = $('#resultList');
  if (!host) return;
  const c = comp(ui.resultComp);
  let list = matchesOf(c.id);
  if (ui.hideDone) list = list.filter(m => m.status !== 'done');
  /* a tanár munkáját az élő, majd a soron következő meccsek segítik — a lezártak hátra */
  const RANK = { live: 0, scheduled: 1, disputed: 2, 'no-show': 3, done: 4 };
  list.sort((x, y) => (RANK[x.status] || 0) - (RANK[y.status] || 0));

  if (!list.length){
    host.innerHTML =
      '<div class="adm-empty"><b>Nincs mérkőzés ebben a versenyben</b>' +
      'Ütemezz egyet az Ütemezés fülön, és itt tudod majd beírni az eredményt.</div>';
    return;
  }

  host.innerHTML = list.map(m => {
    const a = teamById(m.a), b = teamById(m.b);
    const st = STATUS_LABEL[m.status] || STATUS_LABEL.scheduled;
    const warn = dayInfo(m.date);
    return '<article class="adm-match" data-match="' + esc(m.id) + '">' +
      '<div class="adm-match-top">' +
        '<span class="adm-round">R' + esc(m.round) + ' · ' + (m.stage === 'playoff' ? 'kiesés' : m.stage === 'final' ? 'döntő' : 'csoport') + '</span>' +
        '<span class="adm-when">' + fmtDay(m.date) + ' · ' + esc(m.time) + ' · ' + esc(m.room) +
          (m.bestOf > 1 ? ' · BO' + esc(m.bestOf) : '') + '</span>' +
        (warn ? '<span class="adm-pill is-pending" title="' + esc(warn.name) + '">⚠ ' + esc(warn.name) + '</span>' : '') +
        '<span class="adm-pill ' + st[0] + '">' + st[1] + '</span>' +
      '</div>' +
      '<div class="adm-match-body">' +
        '<div class="adm-side-a">' +
          '<span class="adm-team-name">' + esc(a ? a.name : '?') + '</span>' +
          '<input class="adm-score" type="number" min="0" max="99" inputmode="numeric" data-side="a" aria-label="' + esc(a ? a.name : 'A csapat') + ' pontszáma" value="' + esc(m.scoreA) + '">' +
        '</div>' +
        '<span class="adm-vs">vs</span>' +
        '<div class="adm-side-b">' +
          '<input class="adm-score" type="number" min="0" max="99" inputmode="numeric" data-side="b" aria-label="' + esc(b ? b.name : 'B csapat') + ' pontszáma" value="' + esc(m.scoreB) + '">' +
          '<span class="adm-team-name">' + esc(b ? b.name : '?') + '</span>' +
        '</div>' +
        '<div class="adm-match-actions">' +
          '<button type="button" class="adm-btn adm-btn--primary adm-btn--sm" data-act="save">Mentés</button>' +
          '<select class="adm-noshow" data-act="noshow" aria-label="Nem jelent meg">' +
            '<option value="">Nem jelent meg…</option>' +
            '<option value="a">' + esc(a ? a.name : 'A') + '</option>' +
            '<option value="b">' + esc(b ? b.name : 'B') + '</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
    '</article>';
  }).join('');
}

function renderTeams(){
  const host = $('#teamList');
  if (!host) return;
  const list = db.teams
    .filter(t => t.status === ui.teamFilter)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  if (!list.length){
    const msg = ui.teamFilter === 'pending'
      ? 'Minden nevezés elbírálva. Szép munka.'
      : 'Ebben az állapotban nincs csapat.';
    host.innerHTML = '<div class="adm-empty"><b>Nincs mit mutatni</b>' + msg + '</div>';
    return;
  }

  host.innerHTML = list.map(t => {
    const c = comp(t.comp);
    const issues = teamIssues(t);
    const hard = issues.filter(i => i.hard).length;
    const pill = t.status === 'approved'
      ? '<span class="adm-pill is-approved">Jóváhagyott</span>'
      : t.status === 'rejected'
        ? '<span class="adm-pill is-rejected">Elutasított</span>'
        : '<span class="adm-pill is-pending">Jóváhagyásra vár</span>';

    return '<article class="adm-team-card" data-team="' + esc(t.id) + '">' +
      '<div class="adm-team-top">' +
        '<div>' +
          '<h3>' + esc(t.name) + '</h3>' +
          '<span class="adm-team-meta">' + esc(c.game) + ' · ' + esc(c.label) + ' · beküldve ' + fmtStamp(t.createdAt) + '</span>' +
        '</div>' + pill +
      '</div>' +
      '<ul class="adm-roster">' +
        (t.players || []).map((p, i) =>
          '<li' + (hasBadWord(p) ? ' class="is-flag"' : '') + '><i>' + (i + 1) + '</i>' + esc(p) + '</li>'
        ).join('') +
      '</ul>' +
      '<div class="adm-team-foot">' +
        '<span>Létszám: <b>' + (t.players || []).length + '/' + c.teamSize + '</b></span>' +
        '<span>Kapitány: <b>' + esc(t.captain) + '</b></span>' +
        (t.teacher ? '<span>Osztályfőnök: <b>' + esc(t.teacher) + '</b></span>' : '') +
        (t.klass ? '<span>Osztály: <b>' + esc(t.klass) + '</b></span>' : '') +
        '<div class="adm-actions">' +
          (t.status === 'pending'
            ? '<button type="button" class="adm-btn adm-btn--primary adm-btn--sm" data-act="approve"' + (hard ? ' data-hard="1"' : '') + '>Jóváhagyás</button>' +
              '<button type="button" class="adm-btn adm-btn--danger adm-btn--sm" data-act="reject">Elutasítás</button>'
            : '<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-act="undo">Vissza függőbe</button>') +
        '</div>' +
      '</div>' +
      (issues.length
        ? '<div class="adm-issues">' + issues.map(i =>
            '<span class="adm-issue' + (i.hard ? ' is-hard' : '') + '"><span aria-hidden="true">' + (i.hard ? '✕' : '⚠') + '</span><span>' + i.text + '</span></span>'
          ).join('') + '</div>'
        : '') +
    '</article>';
  }).join('');
}

function renderScheduleForm(){
  const compSel = $('#sfComp');
  if (!compSel) return;
  const keep = compSel.value || ui.resultComp;
  compSel.innerHTML = db.competitions.map(c =>
    '<option value="' + esc(c.id) + '">' + esc(c.game) + ' (BO' + esc(c.bestOf) + ', ' + esc(c.teamSize) + ' fő)</option>'
  ).join('');
  compSel.value = db.competitions.some(c => c.id === keep) ? keep : db.competitions[0].id;

  const c = comp(compSel.value);
  const options = (sel) => {
    const teams = teamsOf(c.id, 'approved');
    if (!teams.length) return '<option value="">— nincs jóváhagyott csapat —</option>';
    return '<option value="">Válassz…</option>' + teams.map(t =>
      '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>'
    ).join('');
  };
  const a = $('#sfTeamA'), b = $('#sfTeamB');
  const keepA = a.value, keepB = b.value;
  a.innerHTML = options();
  b.innerHTML = options();
  if (teamsOf(c.id, 'approved').some(t => t.id === keepA)) a.value = keepA;
  if (teamsOf(c.id, 'approved').some(t => t.id === keepB)) b.value = keepB;

  const bo = $('#sfBestOf');
  if (bo) bo.value = String(c.bestOf);
  const submit = $('#sfSubmit');
  if (submit) submit.disabled = teamsOf(c.id, 'approved').length < 2;
  updateSchedWarn();
}

function updateSchedWarn(){
  const box = $('#schedWarn');
  const dateEl = $('#sfDate');
  const compSel = $('#sfComp');
  if (!box || !dateEl || !compSel) return;

  const dk = dateEl.value;
  const msgs = [];
  let error = false;

  if (dk){
    const info = dayInfo(dk);
    if (info){
      msgs.push('⚠ ' + fmtShort(dk) + ' ' + esc(info.name) + ' — nem tanítási nap, érdemes másik dátumot választani.');
    }
    if (dk < todayKey()) msgs.push('⚠ A dátum a múltban van.');
    const sameDay = db.matches.filter(m => m.comp === compSel.value && m.date === dk).length;
    if (sameDay) msgs.push('ℹ Ezen a napon már ' + sameDay + ' mérkőzés van ebben a versenyben.');
  } else {
    error = true;
    msgs.push('Válassz dátumot.');
  }

  const a = $('#sfTeamA') && $('#sfTeamA').value;
  const b = $('#sfTeamB') && $('#sfTeamB').value;
  if (a && b && a === b){ error = true; msgs.push('✕ Ugyanaz a csapat nem játszhat önmagával.'); }

  box.hidden = !msgs.length;
  box.classList.toggle('is-error', error);
  box.innerHTML = msgs.join('<br>');
}

function renderSchedList(){
  const host = $('#schedList');
  if (!host) return;
  const pending = db.matches
    .filter(m => m.status === 'scheduled' || m.status === 'live')
    .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));

  setNote();
  if (!pending.length){
    host.innerHTML = '<div class="adm-empty"><b>Nincs beütemezett mérkőzés</b>Az új mérkőzést a bal oldali űrlapon hozhatod létre.</div>';
    return;
  }

  let lastDay = '';
  host.innerHTML = pending.map(m => {
    const c = comp(m.comp), a = teamById(m.a), b = teamById(m.b);
    const info = dayInfo(m.date);
    let head = '';
    if (m.date !== lastDay){
      lastDay = m.date;
      head = '<div class="adm-day">' + fmtDay(m.date) + (info ? ' · ⚠ ' + esc(info.name) : '') + '</div>';
    }
    return head + '<div class="adm-srow" data-match="' + esc(m.id) + '">' +
      '<span class="adm-srow-time">' + esc(m.time) + '</span>' +
      '<span class="adm-srow-teams">' + esc(a ? a.name : '?') + '<span>vs</span>' + esc(b ? b.name : '?') + '</span>' +
      '<span class="adm-srow-room">' + esc(c.short) + ' · BO' + esc(m.bestOf) + ' · ' + esc(m.room) + '</span>' +
      (m.status === 'live' ? '<span class="adm-pill is-live">ÉLŐ</span>' : '') +
      '<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-act="del">Törlés</button>' +
    '</div>';
  }).join('');
}

function setNote(){
  const note = $('#schedNote');
  if (!note) return;
  const n = db.matches.filter(m => m.status === 'scheduled' || m.status === 'live').length;
  note.textContent = n + ' aktív mérkőzés · egyszerre egy meccs fér el a 304-es teremben';
}

function renderLog(){
  const host = $('#logList');
  if (!host) return;
  if (!db.log.length){
    host.innerHTML = '<div class="adm-empty"><b>Még nincs bejegyzés</b>Az első művelet után itt jelenik meg.</div>';
    return;
  }
  host.innerHTML = db.log.map(e =>
    '<div class="adm-log">' +
      '<time>' + fmtStamp(e.at) + '</time>' +
      '<b>' + esc(e.action) + '</b>' +
      '<small>' + esc(e.actor || '') + (e.detail ? ' · ' + esc(e.detail) : '') + '</small>' +
    '</div>'
  ).join('');
}

function renderAll(){
  renderCounts();
  renderResultCompSwitch();
  renderResults();
  renderTeams();
  renderRequests();
  renderScheduleForm();
  renderSchedList();
  renderNewsAdmin();
  renderEventsAdmin();
  renderTableAdmin();
  renderLog();
}

/* ---------- cserekérelmek (diák profilból) ---------- */
function renderRequests(){
  const host = $('#reqList'), note = $('#reqNote');
  if (!host) return;
  const list = (db.requests || []).slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const pending = list.filter(r => r.status === 'pending');

  if (note){
    note.textContent = pending.length
      ? pending.length + ' kérelem döntésre vár'
      : (list.length ? list.length + ' kérelem · nincs függő' : 'Nincs cserekérelem.');
  }

  if (!list.length){
    host.innerHTML = '<div class="adm-empty"><b>Nincs cserekérelem</b>' +
      'A kapitányok a profiljukból kérhetnek játékoscserét — az itt jelenik meg jóváhagyásra.</div>';
    return;
  }

  host.innerHTML = list.slice(0, 15).map(r => {
    const st = r.status === 'approved' ? 'Jóváhagyva' : r.status === 'rejected' ? 'Elutasítva' : 'Függőben';
    return '<div class="adm-srow" data-req="' + esc(r.id) + '">' +
      '<span class="adm-srow-time">' + fmtShort(r.createdAt) + '</span>' +
      '<span class="adm-srow-teams">' + esc(r.teamName) + ' · ' + esc(r.outPlayer) + ' → <b>' + esc(r.inPlayer) + '</b>' +
        (r.note ? ' <span style="color:var(--ink-3)">· ' + esc(r.note) + '</span>' : '') +
        (r.rejectReason ? ' <span style="color:#ff9f9f">· ' + esc(r.rejectReason) + '</span>' : '') +
      '</span>' +
      '<span class="adm-srow-room">' + esc(st) + '</span>' +
      (r.status === 'pending'
        ? '<button type="button" class="adm-btn adm-btn--primary adm-btn--sm" data-act="approve">Jóváhagyás</button>' +
          '<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-act="reject">Elutasítás</button>'
        : '') +
    '</div>';
  }).join('');

  /* egyszer kötünk eseményt: a következő render felülírja */
  host.onclick = async e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('[data-req]');
    if (!row) return;
    const id = row.dataset.req;
    const r = (db.requests || []).find(x => x.id === id);
    if (!r) return;

    const approve = btn.dataset.act === 'approve';
    if (!approve && !confirm('Elutasítod a cserét?\n\n' + r.teamName + ': ' + r.outPlayer + ' → ' + r.inPlayer)) return;

    try {
      await Api.requestDecide(id, approve ? 'approved' : 'rejected');
      await refreshData();
      toast(approve ? 'Csere jóváhagyva: ' + r.inPlayer + ' bekerült a csapatba.' : 'Csere elutasítva.');
    } catch (err) {
      toast('Nem sikerült: ' + err.message, true);
    }
  };
}

/* =========================================================
   HÍREK / NAPTÁR / TABELLA
   ========================================================= */
const EVENT_TYPES = [
  ['deadline', 'Nevezési határidő'],
  ['match', 'Mérkőzésnap'],
  ['final', 'Döntő'],
  ['custom', 'Egyéb esemény']
];

function eventTypeLabel(type){
  const hit = EVENT_TYPES.find(t => t[0] === type);
  return hit ? hit[1] : 'Egyéb esemény';
}

function renderNewsAdmin(){
  const host = $('#newsList'), note = $('#newsNote');
  if (!host) return;
  const list = (db.news || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (note) note.textContent = list.length + ' hír · a kezdőlap karusszeljében jelenik meg';
  if (!list.length){
    host.innerHTML = '<div class="adm-empty"><b>Még nincs hír</b>A bal oldali űrlapon adj hozzá egyet — azonnal megjelenik a kezdőlapon.</div>';
    return;
  }
  host.innerHTML = list.map(n =>
    '<div class="adm-srow" data-news="' + esc(n.id) + '">' +
      '<span class="adm-srow-time">' + fmtShort(n.date) + '</span>' +
      (n.image ? '<img class="adm-thumb" src="' + esc(n.image) + '" alt="">' : '') +
      '<span class="adm-srow-teams">' + esc(n.title) + '</span>' +
      '<span class="adm-srow-room">' + esc(n.tag || 'Hír') + ' · ' + esc(n.season || '2026/27') + (n.link ? ' · ' + esc(n.link) : '') + '</span>' +
      '<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-act="edit">Szerkesztés</button>' +
      '<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-act="del">Törlés</button>' +
    '</div>'
  ).join('');
}

function renderEventsAdmin(){
  const host = $('#eventList'), note = $('#eventNote');
  if (!host) return;
  const list = (db.events || []).slice().sort((a, b) =>
    (String(a.date) + (a.time || '')).localeCompare(String(b.date) + (b.time || '')));
  if (note) note.textContent = list.length + ' esemény · a Versenynaptár oldalon is megjelenik';
  if (!list.length){
    host.innerHTML = '<div class="adm-empty"><b>Még nincs esemény</b>Határidők és fordulók — a naptárban színezett napként látszanak.</div>';
    return;
  }
  let lastDay = '';
  host.innerHTML = list.map(e => {
    let head = '';
    if (e.date !== lastDay){
      lastDay = e.date;
      const info = dayInfo(e.date);
      head = '<div class="adm-day">' + fmtDay(e.date) + (info ? ' · ⚠ ' + esc(info.name) : '') + '</div>';
    }
    const compId = e.comp || (db.competitions[0] || {}).id || '';
    const compInfo = (db.competitions || []).find(c => c.id === compId) || {};
    const roundNo = Math.max(1, Number(e.round) || 1);
    const made = e.type === 'match'
      ? db.matches.filter(m => m.comp === compId && m.date === e.date && (Number(m.round) || 0) === roundNo).length
      : 0;
    return head + '<div class="adm-srow" data-event="' + esc(e.id) + '">' +
      '<span class="adm-srow-time">' + esc(e.time || '—') + '</span>' +
      '<span class="adm-srow-teams">' + esc(e.title) +
        (e.note ? ' <span style="color:var(--ink-3)">· ' + esc(e.note) + '</span>' : '') + '</span>' +
      '<span class="adm-srow-room">' + esc(eventTypeLabel(e.type)) +
        (e.type === 'match' ? ' · ' + esc(compInfo.game || '—') + ' · ' + roundNo + '. forduló' : '') +
        (made ? ' · <b>' + made + ' meccs</b>' : '') + '</span>' +
      (e.type === 'match' ? '<button type="button" class="adm-btn adm-btn--primary adm-btn--sm" data-act="gen">Meccsek</button>' : '') +
      '<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-act="edit">Szerkesztés</button>' +
      '<button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-act="del">Törlés</button>' +
    '</div>';
  }).join('');
}

/* ugyanaz a pontozás, mint a szerveren — a tabella előnézete */
function adminStandings(compId){
  const c = comp(compId);
  const rows = new Map();
  teamsOf(compId, 'approved').forEach(t => rows.set(t.id, {
    id: t.id,
    teamName: t.name,
    wins: 0,
    losses: 0,
    matchesPlayed: 0,
    points: Number(t.adjust) || 0,
    adjust: Number(t.adjust) || 0,
    adjustNote: t.adjustNote || ''
  }));

  db.matches.filter(m => m.comp === compId && (m.status === 'done' || m.status === 'no-show')).forEach(m => {
    const a = rows.get(m.a), b = rows.get(m.b);
    if (!a || !b) return;
    a.matchesPlayed++;
    b.matchesPlayed++;

    if (m.status === 'no-show'){
      const aOut = Number(m.scoreB) > 0 && Number(m.scoreA) === 0;
      const out = aOut ? a : b, kept = aOut ? b : a;
      kept.wins++;
      kept.points += Number(c.winPoints);
      out.losses++;
      out.points -= Number(c.noShowPenalty) || 0;
      return;
    }

    const sa = Number(m.scoreA) || 0, sb = Number(m.scoreB) || 0;
    if (sa > sb){ a.wins++; b.losses++; a.points += Number(c.winPoints); }
    else if (sb > sa){ b.wins++; a.losses++; b.points += Number(c.winPoints); }
    else { a.points += Number(c.drawPoints) || 0; b.points += Number(c.drawPoints) || 0; }
  });

  return Array.from(rows.values()).sort((x, y) =>
    y.points - x.points || y.wins - x.wins || x.teamName.localeCompare(y.teamName, 'hu'));
}

function renderTableAdmin(){
  const host = $('#tableAdmin'), seg = $('#tableCompSwitch');
  if (!host || !seg) return;
  seg.innerHTML = db.competitions.map(c =>
    '<button type="button" class="adm-seg-item' + (c.id === ui.tableComp ? ' active' : '') + '" role="tab" aria-selected="' +
      (c.id === ui.tableComp) + '" data-comp="' + esc(c.id) + '">' + esc(c.short) + '</button>'
  ).join('');

  const rows = adminStandings(ui.tableComp);
  if (!rows.length){
    host.innerHTML = '<div class="adm-empty"><b>Nincs még jóváhagyott csapat</b>Ha lesz, itt látod a tabellát, és innen adhatsz pontkorrekciót.</div>';
    return;
  }

  host.innerHTML = rows.map((r, i) =>
    '<div class="adm-srow" data-team="' + esc(r.id) + '">' +
      '<span class="adm-srow-time">' + (i + 1) + '.</span>' +
      '<span class="adm-srow-teams">' + esc(r.teamName) +
        ' <span style="color:var(--ink-3)">' + r.wins + 'GY · ' + r.losses + 'V · ' + r.matchesPlayed + ' meccs</span></span>' +
      '<span class="adm-pill ' + (r.points > 0 ? 'is-approved' : 'is-done') + '">' + r.points + ' pont</span>' +
      '<input class="adm-score adm-adjust" type="number" min="-100" max="100" inputmode="numeric" data-adjust aria-label="Pontkorrekció" value="' + r.adjust + '">' +
      '<input class="adm-input adm-adjust-note" type="text" maxlength="120" data-note aria-label="Korrekció indoka" placeholder="indok" value="' + esc(r.adjustNote) + '">' +
      '<button type="button" class="adm-btn adm-btn--primary adm-btn--sm" data-act="save">Mentés</button>' +
    '</div>'
  ).join('');
}

/* ---------- űrlapok ---------- */
/* ---------- hírkép ---------- */
let newsImageNew = null;   /* új, még nem mentett kép (data URL) */
let newsImageOld = '';     /* a szerveren lévő kép útvonala */

function newsImgUi(){
  const row = $('#newsImgRow'), img = $('#newsImgPreview'), note = $('#newsImgNote');
  if (!row) return;
  const src = newsImageNew || newsImageOld;
  if (!src){
    row.hidden = true;
    if (img) img.removeAttribute('src');
    if (note) note.textContent = '';
    return;
  }
  row.hidden = false;
  if (img) img.src = src;
  if (note) note.textContent = newsImageNew ? 'Új kép — mentésre vár' : 'Jelenlegi kép';
}

function resetNewsImage(){
  newsImageNew = null;
  newsImageOld = '';
  const input = $('#nfImage');
  if (input) input.value = '';
  newsImgUi();
}

/* a böngésző kicsinyíti a képet, így a feltöltés kicsi marad */
function resizeImageFile(file, maxSide){
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#05070f';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try { resolve(canvas.toDataURL('image/jpeg', 0.82)); }
      catch (e) { reject(new Error('A kép feldolgozása nem sikerült.')); }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error('A fájl nem olvasható képként.'));
    };
    img.src = url;
  });
}

function resetNewsForm(){
  ui.newsEditId = null;
  const form = $('#newsForm');
  if (form) form.reset();
  const d = $('#nfDate');
  if (d) d.value = todayKey();
  const btn = $('#nfSubmit');
  if (btn) btn.textContent = 'Hír hozzáadása';
  const cancel = $('#nfCancel');
  if (cancel) cancel.hidden = true;
  const title = $('#newsFormTitle');
  if (title) title.textContent = 'Új hír';
  resetNewsImage();
}

function editNews(id){
  const n = (db.news || []).find(x => x.id === id);
  if (!n) return;
  ui.newsEditId = id;
  $('#nfDate').value = n.date || todayKey();
  $('#nfTag').value = n.tag || 'Hír';
  $('#nfTitle').value = n.title || '';
  $('#nfLink').value = n.link || '';
  $('#nfSeason').value = n.season || '2026/27';
  $('#nfSubmit').textContent = 'Módosítás mentése';
  $('#nfCancel').hidden = false;
  $('#newsFormTitle').textContent = 'Hír szerkesztése';
  newsImageNew = null;
  newsImageOld = n.image || '';
  const imgInput = $('#nfImage');
  if (imgInput) imgInput.value = '';
  newsImgUi();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fillEventComps(){
  const sel = $('#efComp');
  if (!sel) return;
  const current = sel.value;
  const list = db.competitions || [];
  sel.innerHTML = list.map(c =>
    '<option value="' + esc(c.id) + '">' + esc(c.game) + '</option>').join('');
  const ids = list.map(c => c.id);
  sel.value = ids.indexOf(current) !== -1 ? current : (ids[0] || '');
}

function resetEventForm(){
  ui.eventEditId = null;
  const form = $('#eventForm');
  if (form) form.reset();
  fillEventComps();
  /* forduló-esemény: a következő fordulószámot ajánljuk fel */
  const rounds = (db.events || []).filter(x => x.type === 'match').map(x => Number(x.round) || 1);
  const rf = $('#efRound');
  if (rf) rf.value = Math.min(30, rounds.length ? Math.max.apply(null, rounds) + 1 : 1);
  const d = $('#efDate');
  if (d) d.value = todayKey();
  const warn = $('#eventWarn');
  if (warn) warn.hidden = true;
  const btn = $('#efSubmit');
  if (btn) btn.textContent = 'Esemény hozzáadása';
  const cancel = $('#efCancel');
  if (cancel) cancel.hidden = true;
  const title = $('#eventFormTitle');
  if (title) title.textContent = 'Új esemény';
}

function editEvent(id){
  const e = (db.events || []).find(x => x.id === id);
  if (!e) return;
  ui.eventEditId = id;
  $('#efDate').value = e.date || todayKey();
  $('#efTime').value = e.time || '';
  $('#efType').value = e.type || 'match';
  fillEventComps();
  $('#efComp').value = e.comp || (db.competitions[0] || {}).id || '';
  $('#efRound').value = Math.max(1, Math.min(30, Number(e.round) || 1));
  $('#efTitle').value = e.title || '';
  $('#efNote').value = e.note || '';
  $('#efSubmit').textContent = 'Módosítás mentése';
  $('#efCancel').hidden = false;
  $('#eventFormTitle').textContent = 'Esemény szerkesztése';
  updateEventWarn();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateEventWarn(){
  const box = $('#eventWarn'), d = $('#efDate');
  if (!box || !d) return;
  const dk = d.value;
  if (!dk){ box.hidden = true; return; }
  const info = dayInfo(dk);
  if (!info){ box.hidden = true; return; }
  box.hidden = false;
  box.classList.remove('is-error');
  box.textContent = '⚠ ' + fmtShort(dk) + ' ' + info.name + ' — nem tanítási nap.';
}

/* =========================================================
   MŰVELETEK
   ========================================================= */
function saveResult(matchId, card){
  const m = db.matches.find(x => x.id === matchId);
  if (!m) return;
  const c = comp(m.comp);
  const a = card.querySelector('.adm-score[data-side="a"]').value.trim();
  const b = card.querySelector('.adm-score[data-side="b"]').value.trim();

  if (a === '' || b === ''){ toast('Mindkét pontszámot add meg.', true); return; }
  const sa = Number(a), sb = Number(b);
  if (!Number.isInteger(sa) || !Number.isInteger(sb) || sa < 0 || sb < 0 || sa > 99 || sb > 99){
    toast('A pontszám 0 és 99 közötti egész szám legyen.', true);
    return;
  }
  if (sa === sb && !c.allowDraw){
    toast(c.game + ' ' + c.label + ' — döntetlen nem lehet, hosszabbítás/halasztás kell.', true);
    return;
  }

  const aTeam = teamById(m.a), bTeam = teamById(m.b);
  m.scoreA = sa;
  m.scoreB = sb;
  m.status = 'done';
  m.reportedBy = 'tanár';
  m.confirmedAt = new Date().toISOString();
  log('Eredmény rögzítve', (aTeam ? aTeam.name : '?') + ' ' + sa + '–' + sb + ' ' + (bTeam ? bTeam.name : '?') + ' (R' + m.round + ')');
  save();
  renderAll();
  toast('Eredmény mentve: ' + sa + '–' + sb + ' · ' + fmtShort(m.date));
}

function markNoShow(matchId, side, select){
  const m = db.matches.find(x => x.id === matchId);
  if (!m) return;
  const loser = side === 'a' ? teamById(m.a) : teamById(m.b);
  const winner = side === 'a' ? teamById(m.b) : teamById(m.a);
  if (!loser) return;
  if (!confirm(loser.name + ' nem jelent meg. A mérkőzés lezárul ' + (winner ? winner.name : 'az ellenfél') + ' javára?')){
    select.value = '';
    return;
  }
  m.status = 'no-show';
  m.scoreA = side === 'a' ? 0 : (m.bestOf > 1 ? Math.ceil(m.bestOf / 2) : 1);
  m.scoreB = side === 'b' ? 0 : (m.bestOf > 1 ? Math.ceil(m.bestOf / 2) : 1);
  m.reportedBy = 'tanár';
  m.confirmedAt = new Date().toISOString();
  log('Nem jelent meg', loser.name + ' — ' + (winner ? winner.name : 'ellenfél') + ' kapja a meccset');
  save();
  renderAll();
  toast('Rögzítve: ' + loser.name + ' nem jelent meg.');
}

/* saját felugró ablak szöveges bevitelhez — a böngésző prompt() helyett */
function askText(opts){
  const o = opts || {};
  const modal = $('#admModal');
  if (!modal) return Promise.resolve(window.prompt(o.title || '', o.value || ''));

  return new Promise(function (resolve) {
    const input = $('#admModalInput');
    const text = $('#admModalText');
    const ok = $('#admModalOk');
    const title = $('#admModalTitle');
    let done = false;

    function close(value){
      if (done) return;
      done = true;
      modal.hidden = true;
      document.body.classList.remove('adm-modal-open');
      modal.removeEventListener('keydown', onKey);
      if (ok) ok.onclick = null;
      if (title) title.textContent = 'Kérdés';
      resolve(value);
    }

    function onKey(e){
      if (e.key === 'Escape'){ e.preventDefault(); close(null); }
      else if (e.key === 'Enter'){ e.preventDefault(); close(input ? input.value : ''); }
    }

    if (title) title.textContent = o.title || 'Kérdés';
    if (text){
      text.textContent = o.text || '';
      text.hidden = !o.text;
    }
    if (ok) ok.textContent = o.okText || 'Rendben';
    if (input){
      input.value = o.value || '';
      input.placeholder = o.placeholder || '';
    }

    /* névtelenül, hogy többszöri hívásnál ne halmozódjanak a kezelők */
    modal.querySelectorAll('[data-modal-close]').forEach(function (btn) {
      btn.onclick = function () { close(null); };
    });
    if (ok) ok.onclick = function () { close(input ? input.value : ''); };

    modal.hidden = false;
    document.body.classList.add('adm-modal-open');
    modal.addEventListener('keydown', onKey);

    if (input){
      window.setTimeout(function () {
        if (modal.hidden) return;
        input.focus();
        input.select();
      }, 40);
    }
  });
}

function approveTeam(teamId){
  const t = db.teams.find(x => x.id === teamId);
  if (!t) return;
  const issues = teamIssues(t).filter(i => i.hard);
  if (issues.length){
    const ok = confirm(
      'FIGYELEM — a csapat hibás:\n\n' +
      issues.map(i => '• ' + i.text.replace(/<\/?b>/g, '')).join('\n') +
      '\n\nMégis jóváhagyod?'
    );
    if (!ok) return;
  }
  t.status = 'approved';
  t.approvedAt = new Date().toISOString();
  log('Nevezés jóváhagyva', t.name + ' · ' + comp(t.comp).short);
  save();
  renderAll();
  toast(t.name + ' jóváhagyva.');
}

async function rejectTeam(teamId){
  const t = db.teams.find(x => x.id === teamId);
  if (!t) return;
  const reason = await askText({
    title: 'Nevezés elutasítása',
    text: t.name + ' — az indok bekerül a naplóba.',
    value: 'Hiányos létszám',
    okText: 'Elutasítás'
  });
  if (reason === null) return;
  t.status = 'rejected';
  t.rejectReason = reason || 'nincs megadva';
  log('Nevezés elutasítva', t.name + ' — ' + t.rejectReason);
  save();
  renderAll();
  toast(t.name + ' elutasítva.', true);
}

function undoTteam(teamId){
  const t = db.teams.find(x => x.id === teamId);
  if (!t) return;
  t.status = 'pending';
  log('Nevezés visszaállítva', t.name + ' → jóváhagyásra vár');
  save();
  renderAll();
  toast(t.name + ' visszakerült a függő listára.');
}

function scheduleMatch(){
  const compId = $('#sfComp').value;
  const c = comp(compId);
  const a = $('#sfTeamA').value;
  const b = $('#sfTeamB').value;
  const date = $('#sfDate').value;
  const time = $('#sfTime').value;
  const room = $('#sfRoom').value;
  const round = parseInt($('#sfRound').value, 10) || 1;
  const bestOf = parseInt($('#sfBestOf').value, 10) || 1;

  if (!date || !time){ toast('Dátum és kezdés kötelező.', true); return; }
  if (!a || !b){ toast('Válassz két csapatot.', true); return; }
  if (a === b){ toast('Ugyanaz a csapat nem játszhat önmagával.', true); return; }

  const info = dayInfo(date);
  if (info){
    const ok = confirm(fmtShort(date) + ' ' + info.name + ' — nem tanítási nap.\n\nBiztosan erre a napra teszed a mérkőzést?');
    if (!ok) return;
  }

  const candidate = { id: null, comp: compId, a, b, date, time, room };
  if (matchConflicts(candidate).length){
    toast('Ütközés: ebben az időpontban már van meccs ebben a teremben vagy az egyik csapatnak.', true);
    return;
  }

  const tA = teamById(a), tB = teamById(b);
  const match = {
    id: uid('m'),
    comp: compId,
    round,
    stage: 'group',
    a, b,
    date, time, room, bestOf,
    scoreA: '',
    scoreB: '',
    status: 'scheduled',
    reportedBy: ''
  };
  db.matches.push(match);
  log('Mérkőzés beütemezve', tA.name + ' vs ' + tB.name + ' · ' + fmtShort(date) + ' ' + time + ' · ' + room);
  save();
  renderAll();
  $('#sfTeamA').value = '';
  $('#sfTeamB').value = '';
  updateSchedWarn();
  toast('Beütemezve: ' + tA.name + ' vs ' + tB.name);
}

function deleteMatch(matchId){
  const m = db.matches.find(x => x.id === matchId);
  if (!m) return;
  const a = teamById(m.a), b = teamById(m.b);
  if (!confirm('Törlöd a mérkőzést? ' + (a ? a.name : '?') + ' vs ' + (b ? b.name : '?') + ' · ' + fmtShort(m.date))) return;
  db.matches = db.matches.filter(x => x.id !== matchId);
  log('Mérkőzés törölve', (a ? a.name : '?') + ' vs ' + (b ? b.name : '?') + ' · ' + fmtShort(m.date));
  save();
  renderAll();
  toast('Mérkőzés törölve.');
}

/* =========================================================
   ESEMÉNYEK
   ========================================================= */
function setTab(tab){
  ui.tab = tab;
  $$('.adm-tab').forEach(btn => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle('active', on);
    if (on) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  $$('.adm-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
  const t = TITLES[tab] || TITLES.eredmeny;
  const h = $('#admTitle'), s = $('#admSub');
  if (h) h.textContent = t[0];
  if (s) s.textContent = t[1];
  if (tab === 'utemezes') renderScheduleForm();
  if (tab === 'nevezesek' || tab === 'eredmeny' || tab === 'hirek' || tab === 'naptar' || tab === 'tabella') refreshData();
  document.title = 'KERIGAMES — ' + t[0];
  window.scrollTo({ top: 0, behavior: 'auto' });
}

async function init(){
  db = await load();
  showOfflineNote();

  $('#adminTabs').addEventListener('click', e => {
    const btn = e.target.closest('.adm-tab');
    if (btn) setTab(btn.dataset.tab);
  });

  $('#resultCompSwitch').addEventListener('click', e => {
    const btn = e.target.closest('[data-comp]');
    if (!btn) return;
    ui.resultComp = btn.dataset.comp;
    renderResultCompSwitch();
    renderResults();
  });

  $('#hideDone').addEventListener('change', e => {
    ui.hideDone = e.target.checked;
    renderResults();
  });

  $('#resultList').addEventListener('click', e => {
    const card = e.target.closest('[data-match]');
    if (!card) return;
    const id = card.dataset.match;
    if (e.target.closest('[data-act="save"]')) saveResult(id, card);
  });

  $('#resultList').addEventListener('change', e => {
    const sel = e.target.closest('[data-act="noshow"]');
    if (!sel || !sel.value) return;
    const card = sel.closest('[data-match]');
    if (card) markNoShow(card.dataset.match, sel.value, sel);
  });

  $('#teamFilter').addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    ui.teamFilter = btn.dataset.filter;
    $$('#teamFilter .adm-seg-item').forEach(b => {
      const on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    renderTeams();
  });

  $('#teamList').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = e.target.closest('[data-team]');
    if (!card) return;
    const id = card.dataset.team;
    const act = btn.dataset.act;
    if (act === 'approve') approveTeam(id);
    else if (act === 'reject') rejectTeam(id);
    else if (act === 'undo') undoTteam(id);
  });

  $('#scheduleForm').addEventListener('submit', e => {
    e.preventDefault();
    scheduleMatch();
  });
  ['#sfComp', '#sfDate', '#sfTeamA', '#sfTeamB'].forEach(sel => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('change', () => {
      if (sel === '#sfComp') renderScheduleForm();
      else updateSchedWarn();
    });
  });

  $('#schedList').addEventListener('click', e => {
    const btn = e.target.closest('[data-act="del"]');
    if (!btn) return;
    const row = e.target.closest('[data-match]');
    if (row) deleteMatch(row.dataset.match);
  });

  $('#resetDemo').addEventListener('click', async () => {
    if (OFFLINE){ location.reload(); return; }
    if (!confirm('Visszaállítja a szerver adatait a demó alaphelyzetre? A módosítások elvesznek.')) return;
    try { await Api.reset(); }
    catch (err) { toast('Visszaállítás nem sikerült: ' + err.message, true); return; }
    db = await load();
    setTab('eredmeny');
    renderAll();
    toast('Adatok visszaállítva a demó alaphelyzetre.');
  });

  /* ---------- hírek ---------- */
  const newsForm = $('#newsForm');
  if (newsForm) newsForm.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      date: $('#nfDate').value,
      tag: $('#nfTag').value,
      title: $('#nfTitle').value.trim(),
      link: $('#nfLink').value.trim(),
      season: $('#nfSeason').value,
      image: newsImageNew || newsImageOld || ''
    };
    if (!payload.date || payload.title.length < 3){ toast('Dátum és legalább 3 karakteres cím kell.', true); return; }
    const editing = ui.newsEditId;
    try {
      if (editing) await Api.newsUpdate(editing, payload);
      else await Api.newsCreate(payload);
      resetNewsForm();
      await refreshData();
      toast(editing ? 'Hír módosítva.' : 'Hír hozzáadva — megjelenik a kezdőlapon.');
    } catch (err) { toast('Mentés nem sikerült: ' + err.message, true); }
  });
  const nfCancel = $('#nfCancel');
  if (nfCancel) nfCancel.addEventListener('click', () => resetNewsForm());

  const nfImage = $('#nfImage');
  if (nfImage) nfImage.addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)){
      toast('Csak JPG, PNG vagy WEBP kép tölthető fel.', true);
      e.target.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024){
      toast('A kép legfeljebb 8 MB lehet.', true);
      e.target.value = '';
      return;
    }
    try {
      newsImageNew = await resizeImageFile(file, 1800);
      const kb = Math.round(newsImageNew.length * 3 / 4 / 1024);
      newsImgUi();
      const note = $('#newsImgNote');
      if (note) note.textContent = 'Új kép · ' + kb + ' KB — mentésre vár';
      toast('Kép előkészítve (' + kb + ' KB).');
    } catch (err) {
      toast(err.message, true);
      e.target.value = '';
    }
  });

  const nfImageClear = $('#nfImageClear');
  if (nfImageClear) nfImageClear.addEventListener('click', () => {
    resetNewsImage();
    toast('Kép eltávolítva — mentéskor törlődik.');
  });
  const newsList = $('#newsList');
  if (newsList) newsList.addEventListener('click', async e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('[data-news]');
    if (!row) return;
    const id = row.dataset.news;
    if (btn.dataset.act === 'edit') return editNews(id);
    if (btn.dataset.act !== 'del') return;
    const n = (db.news || []).find(x => x.id === id);
    if (!confirm('Törlöd ezt a hírt?\n\n' + (n ? n.title : ''))) return;
    try { await Api.newsDelete(id); await refreshData(); toast('Hír törölve.'); }
    catch (err) { toast('Törlés nem sikerült: ' + err.message, true); }
  });

  /* ---------- naptár ---------- */
  const eventForm = $('#eventForm');
  if (eventForm) eventForm.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      date: $('#efDate').value,
      time: $('#efTime').value,
      type: $('#efType').value,
      title: $('#efTitle').value.trim(),
      note: $('#efNote').value.trim(),
      comp: $('#efComp').value,
      round: Math.max(1, Math.min(30, Number($('#efRound').value) || 1))
    };
    if (!payload.date || payload.title.length < 2){ toast('Dátum és legalább 2 karakteres megnevezés kell.', true); return; }
    const info = dayInfo(payload.date);
    if (info && !confirm(fmtShort(payload.date) + ' ' + info.name + ' — nem tanítási nap.\n\nBiztosan erre a napra teszed?')) return;
    const editing = ui.eventEditId;
    try {
      let saved = null;
      if (editing) saved = await Api.eventUpdate(editing, payload);
      else await Api.eventCreate(payload);
      resetEventForm();
      await refreshData();
      if (saved && saved.moved){
        let msg = 'Esemény módosítva · ' + saved.moved + ' meccs áthelyezve.';
        if (saved.conflicts && saved.conflicts.length){
          msg += ' ' + saved.conflicts.length + ' meccs ütközik: ' + saved.conflicts.join(' | ');
        }
        if (saved.kept) msg += ' ' + saved.kept + ' lejátszott meccs a helyén maradt.';
        toast(msg, !!(saved.conflicts && saved.conflicts.length));
      } else if (saved && saved.kept){
        toast('Esemény módosítva · ' + saved.kept + ' lejátszott meccs a helyén maradt.', true);
      } else {
        toast(editing ? 'Esemény módosítva.' : 'Esemény hozzáadva a naptárhoz.');
      }
    } catch (err) { toast('Mentés nem sikerült: ' + err.message, true); }
  });
  const efCancel = $('#efCancel');
  if (efCancel) efCancel.addEventListener('click', () => resetEventForm());
  const efDate = $('#efDate');
  if (efDate) efDate.addEventListener('change', updateEventWarn);
  const eventList = $('#eventList');
  if (eventList) eventList.addEventListener('click', async e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('[data-event]');
    if (!row) return;
    const id = row.dataset.event;
    if (btn.dataset.act === 'gen'){
      const ev = (db.events || []).find(x => x.id === id);
      const round = Math.max(1, Number(ev && ev.round) || 1);
      if (!confirm('Legenerálom a(z) ' + ((ev && ev.title) || '') + ' meccseit a jóváhagyott csapatokból?\n\n' +
        'Forduló: ' + round + '. · időpontok: ' + ((ev && ev.time) || '14:00') + '-tól, óránként')) return;
      try {
        const res = await Api.eventMatches(id, {});
        await refreshData();
        if (res.created){
          toast(res.created + ' meccs felvéve' + (res.skipped ? ' · ' + res.skipped + ' kihagyva (már létezik vagy ütközik)' : '') + '.');
        } else {
          toast('Nincs új meccs — minden párosítás létezik vagy ütközik.', true);
        }
      } catch (err) {
        toast('Generálás nem sikerült: ' + err.message, true);
      }
      return;
    }
    if (btn.dataset.act === 'edit') return editEvent(id);
    if (btn.dataset.act !== 'del') return;
    const ev = (db.events || []).find(x => x.id === id);
    if (!confirm('Törlöd ezt az eseményt?\n\n' + (ev ? ev.title : ''))) return;
    try { await Api.eventDelete(id); await refreshData(); toast('Esemény törölve.'); }
    catch (err) { toast('Törlés nem sikerült: ' + err.message, true); }
  });

  /* ---------- tabella ---------- */
  const tableSeg = $('#tableCompSwitch');
  if (tableSeg) tableSeg.addEventListener('click', e => {
    const btn = e.target.closest('[data-comp]');
    if (!btn) return;
    ui.tableComp = btn.dataset.comp;
    renderTableAdmin();
  });
  const tableHost = $('#tableAdmin');
  if (tableHost) tableHost.addEventListener('click', async e => {
    const btn = e.target.closest('[data-act="save"]');
    if (!btn) return;
    const row = btn.closest('[data-team]');
    if (!row) return;
    const points = Number(row.querySelector('[data-adjust]').value || 0);
    const note = row.querySelector('[data-note]').value.trim();
    if (!Number.isInteger(points) || points < -100 || points > 100){
      toast('A korrekció -100 és 100 közötti egész szám legyen.', true);
      return;
    }
    try { await Api.teamAdjust(row.dataset.team, points, note); await refreshData(); toast('Pontkorrekció mentve.'); }
    catch (err) { toast('Nem sikerült: ' + err.message, true); }
  });

  resetNewsForm();
  resetEventForm();

  /* ha a tanár visszavált az ablakra, frissüljön a lista */
  window.addEventListener('focus', refreshData);

  /* mai dátum alapértékként az ütemezésnél */
  const dateEl = $('#sfDate');
  if (dateEl && !dateEl.value) dateEl.value = todayKey();

  setTab('eredmeny');
  renderAll();
  updateSchedWarn();
}

/* jelzés, ha az adatkiszolgáló nem érhető el */
function showOfflineNote(){
  const old = document.getElementById('admOffline');
  if (old) old.remove();
  if (!OFFLINE) return;
  const main = document.querySelector('.adm-main');
  if (!main) return;
  const note = document.createElement('div');
  note.id = 'admOffline';
  note.className = 'adm-warn is-error';
  note.style.margin = '0 0 18px';
  note.innerHTML = '<b>Az adatkiszolgáló nem érhető el.</b> A felület demó adatot mutat, és a módosítások nem mentődnek. ' +
    'Indítsd a projekt mappájában: <code>npm start</code> → <code>http://127.0.0.1:8124</code>';
  main.insertBefore(note, main.children[1] || null);
}

/* ---------- indítás: előbb bejelentkezés, utána az app ---------- */
let booted = false;
function boot(session){
  currentActor = (session && session.email) || 'tanár';
  if (booted) return;
  booted = true;
  init();
}

document.addEventListener('DOMContentLoaded', function () {
  AdminAuth.init({ onAuth: boot });
});
