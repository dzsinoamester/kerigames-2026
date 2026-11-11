/* =========================================================
   KERIGAMES — helyi adatkiszolgáló
   Statikus oldal + JSON API + fájlos tárolás (data/db.json).
   Nincs függőség, csak a Node beépített moduljai.

   Indítás:  npm start   (vagy: node server.js)
   Alapértelmezett cím: http://127.0.0.1:8124

   FONTOS: ez helyi fejlesztői szerver. Nincs benne valódi
   hitelesítés — ezért csak 127.0.0.1-re köt, nem a hálózatra.
   ========================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SEED_FILE = path.join(DATA_DIR, 'seed.json');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const PORT = Number(process.env.PORT) || 8124;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 6 * 1024 * 1024;   /* hírkép feltöltés miatt (a kép max 3,5 MB) */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp'
};

const BAD_WORDS = ['fuck', 'shit', 'bitch', 'kurva', 'fasz', 'picsa', 'geci', 'basz', 'segg'];

/* ---------------- tárolás ---------------- */
function readDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.competitions)) throw new Error('bad shape');
    parsed.news = Array.isArray(parsed.news) ? parsed.news : [];
    parsed.events = Array.isArray(parsed.events) ? parsed.events : [];
    parsed.log = Array.isArray(parsed.log) ? parsed.log : [];
    return parsed;
  } catch (err) {
    try {
      const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
      console.warn('[keri] data/db.json hiányzik vagy sérült — a seed.json-ből indulok.');
      writeDb(seed);
      return seed;
    } catch (e) {
      console.error('[keri] Nincs adat: tedd be a data/seed.json fájlt.');
      return { competitions: [], teams: [], matches: [], log: [] };
    }
  }
}

function writeDb(next) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);   /* atomikus csere, félig írt fájl nem marad */
}

let db = readDb();

/* a közösségi tömbök mindig létezzenek (régi adatfájlból is induljon) */
function ensureSocialState() {
  db.seekers = Array.isArray(db.seekers) ? db.seekers : [];
  db.votes = Array.isArray(db.votes) ? db.votes : [];
  db.requests = Array.isArray(db.requests) ? db.requests : [];
  db.settings = (db.settings && typeof db.settings === 'object') ? db.settings : {};
}
ensureSocialState();

/* ---------------- segédek ---------------- */
function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('A kérés túl nagy.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', function () {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('Érvénytelen JSON.')); }
    });
    req.on('error', reject);
  });
}

function pushLog(action, detail, actor) {
  db.log.unshift({
    id: nextId('l', db.log),
    at: new Date().toISOString(),
    actor: actor || 'tanár',
    action: action,
    detail: detail || ''
  });
  db.log = db.log.slice(0, 300);
}

function nextId(prefix, list) {
  const re = new RegExp('^' + prefix + '(\\d+)$');
  let max = 0;
  (list || []).forEach(function (item) {
    const m = String(item.id || '').match(re);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return prefix + (max + 1);
}

function actorOf(req) {
  const raw = String(req.headers['x-admin-actor'] || '').trim();
  return raw ? raw.slice(0, 80) : 'tanár';
}

function norm(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasBadWord(v) {
  const low = norm(v);
  return BAD_WORDS.some(function (w) { return low.indexOf(w) !== -1; });
}

function isEmail(v) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || ''));
}

function maskEmail(email) {
  const parts = String(email || '').split('@');
  if (parts.length !== 2) return '';
  const user = parts[0];
  if (user.length <= 2) return user.charAt(0) + '••@' + parts[1];
  return user.slice(0, 2) + '•'.repeat(Math.min(6, Math.max(2, user.length - 2))) + '@' + parts[1];
}

function huDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[1] + '.' + m[2] + '.' + m[3] + '.' : String(iso || '');
}

function compById(id) {
  return db.competitions.find(function (c) { return c.id === id; }) || null;
}

function teamById(id) {
  return db.teams.find(function (t) { return t.id === id; }) || null;
}

function teamName(id) {
  const t = teamById(id);
  return t ? t.name : '?';
}

/* ---------------- feltöltött képek ---------------- */
const UPLOAD_TYPES = [
  ['data:image/png;base64,', 'png'],
  ['data:image/jpeg;base64,', 'jpg'],
  ['data:image/jpg;base64,', 'jpg'],
  ['data:image/webp;base64,', 'webp']
];

function saveUpload(dataUrl, prefix) {
  const hit = UPLOAD_TYPES.find(function (t) { return dataUrl.indexOf(t[0]) === 0; });
  if (!hit) throw new Error('Csak JPG, PNG vagy WEBP kép tölthető fel.');

  const buf = Buffer.from(dataUrl.slice(hit[0].length), 'base64');
  if (!buf.length) throw new Error('A kép üres.');
  if (buf.length > 3.5 * 1024 * 1024) throw new Error('A kép túl nagy — legfeljebb 3,5 MB lehet.');

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = prefix + '-' + Date.now().toString(36) + '.' + hit[1];
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return '/uploads/' + name;
}

function removeUpload(url) {
  const value = String(url || '');
  if (value.indexOf('/uploads/') !== 0) return;
  try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(value))); }
  catch (e) { /* a fájl már nincs meg */ }
}

