/* =========================================================
   KERI//ESPORTS — közös oldal-logika (nincs külső API)
   Minden render-védett: ha egy elem nincs az oldalon, kihagyja.
   ========================================================= */
'use strict';

const BAD_WORDS = ['fuck', 'shit', 'bitch', 'kurva', 'fasz', 'picsa', 'geci', 'basz', 'segg'];
const MONTHS_HU = ['január','február','március','április','május','június','július','augusztus','szeptember','október','november','december'];
const DOW_HU = ['H','K','Sze','Cs','P','Szo','V'];
const DAY_LABEL = { deadline: 'Nevezési határidő', match: 'Mérkőzésnap', final: 'Döntő nap' };
const KEY_DATES = {
  '2026-03-29': { type:'deadline', title:'Nevezési határidő', desc:'Utolsó nap a csapatregisztrációra. A jelentkezés a Jelentkezés oldalon lévő űrlapon történik.' },
  '2026-03-31': { type:'match', title:'Selejtező · 1. nap', desc:'8:00 eligazítás az első emeleti aulában, utána meccsek a 304-es teremben. Saját periféria hozható.' },
  '2026-04-01': { type:'match', title:'Selejtező · 2. nap', desc:'Középdöntők délelőtt, majd az iskolai döntő 14:00-kor a 304-es teremben.' },
  '2026-04-13': { type:'final', title:'Nagydöntő', desc:'A legjobb csapat képviseli a Kerit más iskolák ellen a fődíjért.' }
};

const state = {
  season: '2026/27',
  userTeam: null,
  isEditMode: false
};

/* ---------- helpers ---------- */
function $(sel){ return document.querySelector(sel); }
function $$(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function esc(text){
  if (!text) return '';
  return String(text).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
  });
}
function setText(id, text){
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function containsBadWords(text){
  if (!text) return false;
  const lower = text.toLowerCase();
  return BAD_WORDS.some(w => lower.includes(w));
}
function dateKey(value){
  if (!value) return null;
  const m = String(value).match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return null;
  return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
}
function parsePlayers(data){
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return String(data).split(',').map(p => p.trim()).filter(Boolean);
}
function toast(message, isError){
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.setAttribute('role', 'status');
  const ico = document.createElement('span');
  ico.className = 'toast-ico';
  ico.setAttribute('aria-hidden', 'true');
  ico.textContent = isError ? '!' : '✓';
  const msg = document.createElement('span');
  msg.className = 'toast-msg';
  msg.textContent = message;
  const bar = document.createElement('i');
  bar.className = 'toast-bar';
  bar.setAttribute('aria-hidden', 'true');
  el.appendChild(ico); el.appendChild(msg); el.appendChild(bar);
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  /* bezáródás-sáv: hoverkor megáll, kattintásra azonnal bezár */
  const DUR = 3200;
  let remaining = DUR, start = 0, timer = 0;
  function close(){
    clearTimeout(timer);
    el.classList.remove('show');
    setTimeout(() => el.remove(), 450);
  }
  function arm(ms){
    remaining = ms; start = Date.now();
    timer = setTimeout(close, ms);
  }
  arm(DUR);
  el.addEventListener('mouseenter', () => {
    clearTimeout(timer);
    remaining = Math.max(remaining - (Date.now() - start), 600);
    el.classList.add('paused');
  });
  el.addEventListener('mouseleave', () => {
    if (!el.classList.contains('paused')) return;
    el.classList.remove('paused');
    arm(remaining);
  });
  el.addEventListener('click', close);
}

/* ---------- season data access ---------- */
function season(){ return SEASONS[state.season]; }
function localTeams(){
  if (state.season !== '2026/27' || !state.userTeam) return [];
  /* a jóváhagyásra váró (vagy elutasított) csapat még nem publikus */
  if (state.userTeam.status === 'pending' || state.userTeam.status === 'rejected') return [];
  return [Object.assign({ local: true }, state.userTeam)];
}
function allTeams(){ return localTeams().concat(season().teams); }

/* ---------- szerver-adatok: a valódi adatforrás (Node API) ---------- */
const SERVER = { competition: 'cs2-2026-27', loaded: false };
const SERVER_EVENTS = [];

/* a szerver hírei az adminból — a NEWS tömböt helyben cseréljük (const, de a tartalma igen) */
function applyServerNews(list){
  if (typeof NEWS === 'undefined' || !Array.isArray(list)) return;
  NEWS.length = 0;
  list.forEach(function (n) {
    if (!n || !n.title) return;
    NEWS.push({
      season: n.season || '2026/27',
      date: n.date,
      tag: n.tag || 'Hír',
      title: n.title,
      link: n.link || '#',
      image: n.image || ''
    });
  });
}

/* a szerver eseményei — bekerülnek a naptárba és a felső eseménysávba */
function applyServerEvents(list){
  if (!Array.isArray(list)) return;
  SERVER_EVENTS.length = 0;
  list.forEach(function (e) {
    if (!e || !e.date || !e.title) return;
    SERVER_EVENTS.push(e);
    KEY_DATES[e.date] = {
      type: e.type === 'deadline' ? 'deadline' : (e.type === 'final' ? 'final' : 'match'),
      title: e.title,
      desc: e.note || '',
      time: e.time || ''
    };
  });
}

async function loadServerView(){
  try {
    const res = await fetch('/api/site', { cache: 'no-store' });
    if (!res.ok) return;
    const view = await res.json();
    if (!view || !Array.isArray(view.teams)) return;
    const seasonData = SEASONS['2026/27'];
    if (!seasonData) return;
    seasonData.teams = view.teams.map(function (t) {
      return { name: t.name, players: t.players, captainEmail: t.captainEmail, teacher: t.teacher };
    });
    seasonData.matches = view.standings || [];
    seasonData.schedule = view.schedule || [];
    if (Array.isArray(view.news)) applyServerNews(view.news);
    if (Array.isArray(view.events)) applyServerEvents(view.events);
    if (view.competition) SERVER.competition = view.competition;
    SERVER.loaded = true;
    renderAll();
  } catch (e) {
    /* nincs adatkiszolgáló (pl. fájlból nyitva) → a beépített adat marad */
  }
}

async function sendRegistration(payload){
  const res = await fetch('/api/teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  let body = {};
  try { body = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(body.error || ('Hiba: ' + res.status));
  return body;
}

/* ---------- renderers (mindenhol védett) ---------- */
const STAT_IDS = ['statTeams', 'statPlayers', 'statWins', 'statRooms'];

function countUp(el, to, dur){
  if (!el) return;
  to = +to || 0;
  const from = parseInt(el.textContent, 10) || 0;
  if (el._raf) cancelAnimationFrame(el._raf);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || from === to){
    el.textContent = to;
    return;
  }
  const t0 = performance.now();
  dur = dur || 950;
  function step(now){
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) el._raf = requestAnimationFrame(step);
    else { el._raf = 0; el.textContent = to; }
  }
  el._raf = requestAnimationFrame(step);
}

/* a számok akkor pörögnek fel, amikor a stats-sáv először láthatóvá válik */
function runCounters(){
  const strip = $('.stats-strip');
  if (!strip || strip.dataset.counted !== '1') return;
  STAT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.dataset.to != null) countUp(el, el.dataset.to);
  });
}

function renderStats(){
  const teams = allTeams();
  const players = teams.reduce((n, t) => n + parsePlayers(t.players).length, 0);
  const targets = { statTeams: teams.length, statPlayers: players };
  STAT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    /* a fix értékekből (10, 304) egyszer kiolvassuk a célt */
    if (el.dataset.to == null) el.dataset.to = parseInt(el.textContent, 10) || 0;
    if (id in targets) el.dataset.to = targets[id];
  });
  runCounters();
  setText('fstatSeason', state.season);
  setText('fstatTeams', teams.length + ' csapat');
  setText('fstatMatches', season().matches.length + ' meccs');
}

