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
  return [Object.assign({ local: true }, state.userTeam)];
}
function allTeams(){ return localTeams().concat(season().teams); }

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

/* ---------- calendar ---------- */
let daysByDate = {};
let selectedKey = null;

function dayInfo(key){
  const matches = daysByDate[key] || [];
  const info = KEY_DATES[key] || null;
  let type = info ? info.type : null;
  if (matches.length){
    type = matches.some(x => /döntő/i.test(x.stage || '')) ? 'final' : 'match';
  }
  return { info, matches, type };
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
    if (info.type){
      cell.classList.add('has');
      if (info.type === 'deadline') cell.classList.add('deadline');
      if (info.type === 'final') cell.classList.add('final');
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('data-date', key);
      cell.setAttribute('title', info.info ? info.info.title : DAY_LABEL[info.type]);
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
  const sub = (+parts[0]) + '. ' + MONTHS_HU[+parts[1] - 1] + ' ' + (+parts[2]) + '. · ' +
    (info.type ? DAY_LABEL[info.type] : 'Fontos dátum');
  let html = '<div class="cd-sub">' + esc(sub) + '</div>';
  if (info.info){
    html += '<h4>' + esc(info.info.title) + '</h4><p style="color:var(--ink-2);margin:0">' + esc(info.info.desc) + '</p>';
  } else {
    html += '<h4>' + (info.matches.length ? 'Mérkőzések' : 'Nincs program') + '</h4>';
  }
  if (info.matches.length){
    html += '<div style="margin-top:16px">' + info.matches.map(m =>
      '<div class="cd-match"><span><b>' + esc(m.team1) + '</b> <span style="color:var(--ink-3)">vs</span> <b>' + esc(m.team2) + '</b></span>' +
      '<span class="cd-time">' + esc(m.time || 'TBA') + '</span></div>'
    ).join('') + '</div>';
    html += '<a href="#merkozesek" class="cd-jump">Ugrás a mérkőzésekhez →</a>';
  } else if (!info.info){
    html += '<p class="cd-empty">Ezen a napon nincs kiírt mérkőzés.</p>';
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

  const keys = Object.keys(daysByDate).sort();
  const hasData = keys.length > 0;

  if (!hasData){
    host.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">📅</div>' +
        '<h3>A ' + esc(state.season) + '-es versenynaptár hamarosan</h3>' +
        '<p>A fordulók időpontjait a nevezések lezárása után töltjük fel. A 2025/26-os archív naptár a fejléc lévő kapcsolóval érhető el.</p>' +
        '<button class="btn-outline" id="calBack">Megnézem a tavalyi naptárat</button>' +
      '</div>';
    const back = $('#calBack');
    if (back) back.addEventListener('click', () => setSeason('2025/26'));
    if (timeline) timeline.style.display = 'none';
    return;
  }

  if (timeline) timeline.style.display = '';

  const months = [];
  keys.forEach(k => {
    const ym = k.slice(0, 7);
    if (!months.some(m => m.ym === ym)) months.push({ ym, y: +k.slice(0, 4), m: +k.slice(5, 7) });
  });

  host.innerHTML = '<div class="calendar-wrap">' + months.map((mo, i) =>
    '<div class="cal-card shine">' +
      '<div class="cal-head"><h3>' + mo.y + '. ' + MONTHS_HU[mo.m - 1].charAt(0).toUpperCase() + MONTHS_HU[mo.m - 1].slice(1) + '</h3>' +
      '<span>' + (i === 0 ? 'Fordulók' : 'Folytatás') + '</span></div>' +
      '<div class="cal-grid" id="calM' + i + '"></div>' +
    '</div>'
  ).join('') + '</div>' +
  '<div class="cal-legend">' +
    '<span><i style="background:linear-gradient(135deg,#ffb703,#fb8500)"></i> Nevezési határidő</span>' +
    '<span><i style="background:linear-gradient(135deg,#4f7cff,#8b5cf6)"></i> Mérkőzésnap</span>' +
    '<span><i style="background:linear-gradient(135deg,#22d3ee,#8b5cf6)"></i> Döntő</span>' +
    '<span><i style="background:rgba(109,127,157,.5)"></i> Nincs program</span>' +
  '</div>' +
  '<div class="cal-detail" id="calDetail"><div class="cd-sub">Nap részletei</div>' +
  '<p class="cd-empty">Válassz egy kiemelt napot a naptárban — itt megjelenik az adott nap mérkőzése és a fontos infók.</p></div>';

  months.forEach((mo, i) => buildMonth('calM' + i, mo.y, mo.m));

  const cell = (selectedKey && document.querySelector('.cal-day[data-date="' + selectedKey + '"]')) ||
               document.querySelector('.cal-day.has');
  if (cell) selectDay(cell.getAttribute('data-date'), cell);
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
  setText('panelStatus', live ? 'Előkészítés alatt' : 'Lezárt szezon · adatok megtekintve');
  setText('panelStrong', live
    ? 'A 2026/27-es kupa nevezése hamarosan nyílik'
    : 'Selejtező március 31-én, nagydöntő április 13-án');
  setText('panelSub', live
    ? 'Makó, Posta u. 4-6 · 304-es terem'
    : '11 csapat · 10 mérkőzés · 11 tabella-bejegyzés');
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
  updateUserPanel();
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
    btn.textContent = 'Mentés...';

    setTimeout(function(){
      state.userTeam = {
        name: teamName,
        captainEmail: captainEmail,
        players: players,
        teacher: teacher,
        registeredAt: new Date().toISOString()
      };
      state.isEditMode = false;
      saveLocalTeam();
      btn.textContent = 'Már regisztráltál!';
      renderAll();
      toast('✅ ' + teamName + ' csapat rögzítve ezen az eszközön!');
    }, 450);
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
  kezdolap:    'KERI // ESPORT — Kezdőlap',
  szabalyok:   'KERI // ESPORT — Szabályok',
  naptar:      'KERI // ESPORT — Versenynaptár',
  merkozesek:  'KERI // ESPORT — Mérkőzések',
  tabella:     'KERI // ESPORT — Tabella',
  dijazas:     'KERI // ESPORT — Díjazás',
  csapatok:    'KERI // ESPORT — Csapatok',
  gyik:        'KERI // ESPORT — GYIK',
  jelentkezes: 'KERI // ESPORT — Jelentkezés'
};
let currentView = null;
let revealIO = null;

const REVEAL_SEL = '.hero-left > *, .hero-right, .stats-strip .stat, .rule-card, .cal-card, .tl-item, .match-card, ' +
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
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
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
  renderAll();
  armReveal(document);
  if (state.userTeam){
    const btn = $('#submitBtn');
    if (btn && state.season === '2026/27') btn.textContent = 'Már regisztráltál!';
  }
})();