/* ---------------- tabella számítása ---------------- */
function standingsFor(comp) {
  const rows = new Map();
  db.teams
    .filter(function (t) { return t.comp === comp.id && t.status === 'approved'; })
    .forEach(function (t) {
      rows.set(t.id, {
        teamName: t.name,
        wins: 0,
        losses: 0,
        matchesPlayed: 0,
        points: Number(t.adjust) || 0,   /* kézi pontkorrekció az adminból */
        adjust: Number(t.adjust) || 0,
        adjustNote: t.adjustNote || ''
      });
    });

  const win = Number(comp.winPoints);
  const draw = Number(comp.drawPoints) || 0;
  const penalty = Number(comp.noShowPenalty) || 0;

  db.matches
    .filter(function (m) { return m.comp === comp.id && (m.status === 'done' || m.status === 'no-show'); })
    .forEach(function (m) {
      const a = rows.get(m.a);
      const b = rows.get(m.b);
      if (!a || !b) return;
      a.matchesPlayed++;
      b.matchesPlayed++;

      if (m.status === 'no-show') {
        /* aki nem jelent meg: vereség + pontlevonás */
        const aOut = Number(m.scoreB) > 0 && Number(m.scoreA) === 0;
        const out = aOut ? a : b;
        const kept = aOut ? b : a;
        kept.wins++;
        kept.points += win;
        out.losses++;
        out.points -= penalty;
        return;
      }

      const sa = Number(m.scoreA) || 0;
      const sb = Number(m.scoreB) || 0;
      if (sa > sb) { a.wins++; b.losses++; a.points += win; }
      else if (sb > sa) { b.wins++; a.losses++; b.points += win; }
      else { a.points += draw; b.points += draw; }
    });

  return Array.from(rows.values()).sort(function (x, y) {
    if (y.points !== x.points) return y.points - x.points;
    if (y.wins !== x.wins) return y.wins - x.wins;
    return x.teamName.localeCompare(y.teamName, 'hu');
  });
}

/* ---------------- publikus nézet a valódi oldalnak ---------------- */
function publicView() {
  const comp = compById('cs2-2026-27')
    || db.competitions.find(function (c) { return c.state === 'live'; })
    || db.competitions[0];

  if (!comp) {
    return { competition: null, teams: [], standings: [], schedule: [], updatedAt: new Date().toISOString() };
  }

  const teams = db.teams
    .filter(function (t) { return t.comp === comp.id && t.status === 'approved'; })
    .map(function (t) {
      return {
        name: t.name,
        players: Array.isArray(t.players) ? t.players : [],
        captainEmail: maskEmail(t.captain),
        teacher: t.teacher || ''
      };
    });

  const schedule = db.matches
    .filter(function (m) { return m.comp === comp.id; })
    .sort(function (x, y) { return (x.date + x.time).localeCompare(y.date + y.time); })
    .map(function (m) {
      return {
        date: huDate(m.date),
        time: m.time,
        stage: 'R' + m.round + (m.stage === 'final' ? ' · döntő' : ' · csoport'),
        team1: teamName(m.a),
        team2: teamName(m.b),
        location: m.room,
        status: m.status,
        score: (m.status === 'done' || m.status === 'no-show') ? String(m.scoreA) + '–' + String(m.scoreB) : ''
      };
    });

  const news = (db.news || []).slice().sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date));
  });

  const events = (db.events || []).slice().sort(function (a, b) {
    return String(a.date).localeCompare(String(b.date));
  });

  return {
    competition: comp.id,
    game: comp.game,
    season: '2026/27',
    teams: teams,
    standings: standingsFor(comp),
    schedule: schedule,
    news: news,
    events: events,
    updatedAt: new Date().toISOString()
  };
}