function renderRosters(){
  const host = $('#teams-container');
  if (!host) return;
  const teams = allTeams();
  if (!teams.length){
    host.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">🎮</div>' +
        '<h3>A ' + esc(state.season) + '-es mezőny még nem nyilvános</h3>' +
        '<p>' + (state.season === '2026/27'
          ? 'A nevezések hamarosan elindulnak — legyél te az első csapat a listán. A tavalyi archívumot a fejléc lévő kapcsolóval nézheted meg.'
          : 'Ebben a szezonban nem voltak nevezett csapatok.') + '</p>' +
        (state.season === '2026/27'
          ? '<button class="btn-outline" data-go="jelentkezes">Nevezés indítása</button>'
          : '<button class="btn-outline" id="emptyBackLive">Vissza a 2026/27-es szezonhoz</button>') +
      '</div>';
    const back = $('#emptyBackLive');
    if (back) back.addEventListener('click', () => setSeason('2026/27'));
    return;
  }
  host.innerHTML = '<div class="roster-grid">' + teams.map((t, i) => {
    const players = parsePlayers(t.players);
    const tag = t.local ? '<span class="team-tag you">TE</span>'
                        : '<span class="team-tag">#' + (i + 1) + '</span>';
    return '<article class="roster-card shine">' +
      '<div class="team-title"><h3>' + esc(t.name) + '</h3>' + tag + '</div>' +
      players.map((p, j) =>
        '<div class="player-entry"><span class="player-role">Játékos ' + (j + 1) + '</span><span><strong>' + esc(p) + '</strong></span></div>'
      ).join('') +
      '<div class="player-entry" style="margin-top:12px"><span class="player-role">Kapitány</span><span>' + esc(t.captainEmail) + '</span></div>' +
      (t.teacher ? '<div class="player-entry"><span class="player-role">Osztályfőnök</span><span>' + esc(t.teacher) + '</span></div>' : '') +
    '</article>';
  }).join('') + '</div>';
}

function renderSchedule(){
  const host = $('#schedule-container');
  if (!host) return;
  const list = season().schedule;
  if (!list.length){
    host.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">🗓️</div>' +
        '<h3>A menetrend összeállítás alatt</h3>' +
        '<p>' + (state.season === '2026/27'
          ? 'A 2026/27-es fordulók beosztása a nevezések lezárása után készül el — várhatóan február végén. Kapcsolj át a 2025/26-os archívumra, ha a tavalyi menetrendet néznéd.'
          : 'Ebben a szezonban nem hirdettek meg fordulókat.') + '</p>' +
        '<button class="btn-outline" id="schedBack">Megnézem a 2025/26-os menetrendet</button>' +
      '</div>';
    const back = $('#schedBack');
    if (back) back.addEventListener('click', () => setSeason('2025/26'));
    return;
  }
  host.innerHTML = '<div class="schedule-grid">' + list.map(m => {
    const isFinal = /döntő/i.test(m.stage || '');
    const stage = esc(m.stage || 'mérkőzés');
    return '<article class="match-card shine" data-date="' + esc(dateKey(m.date) || '') + '">' +
      '<div class="match-top">' +
        '<span class="match-date">' + esc(m.date) + ' · ' + esc(m.time || 'TBA') + '</span>' +
        '<span class="match-stage' + (isFinal ? ' donto' : '') + '">' + stage + '</span>' +
      '</div>' +
      '<div class="match-teams"><span>' + esc(m.team1) + '</span><span class="vs">VS</span><span>' + esc(m.team2) + '</span></div>' +
      '<div class="match-meta"><span>📍 ' + esc(m.location || '304-es terem') + '</span><span>' + esc(state.season) + '</span></div>' +
    '</article>';
  }).join('') + '</div>';
}

function renderStandings(){
  const host = $('#matches-container');
  if (!host) return;
  const header =
    '<div class="scoreboard-row scoreboard-header">' +
      '<div>#</div><div>Csapat</div><div>GY</div><div>V</div><div class="hide-sm">Lej.</div><div>Pont</div>' +
    '</div>';
  const rows = season().matches.slice().sort((a, b) => (b.points || 0) - (a.points || 0));
  if (!rows.length){
    host.innerHTML = header +
      '<div class="empty-state" style="padding:38px 24px">' +
        '<div class="empty-icon">📊</div>' +
        '<h3>Még nincs lejátszott mérkőzés</h3>' +
        '<p>A tabella az első forduló után éled — ' + esc(state.season) + ' szezonban ' +
        (state.season === '2026/27' ? 'a nevezések után.' : 'nem volt kiírt meccs.') + '</p>' +
      '</div>';
    return;
  }
  host.innerHTML = header + rows.map((m, i) =>
    '<div class="scoreboard-row' + (i < 4 ? ' top4' : '') + '">' +
      '<div class="rank-number">' + (i + 1) + '</div>' +
      '<div class="team-name">' + esc(m.teamName) + '</div>' +
      '<div>' + (m.wins || 0) + '</div>' +
      '<div>' + (m.losses || 0) + '</div>' +
      '<div class="hide-sm">' + (m.matchesPlayed || 0) + '</div>' +
      '<div class="pts">' + (m.points || 0) + '</div>' +
    '</div>'
  ).join('');
}

/* ---------- calendar (lapozható tanévi naptár) ---------- */
let daysByDate = {};
let selectedKey = null;
let calMonths = [];
let calIdx = 0;
let calSeason = null;

function schoolYear(){
  if (typeof SCHOOL_YEARS === 'undefined') return null;
  return SCHOOL_YEARS[state.season] || SCHOOL_YEARS['2026/27'] || null;
}

/* ünnepek + szünetek + első/utolsó tanítási nap → napi leképezés (memoizált, admin-kész) */
function schoolDays(sy){
  if (!sy) return {};
  if (sy._days) return sy._days;
  const map = {};
  (sy.holidays || []).forEach(h => { map[h.d] = { type: 'holiday', name: h.name }; });
  (sy.breaks || []).forEach(b => {
    const to = new Date(b.to + 'T00:00:00');
    const d = new Date(b.from + 'T00:00:00');
    while (d <= to){
      const k = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      if (!map[k]) map[k] = { type: 'brk', name: b.name };
      d.setDate(d.getDate() + 1);
    }
  });
  if (sy.first) map[sy.first] = { type: 'first', name: 'Első tanítási nap' };
  if (sy.last) map[sy.last] = { type: 'last', name: 'Utolsó tanítási nap' };
  sy._days = map;
  return map;
}

const SCHOOL_TYPE_LABEL = { holiday: 'Ünnepnap', brk: 'Tanítási szünet', first: 'Első tanítási nap', last: 'Utolsó tanítási nap' };
const SCHOOL_TYPE_DESC = {
  holiday: 'Munkaszüneti nap — nincs tanítás.',
  brk: 'Iskolai szünet — nincs tanítás.',
  first: 'A tanév első tanítási napja.',
  last: 'A tanév utolsó tanítási napja.'
};

function dayInfo(key){
  const matches = daysByDate[key] || [];
  const info = KEY_DATES[key] || null;
  let type = info ? info.type : null;
  if (matches.length){
    type = matches.some(x => /döntő/i.test(x.stage || '')) ? 'final' : 'match';
  }
  const sy = schoolYear();
  const school = sy ? (schoolDays(sy)[key] || null) : null;
  return { info, matches, type, school };
}

function buildMonth(hostId, year, month){
  const grid = document.getElementById(hostId);
  if (!grid) return;
  grid.innerHTML = '';
  DOW_HU.forEach(d => {
    const head = document.createElement('div');
    head.className = 'cal-dow';
    head.textContent = d;
    grid.appendChild(head);
  });
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const total = new Date(year, month, 0).getDate();
  for (let b = 0; b < offset; b++){
    const blank = document.createElement('div');
    blank.className = 'cal-day empty';
    grid.appendChild(blank);
  }
  for (let d = 1; d <= total; d++){
    const key = year + '-' + pad(month) + '-' + pad(d);
    const info = dayInfo(key);
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.innerHTML = '<span>' + d + '</span><span class="dot"></span>';
    if (info.type || info.school){
      cell.classList.add('has');
      if (info.type === 'deadline') cell.classList.add('deadline');
      if (info.type === 'final') cell.classList.add('final');
      if (!info.type && info.school) cell.classList.add(info.school.type); /* holiday / brk / first / last */
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('data-date', key);
      cell.setAttribute('title', info.info ? info.info.title
        : info.type ? DAY_LABEL[info.type]
        : (info.school.name + ' — ' + SCHOOL_TYPE_LABEL[info.school.type]));
      const pick = () => selectDay(key, cell);
      cell.addEventListener('click', pick);
      cell.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pick(); }
      });
    }
    grid.appendChild(cell);
  }
}