/* ---------------- API ---------------- */
function apiTeamRegister(req, res) {
  readBody(req).then(function (body) {
    const comp = compById(body.comp);
    if (!comp) return sendJson(res, 400, { error: 'Ismeretlen verseny.' });

    const name = String(body.name || '').trim();
    if (name.length < 3 || name.length > 50) {
      return sendJson(res, 400, { error: 'A csapatnév 3 és 50 karakter között legyen.' });
    }
    if (hasBadWord(name)) return sendJson(res, 400, { error: 'A csapatnév sértő szót tartalmaz.' });

    const captain = String(body.captain || '').trim();
    if (!isEmail(captain)) return sendJson(res, 400, { error: 'Érvénytelen kapitány e-mail cím.' });

    const players = (Array.isArray(body.players) ? body.players : [])
      .map(function (p) { return String(p || '').trim(); })
      .filter(Boolean);
    if (players.length !== comp.teamSize) {
      return sendJson(res, 400, {
        error: 'A(z) ' + comp.game + ' ' + comp.teamSize + ' fős csapatot vár (most ' + players.length + ' fő).'
      });
    }
    for (const p of players) {
      if (p.length < 2 || p.length > 40) return sendJson(res, 400, { error: 'A játékos neve 2–40 karakter legyen.' });
      if (hasBadWord(p)) return sendJson(res, 400, { error: 'Sértő szó a játékosok között: ' + p });
    }

    const dup = db.teams.find(function (t) {
      return t.comp === comp.id && t.status !== 'rejected' && norm(t.name) === norm(name);
    });
    if (dup) return sendJson(res, 409, { error: 'Ezen a néven már van nevezés ebben a versenyben.' });

    const team = {
      id: nextId('t', db.teams),
      comp: comp.id,
      name: name,
      captain: captain,
      players: players,
      teacher: String(body.teacher || '').trim().slice(0, 80),
      klass: String(body.klass || '').trim().slice(0, 20),
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    db.teams.push(team);
    pushLog('Nevezés beérkezett', team.name + ' · ' + comp.short, actorOf(req));
    writeDb(db);
    sendJson(res, 201, team);
  }).catch(function (err) {
    sendJson(res, 400, { error: err.message });
  });
}

function apiTeamStatus(req, res, id) {
  readBody(req).then(function (body) {
    const team = teamById(id);
    if (!team) return sendJson(res, 404, { error: 'Nincs ilyen csapat.' });
    const status = String(body.status || '');
    if (['pending', 'approved', 'rejected'].indexOf(status) === -1) {
      return sendJson(res, 400, { error: 'Érvénytelen állapot.' });
    }
    team.status = status;
    if (status === 'approved') team.approvedAt = new Date().toISOString();
    if (status === 'rejected') team.rejectReason = String(body.reason || '').slice(0, 200);
    const labels = { approved: 'Nevezés jóváhagyva', rejected: 'Nevezés elutasítva', pending: 'Nevezés visszaállítva' };
    pushLog(labels[status], team.name + (team.rejectReason ? ' — ' + team.rejectReason : ''), actorOf(req));
    writeDb(db);
    sendJson(res, 200, team);
  }).catch(function (err) { sendJson(res, 400, { error: err.message }); });
}

function apiMatchCreate(req, res) {
  readBody(req).then(function (body) {
    const comp = compById(body.comp);
    if (!comp) return sendJson(res, 400, { error: 'Ismeretlen verseny.' });

    const a = teamById(body.a);
    const b = teamById(body.b);
    if (!a || !b) return sendJson(res, 400, { error: 'Ismeretlen csapat.' });
    if (a.id === b.id) return sendJson(res, 400, { error: 'Ugyanaz a csapat nem játszhat önmagával.' });
    if (a.comp !== comp.id || b.comp !== comp.id) return sendJson(res, 400, { error: 'A csapat nem ehhez a versenyhez tartozik.' });
    if (a.status !== 'approved' || b.status !== 'approved') {
      return sendJson(res, 400, { error: 'Csak jóváhagyott csapatok játszhatnak.' });
    }

    const date = String(body.date || '');
    const time = String(body.time || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJson(res, 400, { error: 'Érvénytelen dátum.' });
    if (!/^\d{2}:\d{2}$/.test(time)) return sendJson(res, 400, { error: 'Érvénytelen kezdés.' });

    const round = Math.max(1, Math.min(30, parseInt(body.round, 10) || 1));
    const bestOf = [1, 3, 5].indexOf(Number(body.bestOf)) === -1 ? comp.bestOf : Number(body.bestOf);
    const room = String(body.room || '304-es terem').slice(0, 60);

    const clash = db.matches.find(function (m) {
      if (m.date !== date || m.time !== time) return false;
      if (m.room === room) return true;
      return m.a === a.id || m.b === a.id || m.a === b.id || m.b === b.id;
    });
    if (clash) {
      return sendJson(res, 409, { error: 'Ütközés: ebben az időpontban már van meccs ebben a teremben vagy az egyik csapatnak.' });
    }

    const match = {
      id: nextId('m', db.matches),
      comp: comp.id,
      round: round,
      stage: String(body.stage || 'group'),
      a: a.id,
      b: b.id,
      date: date,
      time: time,
      room: room,
      bestOf: bestOf,
      scoreA: '',
      scoreB: '',
      status: 'scheduled',
      reportedBy: ''
    };
    db.matches.push(match);
    pushLog('Mérkőzés beütemezve', a.name + ' vs ' + b.name + ' · ' + huDate(date) + ' ' + time + ' · ' + room, actorOf(req));
    writeDb(db);
    sendJson(res, 201, match);
  }).catch(function (err) { sendJson(res, 400, { error: err.message }); });
}

function apiMatchResult(req, res, id) {
  readBody(req).then(function (body) {
    const match = db.matches.find(function (m) { return m.id === id; });
    if (!match) return sendJson(res, 404, { error: 'Nincs ilyen mérkőzés.' });
    const comp = compById(match.comp);

    if (body.noShowSide === 'a' || body.noShowSide === 'b') {
      const side = body.noShowSide;
      const winnerScore = match.bestOf > 1 ? Math.ceil(match.bestOf / 2) : 1;
      match.scoreA = side === 'a' ? 0 : winnerScore;
      match.scoreB = side === 'b' ? 0 : winnerScore;
      match.status = 'no-show';
      match.reportedBy = actorOf(req);
      match.confirmedAt = new Date().toISOString();
      pushLog('Nem jelent meg', teamName(side === 'a' ? match.a : match.b) + ' — ' + teamName(side === 'a' ? match.b : match.a) + ' kapja a meccset', actorOf(req));
      writeDb(db);
      return sendJson(res, 200, match);
    }

    const sa = Number(body.scoreA);
    const sb = Number(body.scoreB);
    if (!Number.isInteger(sa) || !Number.isInteger(sb) || sa < 0 || sb < 0 || sa > 99 || sb > 99) {
      return sendJson(res, 400, { error: 'A pontszám 0 és 99 közötti egész szám legyen.' });
    }
    if (sa === sb && !(comp && comp.allowDraw)) {
      return sendJson(res, 400, { error: 'Ebben a versenyben döntetlen nem lehet.' });
    }

    match.scoreA = sa;
    match.scoreB = sb;
    match.status = 'done';
    match.reportedBy = actorOf(req);
    match.confirmedAt = new Date().toISOString();
    pushLog('Eredmény rögzítve', teamName(match.a) + ' ' + sa + '–' + sb + ' ' + teamName(match.b) + ' (R' + match.round + ')', actorOf(req));
    writeDb(db);
    sendJson(res, 200, match);
  }).catch(function (err) { sendJson(res, 400, { error: err.message }); });
}

function apiMatchDelete(req, res, id) {
  const match = db.matches.find(function (m) { return m.id === id; });
  if (!match) return sendJson(res, 404, { error: 'Nincs ilyen mérkőzés.' });
  db.matches = db.matches.filter(function (m) { return m.id !== id; });
  pushLog('Mérkőzés törölve', teamName(match.a) + ' vs ' + teamName(match.b) + ' · ' + huDate(match.date), actorOf(req));
  writeDb(db);
  sendJson(res, 200, { ok: true });
}

function apiReset(req, res) {
  try {
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    db = seed;
    pushLog('Adatok visszaállítva', 'A demo alaphelyzet betöltve', actorOf(req));
    writeDb(db);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { error: 'A seed.json nem olvasható: ' + err.message });
  }
}

/* ---------------- hírek, naptár, pontkorrekció ---------------- */
function apiNewsSave(req, res, id) {
  readBody(req).then(function (body) {
    const date = String(body.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJson(res, 400, { error: 'Érvénytelen dátum.' });

    const title = String(body.title || '').trim();
    if (title.length < 3) return sendJson(res, 400, { error: 'A hír címe legalább 3 karakter legyen.' });

    const existing = id ? (db.news || []).find(function (n) { return n.id === id; }) : null;
    if (id && !existing) return sendJson(res, 404, { error: 'Nincs ilyen hír.' });

    const newsId = existing ? existing.id : nextId('n', db.news);
    const oldImage = existing && existing.image ? existing.image : '';

    let image = oldImage;
    const incoming = String(body.image || '');
    try {
      if (incoming.indexOf('data:') === 0) {
        image = saveUpload(incoming, 'news-' + newsId);
        if (oldImage) removeUpload(oldImage);
      } else if (!incoming) {
        if (oldImage) removeUpload(oldImage);
        image = '';
      }
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const item = {
      date: date,
      tag: String(body.tag || 'Hír').slice(0, 20),
      title: title.slice(0, 140),
      link: String(body.link || '').slice(0, 120),
      season: String(body.season || '2026/27').slice(0, 9),
      image: image
    };

    if (existing) {
      Object.assign(existing, item);
      pushLog('Hír módosítva', item.title, actorOf(req));
    } else {
      db.news.push(Object.assign({ id: newsId }, item));
      pushLog('Hír hozzáadva', item.title, actorOf(req));
    }

    writeDb(db);
    sendJson(res, 200, { ok: true, image: image });
  }).catch(function (err) { sendJson(res, 400, { error: err.message }); });
}

function apiNewsDelete(req, res, id) {
  const news = (db.news || []).find(function (n) { return n.id === id; });
  if (!news) return sendJson(res, 404, { error: 'Nincs ilyen hír.' });
  removeUpload(news.image);
  db.news = db.news.filter(function (n) { return n.id !== id; });
  pushLog('Hír törölve', news.title, actorOf(req));
  writeDb(db);
  sendJson(res, 200, { ok: true });
}

function apiEventSave(req, res, id) {
  readBody(req).then(function (body) {
    const date = String(body.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJson(res, 400, { error: 'Érvénytelen dátum.' });

    const title = String(body.title || '').trim();
    if (title.length < 2) return sendJson(res, 400, { error: 'Az esemény neve legalább 2 karakter legyen.' });

    const types = ['deadline', 'match', 'final', 'custom'];
    const compId = String(body.comp || 'cs2-2026-27');
    if (!compById(compId)) return sendJson(res, 400, { error: 'Ismeretlen verseny.' });

    const item = {
      date: date,
      time: /^\d{2}:\d{2}$/.test(String(body.time || '')) ? String(body.time) : '',
      type: types.indexOf(String(body.type)) !== -1 ? String(body.type) : 'custom',
      title: title.slice(0, 120),
      note: String(body.note || '').slice(0, 300),
      comp: compId,
      round: Math.max(1, Math.min(30, parseInt(body.round, 10) || 1))
    };

    if (id) {
      const ev = (db.events || []).find(function (e) { return e.id === id; });
      if (!ev) return sendJson(res, 404, { error: 'Nincs ilyen esemény.' });

      /* az eseményből generált meccsek követik a dátumot és az időpontot */
      const oldTime = ev.time || '';
      const newTime = item.time || '';
      const delta = (oldTime && newTime) ? (minutesOf(newTime) - minutesOf(oldTime)) : 0;
      const shift = (ev.date !== item.date || delta !== 0);

      const generated = (db.matches || []).filter(function (m) { return m.eventId === ev.id; });
      const moved = shift ? generated.filter(function (m) { return m.status === 'scheduled'; }) : [];
      const kept = shift ? generated.length - moved.length : 0;

      Object.assign(ev, item);

      moved.forEach(function (m) {
        m.date = item.date;
        if (delta) m.time = addMinutes(m.time, delta);
      });

      /* áthelyezés után kiderül, ha valami összeér egy másik meccsel */
      const movedIds = new Set(moved.map(function (m) { return m.id; }));
      const conflicts = [];
      moved.forEach(function (m) {
        const hit = db.matches.some(function (x) {
          return x.id !== m.id && !movedIds.has(x.id) && x.date === m.date && x.time === m.time &&
            (x.room === m.room || x.a === m.a || x.b === m.a || x.a === m.b || x.b === m.b);
        });
        if (hit) conflicts.push(teamName(m.a) + ' vs ' + teamName(m.b) + ' · ' + m.time);
      });

      pushLog('Esemény módosítva',
        item.title + ' · ' + huDate(item.date) +
        (moved.length ? ' · ' + moved.length + ' meccs áthelyezve' : '') +
        (conflicts.length ? ' · ' + conflicts.length + ' ütközés' : ''),
        actorOf(req));

      writeDb(db);
      return sendJson(res, 200, { ok: true, moved: moved.length, kept: kept, conflicts: conflicts });
    } else {
      db.events.push(Object.assign({ id: nextId('e', db.events) }, item));
      pushLog('Esemény hozzáadva', item.title + ' · ' + huDate(item.date), actorOf(req));
    }

    writeDb(db);
    sendJson(res, 200, { ok: true });
  }).catch(function (err) { sendJson(res, 400, { error: err.message }); });
}

function apiEventDelete(req, res, id) {
  const ev = (db.events || []).find(function (e) { return e.id === id; });
  if (!ev) return sendJson(res, 404, { error: 'Nincs ilyen esemény.' });
  db.events = db.events.filter(function (e) { return e.id !== id; });
  pushLog('Esemény törölve', ev.title + ' · ' + huDate(ev.date), actorOf(req));
  writeDb(db);
  sendJson(res, 200, { ok: true });
}

function apiTeamAdjust(req, res, id) {
  readBody(req).then(function (body) {
    const team = teamById(id);
    if (!team) return sendJson(res, 404, { error: 'Nincs ilyen csapat.' });
    const points = Number(body.points);
    if (!Number.isInteger(points) || points < -100 || points > 100) {
      return sendJson(res, 400, { error: 'A korrekció -100 és 100 közötti egész szám legyen.' });
    }
    team.adjust = points;
    team.adjustNote = String(body.note || '').slice(0, 120);
    pushLog('Pontkorrekció', team.name + ': ' + (points >= 0 ? '+' : '') + points + (team.adjustNote ? ' — ' + team.adjustNote : ''), actorOf(req));
    writeDb(db);
    sendJson(res, 200, team);
  }).catch(function (err) { sendJson(res, 400, { error: err.message }); });
}

/* ---------------- diák profil ---------------- */
function apiProfile(req, res) {
  readBody(req).then(function (body) {
    const query = String(body.query || '').trim();
    if (query.length < 3) return sendJson(res, 400, { error: 'Adj meg egy iskolai e-mail címet vagy teljes nevet.' });

    const low = query.toLowerCase();
    const mine = db.teams.filter(function (t) {
      if (String(t.captain || '').toLowerCase() === low) return true;
      return (t.players || []).some(function (p) { return String(p || '').trim().toLowerCase() === low; });
    });

    if (!mine.length) {
      return sendJson(res, 404, { error: 'Ehhez a névhez vagy e-mail címhez nincs nevezett csapat.' });
    }

    const teams = mine.map(function (t) {
      const comp = compById(t.comp) || {};
      const rows = standingsFor(comp);
      const idx = rows.findIndex(function (r) { return r.teamName === t.name; });
      const row = idx >= 0 ? rows[idx] : null;
      const isCaptain = String(t.captain || '').toLowerCase() === low;

      const matches = db.matches
        .filter(function (m) { return m.comp === t.comp && (m.a === t.id || m.b === t.id); })
        .sort(function (x, y) { return (x.date + x.time).localeCompare(y.date + y.time); })
        .map(function (m) {
          const home = m.a === t.id;
          const played = m.status === 'done' || m.status === 'no-show';
          return {
            id: m.id,
            date: m.date,
            time: m.time,
            round: m.round,
            stage: m.stage,
            room: m.room,
            home: home,
            opponent: teamName(home ? m.b : m.a),
            status: m.status,
            score: played ? String(m.scoreA) + '–' + String(m.scoreB) : '',
            myScore: played ? Number(home ? m.scoreA : m.scoreB) : null,
            theirScore: played ? Number(home ? m.scoreB : m.scoreA) : null
          };
        });

      return {
        id: t.id,
        comp: t.comp,
        game: comp.game || '',
        short: comp.short || '',
        name: t.name,
        players: t.players || [],
        teacher: t.teacher || '',
        captain: maskEmail(t.captain),
        isCaptain: isCaptain,
        status: t.status,
        rejectReason: t.rejectReason || '',
        createdAt: t.createdAt || '',
        standing: row ? { pos: idx + 1, wins: row.wins, losses: row.losses, points: row.points } : null,
        matches: matches
      };
    });

    const social = {
      stats: teams.map(function (t) { return { id: t.id, name: t.name, stats: teamStats(t) }; }),
      seekers: (db.seekers || [])
        .filter(function (s) { return s.status === 'open'; })
        .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })
        .map(function (s) {
          return {
            id: s.id, teamName: s.teamName, game: (compById(s.comp) || {}).short || '',
            needed: s.needed, note: s.note, contact: s.contact, createdAt: s.createdAt,
            mine: teams.some(function (t) { return t.id === s.teamId; })
          };
        }),
      votes: voteTally(low),
      requests: (db.requests || [])
        .filter(function (r) { return teams.some(function (t) { return t.id === r.teamId; }); })
        .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }),
      icsUrl: '/api/ics?query=' + encodeURIComponent(query)
    };

    sendJson(res, 200, Object.assign({ query: query, teams: teams }, social, { updatedAt: new Date().toISOString() }));
  }).catch(function (err) { sendJson(res, 400, { error: err.message }); });
}

/* ---------------- forduló → meccsek ---------------- */
/* körforma (round robin): minden fordulóban mindenki egyszer játszik */
function roundRobinRounds(ids) {
  const list = ids.slice();
  if (list.length % 2) list.push(null);            /* páratlan létszám: valaki pihen */
  const n = list.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);   /* hazai/pálya váltogatás */
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop());                     /* az első fix, a többi forog */
  }
  return rounds;
}

function minutesOf(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? (Number(m[1]) * 60 + Number(m[2])) : 0;
}

function addMinutes(hhmm, minutes) {
  const m = String(hhmm || '14:00').match(/^(\d{1,2}):(\d{2})$/);
  let total = m ? (Number(m[1]) * 60 + Number(m[2])) : 14 * 60;
  total = (((total + minutes) % 1440) + 1440) % 1440;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

function apiEventMatches(req, res, id) {
  readBody(req).then(function (body) {
    const ev = (db.events || []).find(function (e) { return e.id === id; });
    if (!ev) return sendJson(res, 404, { error: 'Nincs ilyen esemény.' });

    const comp = compById(ev.comp || 'cs2-2026-27');
    if (!comp) return sendJson(res, 400, { error: 'Az eseményhez nincs érvényes verseny.' });

    const teams = db.teams.filter(function (t) { return t.comp === comp.id && t.status === 'approved'; });
    if (teams.length < 2) {
      return sendJson(res, 400, { error: 'Legalább két jóváhagyott csapat kell a párosításhoz.' });
    }

    const slot = Math.max(20, Math.min(180, parseInt(body.slotMinutes, 10) || 60));
    const room = String(body.room || '304-es terem').slice(0, 60);
    const round = Math.max(1, Math.min(30, parseInt(ev.round, 10) || 1));
    const startTime = /^\d{2}:\d{2}$/.test(ev.time || '') ? ev.time : '14:00';

    const rounds = roundRobinRounds(teams.map(function (t) { return t.id; }));
    const pairs = rounds[(round - 1) % rounds.length];

    let created = 0, skipped = 0;
    const slots = [];

    pairs.forEach(function (pair, index) {
      const a = pair[0], b = pair[1];
      const time = addMinutes(startTime, index * slot);

      /* ha ez a párosítás már szerepel bármelyik fordulóban, nem duplikálunk */
      const exists = db.matches.some(function (m) {
        return m.comp === comp.id &&
          ((m.a === a && m.b === b) || (m.a === b && m.b === a));
      });
      if (exists) { skipped++; return; }

      /* ütközés: ugyanaz a terem/időpont, vagy ugyanaz a csapat máshol */
      const clash = db.matches.some(function (m) {
        if (m.date !== ev.date || m.time !== time) return false;
        return m.room === room || m.a === a || m.b === a || m.a === b || m.b === b;
      });
      if (clash) { skipped++; return; }

      db.matches.push({
        id: nextId('m', db.matches),
        comp: comp.id,
        round: round,
        stage: 'group',
        a: a,
        b: b,
        date: ev.date,
        time: time,
        room: room,
        bestOf: comp.bestOf,
        scoreA: '',
        scoreB: '',
        status: 'scheduled',
        reportedBy: '',
        eventId: ev.id
      });
      created++;
      slots.push(teamName(a) + ' vs ' + teamName(b) + ' · ' + time);
    });

    if (created) {
      pushLog('Forduló meccsei legenerálva', ev.title + ' · ' + created + ' meccs' + (skipped ? ' · ' + skipped + ' kihagyva' : ''), actorOf(req));
      writeDb(db);
    }

    sendJson(res, 200, { created: created, skipped: skipped, round: round, pairs: pairs.length, slots: slots });
  }).catch(function (err) { sendJson(res, 400, { error: err.message }); });
}

/* =========================================================
   DIÁK FUNKCIÓK — csapatkereső, szavazás, csere, naptár, értesítés
   ========================================================= */
const VOTE_OPTIONS = [
  ['rl', 'Rocket League'],
  ['valorant', 'VALORANT'],
  ['lol', 'League of Legends'],
  ['minecraft', 'Minecraft'],
  ['fortnite', 'Fortnite'],
  ['tekken', 'Tekken / Street Fighter']
];

function identityFor(query) {
  const low = String(query || '').trim().toLowerCase();
  if (!low) return null;
  const teams = db.teams.filter(function (t) {
    if (String(t.captain || '').toLowerCase() === low) return true;
    return (t.players || []).some(function (p) { return String(p || '').trim().toLowerCase() === low; });
  });
  return {
    key: low,
    teams: teams,
    captainOf: teams.filter(function (t) { return String(t.captain || '').toLowerCase() === low; })
  };
}

function teamStats(team) {
  const list = db.matches
    .filter(function (m) { return m.comp === team.comp && (m.a === team.id || m.b === team.id); })
    .sort(function (x, y) { return (x.date + x.time).localeCompare(y.date + y.time); });

  let wins = 0, losses = 0, played = 0, streak = 0, best = 0;
  list.forEach(function (m) {
    if (m.status !== 'done' && m.status !== 'no-show') return;
    played++;
    const home = m.a === team.id;
    const my = Number(home ? m.scoreA : m.scoreB) || 0;
    const their = Number(home ? m.scoreB : m.scoreA) || 0;
    if (my > their) {
      wins++; streak++; if (streak > best) best = streak;
    } else {
      losses++; streak = 0;
    }
  });

  const badges = [];
  if (played === 0) badges.push({ key: 'ready', label: 'Rajtra kész', icon: '◆' });
  if (wins > 0) badges.push({ key: 'first', label: 'Első győzelem', icon: '★' });
  if (best >= 3) badges.push({ key: 'streak', label: best + ' győzelmi sorozat', icon: '▲' });
  if (played >= 3 && losses === 0) badges.push({ key: 'unbeaten', label: 'Veretlen', icon: '◈' });
  if (played > 0 && wins / played >= 0.75) badges.push({ key: 'ace', label: '75% feletti arány', icon: '✷' });

  return {
    played: played,
    wins: wins,
    losses: losses,
    rate: played ? Math.round((wins / played) * 100) : 0,
    streak: streak,
    bestStreak: best,
    badges: badges
  };
}

function voteTally(mine) {
  const counts = {};
  VOTE_OPTIONS.forEach(function (o) { counts[o[0]] = 0; });
  (db.votes || []).forEach(function (v) {
    if (counts[v.game] != null) counts[v.game]++;
  });
  const mineVote = mine ? ((db.votes || []).find(function (v) { return v.by === mine; }) || {}).game || '' : '';
  return {
    options: VOTE_OPTIONS.map(function (o) {
      return { game: o[0], label: o[1], votes: counts[o[0]] };
    }),
    total: (db.votes || []).length,
    mine: mineVote
  };
}

function notifyDiscord(text) {
  const url = (db.settings && db.settings.discordWebhook) || process.env.DISCORD_WEBHOOK || '';
  if (!url || typeof fetch !== 'function') return;
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: String(text).slice(0, 1800) })
    }).catch(function () {});
  } catch (e) {}
}