function selectDay(key, cell){
  $$('.cal-day.selected').forEach(el => el.classList.remove('selected'));
  if (cell) cell.classList.add('selected');
  selectedKey = key;
  const box = $('#calDetail');
  if (!box) return;
  const parts = key.split('-');
  const info = dayInfo(key);
  const label = info.type ? DAY_LABEL[info.type]
    : info.school ? SCHOOL_TYPE_LABEL[info.school.type] : 'Fontos dátum';
  const sub = (+parts[0]) + '. ' + MONTHS_HU[+parts[1] - 1] + ' ' + (+parts[2]) + '. · ' + label;
  let html = '<div class="cd-sub">' + esc(sub) + '</div>';
  if (info.info){
    html += '<h4>' + esc(info.info.title) + '</h4><p style="color:var(--ink-2);margin:0">' + esc(info.info.desc) + '</p>';
  } else if (info.school && !info.matches.length){
    html += '<h4>' + esc(info.school.name) + '</h4>' +
      '<p style="color:var(--ink-2);margin:0">' + esc(SCHOOL_TYPE_DESC[info.school.type]) + '</p>';
  } else {
    html += '<h4>' + (info.matches.length ? 'Mérkőzések' : 'Nincs program') + '</h4>';
  }
  if (info.matches.length){
    html += '<div style="margin-top:16px">' + info.matches.map(m =>
      '<div class="cd-match"><span><b>' + esc(m.team1) + '</b> <span style="color:var(--ink-3)">vs</span> <b>' + esc(m.team2) + '</b></span>' +
      '<span class="cd-time">' + esc(m.time || 'TBA') + '</span></div>'
    ).join('') + '</div>';
    html += '<a href="#merkozesek" class="cd-jump">Ugrás a mérkőzésekhez →</a>';
  } else if (!info.info && !info.school){
    html += '<p class="cd-empty">Ezen a napon nincs kiírt mérkőzés.</p>';
  } else if (info.school && info.matches.length){
    html += '<p class="cd-empty">Ezen a napon tanítási szünet van, mégis van kiírt mérkőzés.</p>';
  }
  box.innerHTML = html;
}

function renderCalendar(){
  const host = $('#calendarHost');
  if (!host) return;
  const timeline = $('#timeline');
  const list = season().schedule;
  daysByDate = {};
  list.forEach(m => {
    const k = dateKey(m.date);
    if (!k) return;
    (daysByDate[k] = daysByDate[k] || []).push(m);
  });

  const sy = schoolYear();
  const months = (sy && sy.months ? sy.months : []).map(ym => ({
    ym, y: +ym.slice(0, 4), m: +ym.slice(5, 7)
  }));
  const hasData = Object.keys(daysByDate).length > 0;
  const calNote = $('#calNote');

  if (!months.length){
    host.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">📅</div>' +
        '<h3>A ' + esc(state.season) + '-os tanév naptára hamarosan</h3>' +
        '<p>A tanév rendjének feltöltése folyamatban. A 2025/26-os archívum a fejléc kapcsolójával érhető el.</p>' +
        '<button class="btn-outline" id="calBack">Megnézem a tavalyi naptárat</button>' +
      '</div>';
    const back = $('#calBack');
    if (back) back.addEventListener('click', () => setSeason('2025/26'));
    if (timeline) timeline.style.display = 'none';
    if (calNote) calNote.textContent = 'A tanév naptára hamarosan elérhető';
    return;
  }

  if (timeline) timeline.style.display = (hasData || SERVER_EVENTS.length) ? '' : 'none';

  /* az idővonal az adminból felvett eseményekből épül, ha van ilyen */
  if (timeline && SERVER_EVENTS.length){
    timeline.innerHTML = SERVER_EVENTS.slice()
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })
      .map(function (e) {
        return '<div class="tl-item' + (e.type === 'final' ? ' final' : '') + '">' +
          '<div class="tl-date">' + esc(fmtDateHu(e.date)) + (e.time ? ' · ' + esc(e.time) : '') + '</div>' +
          '<h4>' + esc(e.title) + '</h4>' +
          (e.note ? '<p>' + esc(e.note) + '</p>' : '') +
        '</div>';
      }).join('');
  }
  if (calNote) calNote.textContent = hasData
    ? 'A színezett napok: ünnep, szünet, első/utolsó tanítási nap — kattints a részletekért'
    : 'Az iskolai ünnepek és szünetek már láthatók — a fordulók hamarosan';

  /* szezonváltáskor alaphelyzet: mai hónap, ha a tanévben vagyunk, különben az első esemény hónapja */
  const seasonChanged = calSeason !== state.season;
  if (seasonChanged || calIdx < 0 || calIdx >= months.length){
    const now = new Date();
    const curYm = now.getFullYear() + '-' + pad(now.getMonth() + 1);
    const inYear = months.findIndex(mo => mo.ym === curYm);
    if (inYear >= 0){
      calIdx = inYear;
    } else {
      const firstEvent = Object.keys(daysByDate).sort()[0];
      const evIdx = firstEvent ? months.findIndex(mo => mo.ym === firstEvent.slice(0, 7)) : -1;
      calIdx = evIdx >= 0 ? evIdx : 0;
    }
    calSeason = state.season;
  }
  calMonths = months;

  const chips = months.map((mo, i) => {
    const name = MONTHS_HU[mo.m - 1];
    const short = name.charAt(0).toUpperCase() + name.slice(1, 3);
    return '<button type="button" class="cal-chip" data-i="' + i + '" aria-label="' + name + ' ' + mo.y + '">' + short + '</button>';
  }).join('');

  host.innerHTML =
    '<div class="cal-single">' +
      '<div class="cal-pager">' +
        '<button type="button" class="cal-nav" id="calPrev" aria-label="Előző hónap">‹</button>' +
        '<div class="cal-ptitle">' +
          '<span class="cal-year" id="calYearLabel"></span>' +
          '<h3 id="calMonthTitle"></h3>' +
        '</div>' +
        '<button type="button" class="cal-nav" id="calNext" aria-label="Következő hónap">›</button>' +
      '</div>' +
      '<div class="cal-chips" id="calChips" role="tablist" aria-label="Tanév hónapjai">' + chips + '</div>' +
      '<div class="cal-card shine">' +
        '<div class="cal-grid" id="calGrid"></div>' +
      '</div>' +
    '</div>' +
    '<div class="cal-legend">' +
      '<span><i style="background:linear-gradient(135deg,#ffb703,#fb8500)"></i> Nevezési határidő</span>' +
      '<span><i style="background:linear-gradient(135deg,#4f7cff,#8b5cf6)"></i> Mérkőzésnap</span>' +
      '<span><i style="background:linear-gradient(135deg,#22d3ee,#8b5cf6)"></i> Döntő</span>' +
      '<span><i style="background:linear-gradient(135deg,#f43f5e,#fb7185)"></i> Ünnepnap</span>' +
      '<span><i style="background:linear-gradient(135deg,#8b5cf6,#64748b)"></i> Szünet</span>' +
      '<span><i style="background:linear-gradient(135deg,#34d399,#22d3ee)"></i> Első / utolsó tanítási nap</span>' +
      '<span><i style="background:rgba(109,127,157,.5)"></i> Nincs program</span>' +
    '</div>' +
    '<div class="cal-detail" id="calDetail"><div class="cd-sub">Nap részletei</div>' +
    '<p class="cd-empty">Válassz egy napot a naptárban — itt megjelenik, mi történik az adott napon.</p></div>';

  const prev = $('#calPrev'), next = $('#calNext');
  if (prev) prev.addEventListener('click', () => gotoMonth(calIdx - 1));
  if (next) next.addEventListener('click', () => gotoMonth(calIdx + 1));
  $('#calChips')?.addEventListener('click', e => {
    const chip = e.target.closest('.cal-chip');
    if (chip) gotoMonth(+chip.dataset.i);
  });

  renderCalMonth();
}

function gotoMonth(i){
  if (!calMonths.length) return;
  calIdx = Math.max(0, Math.min(calMonths.length - 1, i));
  renderCalMonth();
}