/* ---------- csapatkereső ---------- */
function apiSeekingCreate(req, res) {
  readBody(req).then(function (body) {
    const ident = identityFor(body.query);
    if (!ident || !ident.captainOf.length) {
      return sendJson(res, 403, { error: 'Hirdetést csak a kapitány adhat fel, belépve a profiljába.' });
    }
    const team = ident.captainOf[0];
    if (team.status !== 'approved') {
      return sendJson(res, 400, { error: 'A csapat jóváhagyása után hirdethetsz.' });
    }
    if ((db.seekers || []).some(function (s) { return s.teamId === team.id && s.status === 'open'; })) {
      return sendJson(res, 400, { error: 'Ennek a csapatnak már van nyitott hirdetése.' });
    }
    const needed = Math.max(1, Math.min(3, parseInt(body.needed, 10) || 1));
    const note = String(body.note || '').slice(0, 160);
    if (hasBadWord(note)) return sendJson(res, 400, { error: 'A hirdetés szövege sértő szót tartalmaz.' });

    const ad = {
      id: nextId('s', db.seekers),
      comp: team.comp,
      teamId: team.id,
      teamName: team.name,
      needed: needed,
      note: note,
      contact: maskEmail(team.captain),
      status: 'open',
      createdAt: new Date().toISOString()
    };
    db.seekers.push(ad);
    pushLog('Csapatkereső hirdetés', team.name + ' · ' + needed + ' játékos', ident.key);
    writeDb(db);
    notifyDiscord('Csapatkereső: **' + team.name + '** keres ' + needed + ' játékost' + (note ? ' — ' + note : ''));
    sendJson(res, 200, { ok: true, ad: ad });
  }).catch(function (err) { sendJson(res, 400, { error: err.message }); });
}

function apiSeekingClose(req, res, id) {
  readBody(req).then(function (body) {
    const ad = (db.seekers || []).find(function (s) { return s.id === id; });
    if (!ad) return sendJson(res, 404, { error: 'Nincs ilyen hirdetés.' });
    const ident = identityFor(body.query);
    if (!ident || !ident.captainOf.some(function (t) { return t.id === ad.teamId; })) {
      return sendJson(res, 403, { error: 'Csak a hirdető csapat kapitánya zárhatja le.' });
    }
    ad.status = 'closed';
    ad.closedAt = new Date().toISOString();
    pushLog('Hirdetés lezárva', ad.teamName, ident.key);
    writeDb(db);
    sendJson(res, 200, { ok: true });
  }).catch(function (err) { sendJson(res, 400, { error: err.message }); });
}

/* ---------- szavazás ---------- */
function apiVote(req, res) {
  readBody(req).then(function (body) {
    const ident = identityFor(body.query);
    if (!ident || !ident.key) return sendJson(res, 400, { error: 'Előbb lépj be a profilodba.' });

    const game = String(body.game || '');
    if (!VOTE_OPTIONS.some(function (o) { return o[0] === game; })) {
      return sendJson(res, 400, { error: 'Ismeretlen játék.' });
    }

    const existing = (db.votes || []).find(function (v) { return v.by === ident.key; });
    if (existing) existing.game = game;
    else db.votes.push({ id: nextId('v', db.votes), by: ident.key, game: game, at: new Date().toISOString() });

    writeDb(db);
    sendJson(res, 200, { ok: true, votes: voteTally(ident.key) });
  }).catch(function (err) { sendJson(res, 400, { error: err.message }); });
}