function renderCalMonth(){
  const mo = calMonths[calIdx];
  if (!mo) return;
  const grid = document.getElementById('calGrid');
  if (!grid) return;

  const yl = $('#calYearLabel');
  if (yl) yl.textContent = (calIdx + 1) + ' / ' + calMonths.length + ' · ' + schoolYearLabel();
  const title = $('#calMonthTitle');
  if (title) title.textContent = MONTHS_HU[mo.m - 1] + ' ' + mo.y;

  const chips = $$('.cal-chip');
  chips.forEach((c, i) => {
    const on = i === calIdx;
    c.classList.toggle('active', on);
    c.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const active = chips[calIdx];
  const chipBox = $('#calChips');
  if (active && chipBox){
    /* az aktív chip középre igazítása vízszintes görgetéssel (a bal alsó/szélső értékekre korlátozva) */
    chipBox.scrollLeft = active.offsetLeft - (chipBox.clientWidth - active.offsetWidth) / 2;
  }

  buildMonth('calGrid', mo.y, mo.m);

  /* kijelölés: ha a korábbi nap ebben a hónapban van, maradjon, különben az első kiemelt nap */
  let cell = selectedKey ? grid.querySelector('.cal-day[data-date="' + selectedKey + '"]') : null;
  if (!cell) cell = grid.querySelector('.cal-day.has');
  if (cell) selectDay(cell.getAttribute('data-date'), cell);
  else {
    selectedKey = null;
    const box = $('#calDetail');
    if (box) box.innerHTML = '<div class="cd-sub">' + MONTHS_HU[mo.m - 1] + ' ' + mo.y + ' · Nincs kiemelt nap</div>' +
      '<p class="cd-empty">Ebben a hónapban nincs ünnep, szünet vagy versenynap.</p>';
  }
}

function schoolYearLabel(){
  const sy = schoolYear();
  if (!sy) return state.season;
  return sy.label || state.season;
}

/* ---------- season specific copy ---------- */
function placeSeasonHl(){
  const pop = $('#seasonPop');
  if (!pop) return;
  const hl = pop.querySelector('.sw-hl');
  const act = pop.querySelector('.sw-opt.active') || pop.querySelector('.sw-opt');
  if (!hl || !act) return;
  hl.style.transform = 'translateY(' + act.offsetTop + 'px)';
  hl.style.height = act.offsetHeight + 'px';
}
function syncSeasonOpts(instant){
  const pop = $('#seasonPop');
  if (!pop) return;
  pop.querySelectorAll('.sw-opt').forEach(x => {
    const on = x.dataset.season === state.season;
    x.classList.toggle('active', on);
    x.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const hl = pop.querySelector('.sw-hl');
  const act = pop.querySelector('.sw-opt.active');
  if (!hl || !act) return;
  if (instant){
    const prev = hl.style.transition;
    hl.style.transition = 'none';
    hl.style.transform = 'translateY(' + act.offsetTop + 'px)';
    hl.style.height = act.offsetHeight + 'px';
    void hl.offsetHeight;
    hl.style.transition = prev;
  } else placeSeasonHl();
}
function applySeasonCopy(){
  const live = state.season === '2026/27';
  document.body.classList.toggle('is-archive', !live);

  setText('heroBadge', live ? '2026/27 · KERI CS2 KUPA' : '2025/26 · KERI CS2 KUPA · ARCHÍV');
  setText('metaDate1', live ? 'Hamarosan' : 'Márc. 31 – Ápr. 1.');
  setText('metaDate2', live ? 'Hamarosan' : 'Április 13.');
  setText('deadlineText', live ? 'hamarosan' : 'március 29.');
  setText('firstRoundText', live ? 'Első forduló: március vége' : 'Első forduló: március 31.');
  setText('applyNote', live ? '2026/27-es szezon' : 'Archív nézet — a nevezés zárt');
  setText('calNote', live ? 'A fordulók beosztása hamarosan' : 'Kattints egy napra a részletekért');
  setText('rosterNote', live ? 'Nevezett csapatok a 2026/27-es szezonra' : 'A 2025/26-os szezon mezőnye');
  setText('lmSeason', state.season + '-es szezon');

  const sw = $('#seasonSwitch');
  if (sw){
    sw.classList.toggle('is-archive', !live);
    sw.setAttribute('aria-checked', live ? 'false' : 'true');
    sw.setAttribute('aria-label', 'Tanév váltó — jelenleg: ' + state.season + (live ? ' élő' : ' archív'));
    const label = sw.querySelector('.sw-label');
    const want = state.season + (live ? ' · Élő' : ' · Archív');
    if (label && label.textContent !== want){
      label.classList.add('swapping');
      window.setTimeout(function(){
        const l = $('#seasonSwitch .sw-label');
        if (!l) return;
        const lv = state.season === '2026/27';
        l.textContent = state.season + (lv ? ' · Élő' : ' · Archív');
        l.classList.remove('swapping');
      }, 200);
    }
  }
  syncSeasonOpts();
  const btn = $('#submitBtn');
  if (btn){
    btn.disabled = !live;
    if (!live) btn.textContent = 'Az archív nézetben a nevezés zárt';
    else if (!state.userTeam) btn.textContent = 'Jelentkezés beküldése →';
  }
}

function setSeason(next){
  if (!SEASONS[next] || next === state.season) return;
  state.season = next;
  try { localStorage.setItem('keri_season', next); } catch (e) {}
  selectedKey = null;
  renderAll();
  toast(next === '2026/27'
    ? '🎮 2026/27-es szezon — éles nézet'
    : '🗄️ 2025/26-os archívum betöltve');
}

function renderAll(){
  applySeasonCopy();
  renderStats();
  renderRosters();
  renderSchedule();
  renderStandings();
  renderCalendar();
  renderMatchStrip();
  renderNews();
  renderCountdown();
  updateUserPanel();
  syncChromeHeights();     /* sáv/menü magasság → --strip-h, --nav-h */
}

/* ---------- a kezdőlap teteje: eseménysáv + hír-karusszel (SEGÉDFÜGGVÉNYEK) ---------- */
const MONTHS_HU_SHORT = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
function fmtDateHu(key){
  const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return key || '';
  return m[1] + '. ' + MONTHS_HU_SHORT[+m[2] - 1] + ' ' + (+m[3]) + '.';
}
function reducedMotion(){
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e){ return false; }
}

/* ---------- 1) következő mérkőzés / esemény sáv (a lap legtetején, teljes szélesség) ---------- */
function stripCandidates(){
  const out = [];
  /* kiírt mérkőzések (elsőbbség: szezon menetrendje) */
  season().schedule.forEach(function(m){
    const k = dateKey(m.date);
    if (!k) return;
    const time = (m.time && /^\d{1,2}:\d{2}$/.test(m.time)) ? m.time + ':00' : '00:00:00';
    const t = new Date(k + 'T' + time).getTime();
    if (isNaN(t)) return;
    out.push({
      at: t, kind: 'match', chip: 'Mérkőzés',
      title: (m.team1 && m.team2) ? m.team1 + ' vs ' + m.team2 : (m.stage || 'Mérkőzés'),
      when: fmtDateHu(k) + (m.time ? ' · ' + m.time : ''),
      meta: [m.stage, m.location || '304-es terem'].filter(Boolean).join(' · '),
      href: '#merkozesek', cta: 'Részletek'
    });
  });
  /* kulcsfontosságú dátumok (nevezés, selejtező, döntő) */
  Object.keys(KEY_DATES).forEach(function(k){
    const t = new Date(k + 'T00:00:00').getTime();
    if (isNaN(t)) return;
    const kd = KEY_DATES[k] || {};
    const chip = kd.type === 'deadline' ? 'Határidő' : (kd.type === 'final' ? 'Döntő' : 'Mérkőzés');
    out.push({
      at: t, kind: 'key', chip: chip, title: kd.title || 'Esemény',
      when: fmtDateHu(k),
      meta: kd.desc ? String(kd.desc).split('.')[0] : '',
      href: kd.type === 'deadline' ? '#jelentkezes' : '#merkozesek', cta: 'Részletek'
    });
  });
  /* tanévi események (első/utolsó tanítási nap, szünetek) */
  const sy = SCHOOL_YEARS[state.season];
  if (sy){
    if (sy.first) out.push({ at: new Date(sy.first + 'T00:00:00').getTime(), kind: 'school', chip: 'Tanév',
      title: 'Első tanítási nap', when: fmtDateHu(sy.first), meta: 'tanévkezdés', href: '#naptar', cta: 'Naptár' });
    if (sy.last) out.push({ at: new Date(sy.last + 'T00:00:00').getTime(), kind: 'school', chip: 'Tanév',
      title: 'Utolsó tanítási nap', when: fmtDateHu(sy.last), meta: 'tanévzárás', href: '#naptar', cta: 'Naptár' });
    (sy.breaks || []).forEach(function(b){
      if (!b.from) return;
      out.push({
        at: new Date(b.from + 'T00:00:00').getTime(), kind: 'school', chip: 'Szünet', title: b.name,
        when: (b.to && b.to !== b.from) ? fmtDateHu(b.from) + ' – ' + fmtDateHu(b.to) : fmtDateHu(b.from),
        meta: 'iskolai szünet', href: '#naptar', cta: 'Naptár'
      });
    });
  }
  return out.filter(c => !isNaN(c.at)).sort((a, b) => a.at - b.at);
}

/* ---------- fejléc-magasságok szinkronja (sáv + menü-sor → CSS változók) ---------- */
function syncChromeHeights(){
  const root = document.documentElement;
  const strip = document.querySelector('.match-strip');
  const navBox = document.querySelector('.site-header .container');
  /* pontos (tört) magasság: így a sáv pontosan a saját magasságával csúszik ki —
     kerekítés esetén vagy szubpixel sáv maradna, vagy a menüsor csúszna feljebb */
  root.style.setProperty('--strip-h', (strip ? strip.getBoundingClientRect().height.toFixed(2) : 0) + 'px');
  root.style.setProperty('--nav-h', (navBox ? Math.round(navBox.getBoundingClientRect().height) : 73) + 'px');
}
function watchChromeHeights(){
  syncChromeHeights();
  /* A sáv magassága szélesség- és betűtípus-függő. A ResizeObserver beágyazott/
     átméretezett nézetben nem mindig jelez, ezért explicit is szinkronizálunk —
     különben a fejléc a régi --strip-h értékkel csúszik fel, a menüsor levágódik. */
  window.addEventListener('resize', syncChromeHeights);
  window.addEventListener('orientationchange', syncChromeHeights);
  window.addEventListener('load', syncChromeHeights);
  /* A betöltés pillanatában a betűtípus/tördelés még nem végleges, így a mérés
     elavult sávmagasságot hagyhat (a fejléc rossz értékkel csúszna fel).
     Ezért rövid késleltetéssel is újramérünk — nem várunk eseményre. */
  [0, 120, 400, 1200].forEach(function (ms) {
    window.setTimeout(syncChromeHeights, ms);
  });
  if (document.fonts && document.fonts.ready){
    document.fonts.ready.then(function(){ syncChromeHeights(); }).catch(function(){});
  }
  try {
    const ro = new ResizeObserver(function(){ syncChromeHeights(); });
    const strip = document.querySelector('.match-strip');
    const navBox = document.querySelector('.site-header .container');
    if (strip) ro.observe(strip);
    if (navBox) ro.observe(navBox);
  } catch (e){}
}

function renderMatchStrip(){
  const strip = document.querySelector('.match-strip');
  if (!strip) return;
  const list = stripCandidates();
  const now = Date.now();
  const ranks = ['match', 'key', 'school'];   /* mérkőzés a legfontosabb */
  const byKind = arr => ranks.map(k => arr.filter(c => c.kind === k));

  let item = null, past = false;
  /* jövőbeli események: a legkorábbi, legmagasabb prioritású */
  byKind(list.filter(c => c.at > now)).some(sub => { if (sub.length){ item = sub[0]; return true; } return false; });
  if (!item){                                 /* nincs jövőbeli → a szezon záró eseménye */
    const done = byKind(list.filter(c => c.at <= now));
    for (const sub of done){ if (sub.length){ item = sub[sub.length - 1]; past = true; break; } }
  }

  const chip = $('#msChip'), cta = $('#msCta');
  if (!item){ /* nincs kiírt esemény */
    const live = state.season === '2026/27';
    if (chip){ chip.textContent = live ? 'Nincs kiírt esemény' : 'Szezon lezárult'; chip.className = 'ms-chip is-none'; }
    setText('msDate', '');
    setText('msTitle', live
      ? 'A 2026/27-es menetrend előkészítés alatt — a nevezések lezárása után áll össze'
      : 'A 2025/26-os szezon eredményei a Mérkőzések és a Tabella oldalon nézhetők meg');
    setText('msMeta', live ? 'Nevezés nyitva' : 'Archív nézet');
    if (cta){ cta.setAttribute('href', live ? '#jelentkezes' : '#tabella'); cta.innerHTML = (live ? 'Jelentkezés' : 'Tabella') + ' <i>→</i>'; }
    return;
  }
  if (chip){
    chip.textContent = past ? 'Lezárult' : item.chip;
    chip.className = 'ms-chip ' + (past ? 'is-past' : (item.kind === 'school' ? 'is-soft' : 'is-live'));
  }
  setText('msDate', item.when || '');
  setText('msTitle', item.title || '');
  setText('msMeta', item.meta || '');
  if (cta){
    cta.setAttribute('href', item.href || '#');
    cta.innerHTML = esc(item.cta || 'Részletek') + ' <i>→</i>';
  }
}

/* ---------- 2) hír-karusszel — hero-stílusú, fotó-helyettesítő gradiens- hátterek ---------- */
const NH_BG = [
  'radial-gradient(1100px 640px at 12% 18%,rgba(79,124,255,.62),transparent 62%),radial-gradient(900px 620px at 88% 78%,rgba(34,211,238,.42),transparent 60%),linear-gradient(140deg,#0d1734 0%,#05070f 72%)',
  'radial-gradient(1000px 620px at 82% 22%,rgba(139,92,246,.55),transparent 60%),radial-gradient(860px 560px at 12% 82%,rgba(79,124,255,.45),transparent 62%),linear-gradient(150deg,#131033 0%,#05070f 74%)',
  'radial-gradient(1000px 600px at 20% 80%,rgba(34,211,238,.4),transparent 60%),radial-gradient(940px 640px at 85% 15%,rgba(255,183,3,.3),transparent 58%),linear-gradient(145deg,#0a1a2c 0%,#05070f 72%)',
  'radial-gradient(1050px 620px at 78% 78%,rgba(255,93,115,.34),transparent 60%),radial-gradient(900px 600px at 15% 20%,rgba(139,92,246,.45),transparent 62%),linear-gradient(140deg,#1a0f22 0%,#05070f 74%)',
  'radial-gradient(1000px 600px at 50% 0%,rgba(79,124,255,.5),transparent 64%),radial-gradient(820px 560px at 90% 90%,rgba(34,211,238,.34),transparent 60%),linear-gradient(145deg,#081226 0%,#05070f 72%)'
];

/* háttér: saját kép, ha van — sötét fátyollal, hogy a szöveg olvasható maradjon */
function newsBackdrop(item, i){
  const grad = NH_BG[i % NH_BG.length];
  const img = item && item.image ? String(item.image).replace(/[^A-Za-z0-9_\-./]/g, '') : '';
  if (!img) return grad;
  return 'linear-gradient(100deg,rgba(5,7,15,.92) 0%,rgba(5,7,15,.58) 52%,rgba(5,7,15,.82) 100%),' +
    'url(\'' + img + '\') center/cover no-repeat';
}

const newsUI = { items: [], idx: 0, timer: null, paused: false };

function showNews(i){
  const n = newsUI.items.length;
  if (!n) return;
  newsUI.idx = ((i % n) + n) % n;
  const it = newsUI.items[newsUI.idx];
  const link = (it && it.link) || '#';
  $$('#newsBgs .nh-bg').forEach((el, k) => el.classList.toggle('active', k === newsUI.idx));
  $$('#newsDots .news-dot').forEach((el, k) => el.classList.toggle('active', k === newsUI.idx));
  const t = $('#newsTitle');
  if (t){ t.textContent = (it && it.title) || ''; t.setAttribute('href', link); }
  setText('newsTag', (it && it.tag) || 'Hír');
  setText('newsDate', it ? fmtDateHu(it.date) : '');
  const card = $('#newsCard');
  if (card) card.setAttribute('href', link);
  setText('newsCardTitle', (it && it.title) || '');
  setText('newsCardMeta', ((it && it.tag) || 'Hír') + (it ? ' · ' + fmtDateHu(it.date) : ''));
  const thumb = $('#newsThumb');
  if (thumb) thumb.style.background = newsBackdrop(it, newsUI.idx);
  const head = $('.nh-head');
  if (head && !reducedMotion()){
    head.classList.remove('anim');
    void head.offsetWidth;          /* reflow — az animáció újraindítása */
    head.classList.add('anim');
  }
}
function stopNewsTimer(){
  if (newsUI.timer){ window.clearInterval(newsUI.timer); newsUI.timer = null; }
}
function startNewsTimer(){
  stopNewsTimer();
  if (reducedMotion() || newsUI.items.length < 2) return; /* csökkentett mozgás: nincs automatikus váltás */
  newsUI.timer = window.setInterval(function(){
    if (newsUI.paused || document.hidden) return;
    showNews(newsUI.idx + 1);
  }, 5000);
}

function renderNews(){
  const hero = $('#newsHero');
  if (!hero) return;
  stopNewsTimer();
  const items = (typeof NEWS !== 'undefined' ? NEWS : [])
    .filter(n => n && n.season === state.season)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  newsUI.items = items;
  newsUI.idx = 0;
  const bgs = $('#newsBgs'), dots = $('#newsDots');
  if (!bgs || !dots) return;
  if (!items.length){                       /* üres szezon: a blokk elbújik */
    hero.style.display = 'none';
    bgs.innerHTML = '';
    dots.innerHTML = '';
    return;
  }
  hero.style.display = '';
  bgs.innerHTML = items.map((n, i) =>
    '<span class="nh-bg' + (i === 0 ? ' active' : '') + '" style="background:' +
    newsBackdrop(n, i) + '"></span>').join('');
  dots.innerHTML = items.map((n, i) =>
    '<button type="button" class="news-dot' + (i === 0 ? ' active' : '') + '" data-i="' + i + '" aria-label="' +
    (i + 1) + '. hír megjelenítése"></button>').join('');
  showNews(0);            /* aktív háttér + cím + kártya szinkronba hozása */
  startNewsTimer();
}

function initNews(){
  const hero = $('#newsHero');
  if (!hero) return;
  const prev = $('#newsPrev'), next = $('#newsNext');
  if (prev) prev.addEventListener('click', function(){ showNews(newsUI.idx - 1); });
  if (next) next.addEventListener('click', function(){ showNews(newsUI.idx + 1); });
  hero.addEventListener('click', function(e){
    const dot = e.target.closest ? e.target.closest('.news-dot') : null;
    if (dot) showNews(+dot.getAttribute('data-i'));
  });
  /* hover/focus alatt megáll */
  hero.addEventListener('mouseenter', function(){ newsUI.paused = true; });
  hero.addEventListener('mouseleave', function(){ newsUI.paused = false; });
  hero.addEventListener('focusin', function(){ newsUI.paused = true; });
  hero.addEventListener('focusout', function(){ newsUI.paused = false; });
}

/* ---------- visszaszámláló a következő eseményig ---------- */
let cdTarget = null;

function nextEventInfo(){
  const now = Date.now();
  const cands = [];
  Object.keys(KEY_DATES).forEach(function(k){
    const t = new Date(k + 'T00:00:00').getTime();
    if (!isNaN(t)) cands.push({ at: t, label: KEY_DATES[k].title });
  });
  season().schedule.forEach(function(m){
    const k = dateKey(m.date);
    if (!k) return;
    const time = (m.time && /^\d{1,2}:\d{2}$/.test(m.time)) ? m.time + ':00' : '00:00:00';
    const t = new Date(k + 'T' + time).getTime();
    if (isNaN(t)) return;
    cands.push({ at: t, label: (m.team1 && m.team2) ? m.team1 + ' vs ' + m.team2 : (m.stage || 'Mérkőzés') });
  });
  const sy = SCHOOL_YEARS[state.season];
  if (sy){
    if (sy.first) cands.push({ at: new Date(sy.first + 'T00:00:00').getTime(), label: 'Első tanítási nap' });
    if (sy.last) cands.push({ at: new Date(sy.last + 'T00:00:00').getTime(), label: 'Utolsó tanítási nap' });
    (sy.breaks || []).forEach(function(b){
      if (b.from) cands.push({ at: new Date(b.from + 'T00:00:00').getTime(), label: b.name + ' kezdete' });
    });
  }
  const future = cands.filter(c => c.at > now).sort((a, b) => a.at - b.at);
  return future[0] || null;
}

function localDateKey(ts){
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function setCountdownTarget(){
  cdTarget = nextEventInfo();
  const box = $('#heroCountdown');
  if (!box) return;
  if (!cdTarget){ box.hidden = true; return; }
  setText('hcEvent', cdTarget.label + ' · ' + fmtDateHu(localDateKey(cdTarget.at)));
}
function tickCountdown(){
  const box = $('#heroCountdown');
  if (!box) return;
  if (!cdTarget || cdTarget.at <= Date.now()) setCountdownTarget();   /* lejárt → a következőre lép */
  if (!cdTarget){ box.hidden = true; return; }
  box.hidden = false;
  const diff = Math.max(0, cdTarget.at - Date.now());
  const s = Math.floor(diff / 1000);
  setText('hcD', pad(Math.floor(s / 86400)));
  setText('hcH', pad(Math.floor(s / 3600) % 24));
  setText('hcM', pad(Math.floor(s / 60) % 60));
  setText('hcS', pad(s % 60));
}
function renderCountdown(){
  setCountdownTarget();
  if (cdTarget) tickCountdown();
}

/* ---------- registration (helyi, localStorage) ---------- */
function validateTeamName(name){
  if (!name || name.length < 3) return 'A csapatnév túl rövid (minimum 3 karakter)';
  if (name.length > 50) return 'A csapatnév túl hosszú (maximum 50 karakter)';
  if (containsBadWords(name)) return 'A csapatnév nem tartalmazhat sértő szavakat';
  return null;
}
function validateEmail(email){
  if (!email) return 'Email cím megadása kötelező';
  if (!email.includes('@') || !email.includes('.')) return 'Érvénytelen email cím';
  if (containsBadWords(email)) return 'Az email cím nem tartalmazhat sértő szavakat';
  return null;
}
function validatePlayers(players){
  const list = parsePlayers(players);
  if (list.length !== 5) return 'Pontosan 5 játékost kell megadnod';
  for (const p of list){
    if (p.length < 2) return 'A játékos név "' + p + '" túl rövid';
    if (containsBadWords(p)) return 'A játékos név "' + p + '" sértő szavakat tartalmaz';
  }
  return null;
}

function updateUserPanel(){
  const panel = $('#user-status-panel');
  if (!panel) return;
  if (state.userTeam && state.season === '2026/27'){
    panel.innerHTML =
      '<div class="user-status-panel">' +
        '<p>🎮 A TE CSAPATOD: <strong>' + esc(state.userTeam.name) + '</strong></p>' +
        (state.userTeam.status === 'pending'
          ? '<p style="margin:8px 0 0;font-size:.82rem;color:#ffd78a">⏳ A tanár jóváhagyására vár</p>'
          : state.userTeam.status === 'approved'
            ? '<p style="margin:8px 0 0;font-size:.82rem;color:#7ef2c4">✓ Jóváhagyva — a csapatod a listán van</p>'
            : state.userTeam.status === 'rejected'
              ? '<p style="margin:8px 0 0;font-size:.82rem;color:#ffb3bf">✕ Elutasítva — írj a szervezőknek</p>'
              : '') +
        '<button type="button" class="edit-btn" id="editReg">Módosítás</button>' +
        '<button type="button" class="delete-btn" id="delReg">Törlés</button>' +
        '<p style="font-size:.8rem;color:var(--ink-3);margin-top:10px">📧 ' + esc(state.userTeam.captainEmail) + '</p>' +
      '</div>';
    $('#editReg').addEventListener('click', editRegistration);
    $('#delReg').addEventListener('click', deleteRegistration);
  } else {
    panel.innerHTML = '';
  }
}

function loadLocalTeam(){
  try {
    const raw = localStorage.getItem('keri_myTeam');
    if (raw) state.userTeam = JSON.parse(raw);
  } catch (e) { state.userTeam = null; }
}
function saveLocalTeam(){
  try {
    if (state.userTeam) localStorage.setItem('keri_myTeam', JSON.stringify(state.userTeam));
    else localStorage.removeItem('keri_myTeam');
  } catch (e) {}
}

function editRegistration(){
  if (!state.userTeam) return;
  $('#teamName').value = state.userTeam.name;
  $('#captainEmail').value = state.userTeam.captainEmail;
  $('#players').value = state.userTeam.players;
  $('#teacher').value = state.userTeam.teacher || '';
  state.isEditMode = true;
  const btn = $('#submitBtn');
  btn.textContent = 'Módosítások mentése';
  btn.disabled = false;
  $('#apply').scrollIntoView({ behavior: 'smooth' });
  toast('✏️ Szerkesztési mód — módosítsd és mentsd el');
}

function deleteRegistration(){
  if (!state.userTeam) return;
  if (!confirm('Biztosan törölni szeretnéd a "' + state.userTeam.name + '" csapat jelentkezését?')) return;
  state.userTeam = null;
  state.isEditMode = false;
  saveLocalTeam();
  const btn = $('#submitBtn');
  btn.textContent = 'Jelentkezés beküldése →';
  btn.disabled = false;
  $('#application-form').reset();
  renderAll();
  toast('🗑️ Jelentkezésed törölve! Újra jelentkezhetsz.');
}

function initForm(){
  const form = $('#application-form');
  if (!form) return;
  form.addEventListener('submit', function(e){
    e.preventDefault();
    if (state.season !== '2026/27'){ toast('Az archív nézetben a nevezés zárt.', true); return; }

    const teamName = $('#teamName').value.trim();
    const captainEmail = $('#captainEmail').value.trim();
    const players = $('#players').value.trim();
    const teacher = $('#teacher').value.trim();

    const errs = [validateTeamName(teamName), validateEmail(captainEmail), validatePlayers(players)].filter(Boolean);
    if (errs.length){ toast(errs[0], true); return; }

    const btn = $('#submitBtn');
    btn.disabled = true;
    btn.textContent = 'Küldés...';

    sendRegistration({
      comp: SERVER.competition,
      name: teamName,
      captain: captainEmail,
      players: parsePlayers(players),
      teacher: teacher
    }).then(function (team) {
      state.userTeam = {
        id: team.id,
        name: team.name,
        captainEmail: team.captain,
        players: team.players,
        teacher: team.teacher,
        status: team.status,
        registeredAt: team.createdAt
      };
      state.isEditMode = false;
      saveLocalTeam();
      btn.textContent = 'Már regisztráltál!';
      renderAll();
      loadServerView();
      toast('✅ ' + team.name + ' nevezése elküldve — a tanár jóváhagyására vár.');
    }).catch(function (err) {
      const offline = /fetch|network|load failed/i.test(String(err && err.message));
      if (!offline){
        btn.disabled = false;
        btn.textContent = 'Jelentkezés beküldése →';
        toast(err.message, true);
        return;
      }
      /* nincs adatkiszolgáló: mentés ezen az eszközön (a régi viselkedés) */
      state.userTeam = {
        name: teamName,
        captainEmail: captainEmail,
        players: players,
        teacher: teacher,
        status: 'pending',
        registeredAt: new Date().toISOString()
      };
      state.isEditMode = false;
      saveLocalTeam();
      btn.textContent = 'Már regisztráltál!';
      renderAll();
      toast('Nevezés helyben mentve — az adatkiszolgáló nem érhető el.', true);
    });
  });
}

/* ---------- pill glow pozicionálás ---------- */
function placePillGlow(){
  const pill = $('#navPill');
  if (!pill) return;
  const glow = pill.querySelector('.pill-glow');
  const item = pill.querySelector('.pill-item.active');
  if (!glow) return;
  if (!item || pill.offsetParent === null){ glow.classList.remove('on'); return; }
  const pr = pill.getBoundingClientRect();
  const ir = item.getBoundingClientRect();
  const originX = pr.left + (parseFloat(getComputedStyle(pill).borderLeftWidth) || 0);
  glow.style.width = ir.width + 'px';
  glow.style.transform = 'translateX(' + (ir.left - originX) + 'px)';
  glow.classList.add('on');
}

/* ---------- SPA nézetkezelés (egyfájlos — folytonos menü-animáció) ---------- */
const VIEWS = {
  kezdolap:    'KERIGAMES — Kezdőlap',
  szabalyok:   'KERIGAMES — Szabályok',
  naptar:      'KERIGAMES — Versenynaptár',
  merkozesek:  'KERIGAMES — Mérkőzések',
  tabella:     'KERIGAMES — Tabella',
  dijazas:     'KERIGAMES — Díjazás',
  csapatok:    'KERIGAMES — Csapatok',
  gyik:        'KERIGAMES — GYIK',
  jelentkezes: 'KERIGAMES — Jelentkezés'
};
let currentView = null;
let revealIO = null;

const REVEAL_SEL = '.match-strip, .news-hero, .hero-left > *, .stats-strip .stat, .rule-card, .cal-card, .tl-item, .match-card, ' +
  '.prize-card, .roster-card, .faq-item, .apply-modern, .scoreboard-wrap, .schedule-header, .roster-header, ' +
  '.empty-state, .page-hero-in > *, .nav-card, .cta-band';

function scrollToTopNow(){
  const h = document.documentElement;
  const prev = h.style.scrollBehavior;
  h.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  h.style.scrollBehavior = prev;
}

function hashView(){
  const h = (location.hash || '').replace(/^#/, '').toLowerCase();
  return VIEWS[h] ? h : null;
}

function setActiveNav(name){
  const href = '#' + name;
  $$('.pill-item').forEach(a => a.classList.toggle('active', a.getAttribute('href') === href));
  $$('.lm-links a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === href));
  $$('.dock-item[href]').forEach(a => {
    const on = a.getAttribute('href') === href;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const apply = $('.nav-apply');
  if (apply) apply.classList.toggle('active', name === 'jelentkezes');
}

function armReveal(root){
  if (!revealIO || !root) return;
  Array.prototype.slice.call(root.querySelectorAll(REVEAL_SEL)).forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    if (rect.top > window.innerHeight - 60){
      el.classList.remove('in');
      el.classList.add('reveal');
      el.style.transitionDelay = Math.min(i % 6, 5) * 60 + 'ms';
      revealIO.observe(el);
    } else {
      el.classList.remove('reveal');
      el.classList.add('in');
      revealIO.unobserve(el);
    }
  });
}

/* mozgó kiemelő-billentyű a dockon (a referencia animációjával) */
function placeDockPill(focusEl){
  const dock = $('#dock');
  if (!dock) return;
  const item = focusEl || dock.querySelector('.dock-item.active');
  if (!item || !dock.getClientRects().length){
    dock.style.setProperty('--pill-w', '0px');
    return;
  }
  const dr = dock.getBoundingClientRect();
  const ir = item.getBoundingClientRect();
  const bw = parseFloat(getComputedStyle(dock).borderLeftWidth) || 0;
  dock.style.setProperty('--pill-w', ir.width + 'px');
  dock.style.setProperty('--pill-x', (ir.left - dr.left - bw) + 'px');
}

function showView(name, opts){
  opts = opts || {};
  if (!VIEWS[name]) name = 'kezdolap';
  const next = document.querySelector('.view[data-view="' + name + '"]');
  if (!next) return;

  /* esetleges korábbi kifutó nézet azonnal lezárása (gyors kattintások) */
  $$('.view.leaving').forEach(v => {
    if (v !== next) v.classList.remove('leaving', 'active');
  });

  const cur = document.querySelector('.view.active');
  const changed = !!cur && cur !== next;

  if (changed && !opts.silent){
    const old = cur;
    old.classList.add('leaving');
    setTimeout(() => {
      if (old.classList.contains('leaving')) old.classList.remove('leaving', 'active');
    }, 340);
  } else if (changed){
    cur.classList.remove('active');
  }

  if (!next.classList.contains('active')) next.classList.add('active');
  if (opts.silent){
    /* mélyhivatkozás betöltésekor ne induljon animáció */
    next.getBoundingClientRect();
    if (next.getAnimations) next.getAnimations().forEach(a => { try { a.finish(); } catch (err) {} });
  }

  currentView = name;
  document.title = VIEWS[name];
  setActiveNav(name);
  placePillGlow();
  placeDockPill();

  if (changed && !opts.silent){
    scrollToTopNow();
    armReveal(next);
  }
}

function handleHash(){
  const raw = (location.hash || '').replace(/^#/, '');
  const name = raw.toLowerCase();
  if (VIEWS[name]){
    if (name !== currentView) showView(name);
    return;
  }
  if (!raw){ showView('kezdolap'); return; }
  /* ismeretlen horgony (#top, #oldalak…): görgetés, ha látható, egyébként a lap teteje */
  const el = document.getElementById(raw);
  if (el && el.getClientRects().length) el.scrollIntoView({ behavior: 'smooth' });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- header, dock, menü, átmenetek ---------- */
function initChrome(){
  const header = $('#siteHeader');
  if (header){
    const onScroll = () => {
      const scrolled = window.scrollY > 20;
      /* a sáv felcsúszása a mért magasságon múlik — állapotváltásnál frissítjük */
      if (scrolled !== header.classList.contains('scrolled')) syncChromeHeights();
      header.classList.toggle('scrolled', scrolled);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* pill glow + dock pill */
  placePillGlow();
  placeDockPill();
  window.addEventListener('resize', () => { placePillGlow(); placeDockPill(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { placePillGlow(); placeDockPill(); }).catch(() => {});
  window.addEventListener('load', () => { placePillGlow(); placeDockPill(); });

  /* liquid menu (dock "Több") */
  const menu = $('#liquidMenu');
  const moreBtn = $('#dockMore');
  const closeBtn = $('#lmClose');
  function setMenu(open){
    if (!menu) return;
    menu.classList.toggle('open', open);
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('menu-open', open);
    if (moreBtn) moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    /* a dock kiemelő-billentyűje átcsúszik a "Több" gombra / vissza */
    placeDockPill(open && moreBtn ? moreBtn : null);
  }
  if (moreBtn) moreBtn.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
  if (closeBtn) closeBtn.addEventListener('click', () => setMenu(false));
  if (menu){
    const backdrop = menu.querySelector('.lm-backdrop');
    if (backdrop) backdrop.addEventListener('click', () => setMenu(false));
    menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1240) setMenu(false);
  });

  /* hash-alapú SPA navigáció: nincs oldalbetöltés, a menü folyamatosan animálódik */
  window.addEventListener('hashchange', handleHash);

  /* data-go gombok (üres állapotok) */
  document.addEventListener('click', e => {
    const go = e.target.closest && e.target.closest('[data-go]');
    if (!go) return;
    const name = (go.getAttribute('data-go') || '').replace(/\.html$/i, '').toLowerCase();
    if (!VIEWS[name]) return;
    if (name === currentView) window.scrollTo({ top: 0, behavior: 'smooth' });
    else location.hash = '#' + name;
  });

  /* belső linkek → nézetváltás (hash), ismeretlen horgonyok → görgetés */
  document.addEventListener('click', function(e){
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a');
    if (!a) return;
    const raw = a.getAttribute('href') || '';
    if (!raw || raw.charAt(0) !== '#') return;
    const name = raw.slice(1).toLowerCase();
    if (!VIEWS[name]) return;
    e.preventDefault();
    if (name === currentView){
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (location.hash === raw){
      showView(name);
    } else {
      location.hash = raw;
    }
  });

  /* reveal (átúszó nézetekhez újra-„fegyelmezve”) */
  if ('IntersectionObserver' in window){
    revealIO = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting){ en.target.classList.add('in'); revealIO.unobserve(en.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  }
  armReveal(document);

  /* specular highlight */
  document.addEventListener('pointermove', function(e){
    const el = e.target && e.target.closest ? e.target.closest('.shine') : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(2) + '%');
    el.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(2) + '%');
  }, { passive: true });

  /* statisztika-számok felívelése, amikor a sáv először látható */
  const statsStrip = $('.stats-strip');
  if (statsStrip && 'IntersectionObserver' in window){
    const cio = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        cio.unobserve(en.target);
        en.target.dataset.counted = '1';
        STAT_IDS.forEach(id => {
          const el = document.getElementById(id);
          if (!el || el.dataset.to == null) return;
          el.textContent = '0';
          countUp(el, el.dataset.to, 1100);
        });
      });
    }, { threshold: 0.35 });
    cio.observe(statsStrip);
  }

  /* kattintás-ripple a gombokon */
  document.addEventListener('pointerdown', function(e){
    const btn = e.target && e.target.closest
      ? e.target.closest('.btn-primary,.btn-submit,.btn-outline,.lm-cta,.nav-apply') : null;
    if (!btn || btn.disabled) return;
    const r = btn.getBoundingClientRect();
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.setProperty('--rs', (Math.max(r.width, r.height) * 2.2) + 'px');
    s.style.setProperty('--rx', (e.clientX - r.left) + 'px');
    s.style.setProperty('--ry', (e.clientY - r.top) + 'px');
    btn.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  }, { passive: true });

  /* aurora háttér finom parallax-ja (görgetés + egér), motion-csökkentésnél kikapcsolva */
  (function(){
    const aur = $('.aurora');
    if (!aur || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let mx = 0, my = 0, sy = 0, raf = 0;
    function apply(){
      raf = 0;
      aur.style.transform = 'translate3d(' + mx.toFixed(1) + 'px,' + (my + sy).toFixed(1) + 'px,0)';
    }
    function schedule(){ if (!raf) raf = requestAnimationFrame(apply); }
    window.addEventListener('scroll', function(){
      const y = window.scrollY || 0;
      sy = Math.max(-26, Math.min(26, -y * 0.05));
      schedule();
    }, { passive: true });
    window.addEventListener('pointermove', function(e){
      mx = ((e.clientX / window.innerWidth) - 0.5) * 16;
      my = ((e.clientY / window.innerHeight) - 0.5) * 10;
      schedule();
    }, { passive: true });
  })();

  /* season switch — iOS üveg-váltó + Focus-szerű kibontás (videó) */
  const sw = $('#seasonSwitch');
  const swWrap = $('#seasonWrap');
  const swScrim = $('#swScrim');
  function closePop(){
    if (!swWrap) return;
    syncSeasonOpts(true);
    swWrap.classList.remove('open');
    if (sw) sw.setAttribute('aria-expanded', 'false');
    if (swScrim){
      swScrim.classList.remove('on');
      window.setTimeout(function(){
        if (!swWrap.classList.contains('open')) swScrim.hidden = true;
      }, 460);
    }
  }
  function openPop(){
    if (!swWrap) return;
    swWrap.classList.add('open');
    if (sw) sw.setAttribute('aria-expanded', 'true');
    if (swScrim){
      swScrim.hidden = false;
      requestAnimationFrame(function(){ swScrim.classList.add('on'); placeSeasonHl(); });
    } else placeSeasonHl();
    window.setTimeout(placeSeasonHl, 80);
  }
  let selTimer = null;
  function cancelSel(){ if (selTimer){ clearTimeout(selTimer); selTimer = null; } }
  if (sw) sw.addEventListener('click', () => {
    if (swWrap.classList.contains('open')) closePop(); else openPop();
  });
  $$('.sw-opt').forEach(o => o.addEventListener('click', () => {
    const next = o.dataset.season;
    cancelSel();
    if (next === state.season){ closePop(); return; }
    $$('.sw-opt').forEach(x => {
      const on = x === o;
      x.classList.toggle('active', on);
      x.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    placeSeasonHl();
    selTimer = window.setTimeout(function(){ selTimer = null; closePop(); setSeason(next); }, 480);
  }));
  if (swScrim) swScrim.addEventListener('click', () => { cancelSel(); closePop(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape'){ cancelSel(); closePop(); } });
  document.addEventListener('click', e => {
    if (swWrap && swWrap.classList.contains('open') && !swWrap.contains(e.target)){ cancelSel(); closePop(); }
  });
  const back = $('#backToLive');
  if (back) back.addEventListener('click', () => setSeason('2026/27'));
}

/* ---------- init ---------- */
(function init(){
  try {
    const saved = localStorage.getItem('keri_season');
    if (saved && SEASONS[saved]) state.season = saved;
  } catch (e) {}
  loadLocalTeam();
  showView(hashView() || 'kezdolap', { silent: true });
  initChrome();
  initForm();
  initNews();
  renderAll();
  loadServerView();
  watchChromeHeights();
  armReveal(document);
  window.setInterval(tickCountdown, 1000);   /* visszaszámláló 1 mp-es frissítéssel */
  if (state.userTeam){
    const btn = $('#submitBtn');
    if (btn && state.season === '2026/27') btn.textContent = 'Már regisztráltál!';
  }
})();