/* ---------- játékoscsere ---------- */
function apiRequestCreate(req, res) {
  readBody(req).then(function (body) {
    const ident = identityFor(body.query);
    if (!ident || !ident.captainOf.length) {
      return sendJson(res, 403, { error: 'Cserét csak a kapitány kérhet, belépve a profiljába.' });
    }
    const team = ident.captainOf[0];
    if (team.status !== 'approved') return sendJson(res, 400, { error: 'A csapat jóváhagyása után kérhetsz cserét.' });

    const outPlayer = String(body.outPlayer || '').trim();
    const inPlayer = String(body.inPlayer || '').trim();
    if (outPlayer.length < 3 || inPlayer.length < 3) {
      return sendJson(res, 400, { error: 'Add meg a kimenő és a bejövő játékos nevét is.' });
    }
    if (inPlayer.length > 50) return sendJson(res, 400, { error: 'A név legfeljebb 50 karakter legyen.' });
    if (hasBadWord(inPlayer)) return sendJson(res, 400, { error: 'A név sértő szót tartalmaz.' });

    const players = (team.players || []).map(function (p) { return String(p || '').trim(); });
    if (!players.some(function (p) { return p.toLowerCase() === outPlayer.toLowerCase(); })) {
      return sendJson(res, 400, { error: 'A kimenő játékos nincs a csapatban.' });
    }
    if (players.some(function (p) { return p.toLowerCase() === inPlayer.toLowerCase(); })) {
      return sendJson(res, 400, { error: 'Ez a játékos már a csapatban van.' });
    }
    if ((db.requests || []).some(function (r) { return r.teamId === team.id && r.status === 'pending'; })) {
      return sendJson(res, 400, { error: 'Ennek a csapatnak már van függő cserekérelme.' });
    }

    const item = {
      id: nextId('r', db.requests),
      comp: team.comp,
      teamId: team.id,
      teamName: team.name,
      outPlayer: players.find(function (p) { return p.toLowerCase() === outPlayer.toLowerCase(); }),
      inPlayer: inPlayer,
      note: String(body.note || '').slice(0, 160),
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    db.requests.push(item);
    pushLog('Cserekérelem', team.name + ': ' + item.outPlayer + ' → ' + item.inPlayer, ident.key);
    writeDb(db);
    notifyDiscord('Cserekérelem: **' + team.name + '** — ' + item.outPlayer + ' → ' + item.inPlayer);
    sendJson(res, 200, { ok: true, request: item });
  }).catch(function (err) { sendJson(res, 400, { error: err.message }); });
}

function apiRequestDecide(req, res, id) {
  readBody(req).then(function (body) {
    const r = (db.requests || []).find(function (x) { return x.id === id; });
    if (!r) return sendJson(res, 404, { error: 'Nincs ilyen kérelem.' });
    if (r.status !== 'pending') return sendJson(res, 400, { error: 'Ezt a kérelmet már elbírálták.' });

    const status = String(body.status || '');
    if (status !== 'approved' && status !== 'rejected') {
      return sendJson(res, 400, { error: 'Érvénytelen döntés.' });
    }

    r.status = status;
    r.decidedAt = new Date().toISOString();
    r.decidedBy = actorOf(req);

    if (status === 'approved') {
      const team = teamById(r.teamId);
      if (team) {
        team.players = (team.players || []).map(function (p) {
          return String(p || '').trim().toLowerCase() === r.outPlayer.toLowerCase() ? r.inPlayer : p;
        });
      }
    } else {
      r.rejectReason = String(body.reason || '').slice(0, 200);
    }

    pushLog(status === 'approved' ? 'Csere jóváhagyva' : 'Csere elutasítva',
      r.teamName + ': ' + r.outPlayer + ' → ' + r.inPlayer, actorOf(req));
    writeDb(db);
    notifyDiscord((status === 'approved' ? 'Csere jóváhagyva' : 'Csere elutasítva') +
      ': **' + r.teamName + '** — ' + r.outPlayer + ' → ' + r.inPlayer);
    sendJson(res, 200, { ok: true, request: r });
  }).catch(function (err) { sendJson(res, 400, { error: err.message }); });
}

/* ---------- naptár (ICS) ---------- */
function icsEscape(v) {
  return String(v == null ? '' : v)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function apiIcs(req, res, url) {
  const query = String(url.searchParams.get('query') || '').trim();
  const ident = identityFor(query);
  if (!ident || !ident.teams.length) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Nincs ilyen profil.');
    return;
  }

  const stamp = icsStamp();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KERIGAMES//KERI Esport Kupa//HU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:KERI Esport Kupa - meccseim'
  ];

  ident.teams.forEach(function (t) {
    db.matches
      .filter(function (m) { return m.comp === t.comp && (m.a === t.id || m.b === t.id); })
      .forEach(function (m) {
        const home = m.a === t.id;
        const opp = teamName(home ? m.b : m.a);
        const day = String(m.date || '').replace(/-/g, '');
        const time = String(m.time || '14:00').replace(':', '') + '00';
        lines.push('BEGIN:VEVENT');
        lines.push('UID:' + m.id + '-' + t.id + '@kerigames');
        lines.push('DTSTAMP:' + stamp);
        lines.push('DTSTART:' + day + 'T' + time);
        lines.push('DURATION:PT60M');
        lines.push('SUMMARY:' + icsEscape(t.name + ' vs ' + opp));
        lines.push('LOCATION:' + icsEscape(m.room || '304-es terem'));
        lines.push('DESCRIPTION:' + icsEscape('KERI Esport Kupa' + (m.round ? ' · ' + m.round + '. forduló' : '') + ' · ' + (home ? 'hazai' : 'vendég')));
        lines.push('END:VEVENT');
      });
  });

  lines.push('END:VCALENDAR');
  const body = lines.join('\r\n') + '\r\n';
  res.writeHead(200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="kerigames-meccseim.ics"',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

/* ---------------- statikus kiszolgálás ---------------- */
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  const file = path.resolve(ROOT, '.' + rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('Tiltott útvonal'); return;
  }

  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nincs ilyen fájl: ' + rel);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const isCode = ['.html', '.js', '.css', '.json'].indexOf(ext) !== -1;
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': isCode ? 'no-store' : 'public, max-age=86400'
    });
    res.end(data);
  });
}

/* ---------------- útvonalkezelés ---------------- */
const server = http.createServer(function (req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || HOST + ':' + PORT));
  const pathname = url.pathname;
  const method = req.method || 'GET';

  if (pathname.indexOf('/api/') === 0) {
    if (method === 'GET' && pathname === '/api/site') return sendJson(res, 200, publicView());
    if (method === 'GET' && pathname === '/api/state') return sendJson(res, 200, db);
    if (method === 'POST' && pathname === '/api/teams') return apiTeamRegister(req, res);
    if (method === 'POST' && pathname === '/api/reset') return apiReset(req, res);

    let m = pathname.match(/^\/api\/teams\/([^/]+)\/status$/);
    if (method === 'POST' && m) return apiTeamStatus(req, res, decodeURIComponent(m[1]));

    m = pathname.match(/^\/api\/teams\/([^/]+)\/adjust$/);
    if (method === 'POST' && m) return apiTeamAdjust(req, res, decodeURIComponent(m[1]));

    if (method === 'POST' && pathname === '/api/news') return apiNewsSave(req, res, null);
    m = pathname.match(/^\/api\/news\/([^/]+)$/);
    if (m && method === 'POST') return apiNewsSave(req, res, decodeURIComponent(m[1]));
    if (m && method === 'DELETE') return apiNewsDelete(req, res, decodeURIComponent(m[1]));

    if (method === 'POST' && pathname === '/api/profile') return apiProfile(req, res);
    if (method === 'GET' && pathname === '/api/ics') return apiIcs(req, res, url);

    if (method === 'POST' && pathname === '/api/seeking') return apiSeekingCreate(req, res);
    m = pathname.match(/^\/api\/seeking\/([^/]+)\/close$/);
    if (method === 'POST' && m) return apiSeekingClose(req, res, decodeURIComponent(m[1]));

    if (method === 'POST' && pathname === '/api/vote') return apiVote(req, res);

    if (method === 'POST' && pathname === '/api/requests') return apiRequestCreate(req, res);
    m = pathname.match(/^\/api\/requests\/([^/]+)$/);
    if (method === 'POST' && m) return apiRequestDecide(req, res, decodeURIComponent(m[1]));

    m = pathname.match(/^\/api\/events\/([^/]+)\/matches$/);
    if (method === 'POST' && m) return apiEventMatches(req, res, decodeURIComponent(m[1]));

    if (method === 'POST' && pathname === '/api/events') return apiEventSave(req, res, null);
    m = pathname.match(/^\/api\/events\/([^/]+)$/);
    if (m && method === 'POST') return apiEventSave(req, res, decodeURIComponent(m[1]));
    if (m && method === 'DELETE') return apiEventDelete(req, res, decodeURIComponent(m[1]));

    if (method === 'POST' && pathname === '/api/matches') return apiMatchCreate(req, res);

    m = pathname.match(/^\/api\/matches\/([^/]+)\/result$/);
    if (method === 'POST' && m) return apiMatchResult(req, res, decodeURIComponent(m[1]));

    m = pathname.match(/^\/api\/matches\/([^/]+)$/);
    if (method === 'DELETE' && m) return apiMatchDelete(req, res, decodeURIComponent(m[1]));

    return sendJson(res, 404, { error: 'Ismeretlen API végpont: ' + method + ' ' + pathname });
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405); res.end('Nem támogatott metódus'); return;
  }
  serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, function () {
  console.log('');
  console.log('  KERIGAMES adatkiszolgáló fut');
  console.log('  Oldal:  http://' + HOST + ':' + PORT + '/');
  console.log('  Admin:  http://' + HOST + ':' + PORT + '/admin.html');
  console.log('  Adat:   ' + DB_FILE);
  console.log('');
  console.log('  Csak helyi gépről érhető el (127.0.0.1), és nincs benne éles');
  console.log('  bejelentkezés — publikálás előtt ez még nem elég.');
  console.log('');
});
