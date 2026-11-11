/* =========================================================
   KERIGAMES — diák belépés
   Google Identity Services + @keri.mako.hu domain-korlát,
   kapcsolható demó belépéssel (helyi kipróbálásra).

   FONTOS: a böngészőoldali ellenőrzés kényelmet szolgál, NEM
   biztonsági határ — a szerver csak 127.0.0.1-re köt.
   ========================================================= */
'use strict';

const STUDENT_AUTH = (function () {
  const conf = window.KERI_AUTH || {};
  const CONFIG = {
    clientId: conf.clientId || '',
    domain: conf.domain || 'keri.mako.hu',
    demoAllowed: conf.demoAllowed !== false,
    sessionKey: 'keri_student_session',
    linkKey: 'keri_student_links',
    sessionDays: conf.sessionDays || 7
  };

  let els = {};
  let onAuth = null;

  function byId(id) { return document.getElementById(id); }

  /* ---------- munkamenet és név-hozzárendelés ---------- */
  function readSession() {
    try {
      const raw = localStorage.getItem(CONFIG.sessionKey);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.email || !s.exp || s.exp < Date.now()) return null;
      if (!String(s.email).toLowerCase().endsWith('@' + CONFIG.domain)) return null;
      return s;
    } catch (e) { return null; }
  }

  function writeSession(s) {
    try { localStorage.setItem(CONFIG.sessionKey, JSON.stringify(s)); } catch (e) {}
  }

  function clearSession() {
    try { localStorage.removeItem(CONFIG.sessionKey); } catch (e) {}
  }

  function readLinks() {
    try { return JSON.parse(localStorage.getItem(CONFIG.linkKey) || '{}') || {}; }
    catch (e) { return {}; }
  }

  function nameFor(email) {
    const key = String(email || '').toLowerCase();
    if (!key) return '';
    return readLinks()[key] || '';
  }

  function setName(email, name) {
    const key = String(email || '').toLowerCase();
    if (!key) return;
    const links = readLinks();
    if (name) links[key] = String(name);
    else delete links[key];
    try { localStorage.setItem(CONFIG.linkKey, JSON.stringify(links)); } catch (e) {}
  }

  /* ---------- üzenet ---------- */
  function setMsg(text, isError) {
    const el = els.msg;
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('is-error');
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
  }

  /* ---------- Google ID token ---------- */
  function decodeJwt(token) {
    const part = String(token).split('.')[1];
    if (!part) throw new Error('bad-token');
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const json = decodeURIComponent(
      atob(padded).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('')
    );
    return JSON.parse(json);
  }

  /* ugyanazok a szabályok, mint az admin belépésnél */
  function validateToken(token) {
    if (!token) return { ok: false, error: 'A Google nem adott vissza azonosítót. Próbáld újra.' };

    let payload;
    try { payload = decodeJwt(token); }
    catch (e) { return { ok: false, error: 'Érvénytelen Google-válasz.' }; }

    const domain = CONFIG.domain;
    const email = String(payload.email || '').toLowerCase();

    if (!email) return { ok: false, error: 'A Google-fiók nem adott e-mail címet.' };
    if (payload.email_verified === false) return { ok: false, error: 'A Google-fiók e-mail címe nincs megerősítve.' };
    if (payload.exp && payload.exp * 1000 < Date.now()) return { ok: false, error: 'A Google-válasz lejárt. Próbáld újra.' };
    if (!email.endsWith('@' + domain)) {
      return { ok: false, error: 'Csak @' + domain + ' címmel lehet belépni. Ez a fiók: ' + email };
    }
    if (payload.hd && String(payload.hd).toLowerCase() !== domain) {
      return { ok: false, error: 'Ez a fiók nem a ' + domain + ' Workspace-hez tartozik.' };
    }
    return { ok: true, email: email, name: payload.name || '' };
  }

  function loadGis() {
    return new Promise(function (resolve, reject) {
      if (window.google && window.google.accounts && window.google.accounts.id) return resolve();
      if (!CONFIG.clientId) return reject(new Error('no-client-id'));
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('gis-load')); };
      document.head.appendChild(s);
    });
  }

  function setupGis() {
    const g = window.google;
    if (!g || !g.accounts || !g.accounts.id) throw new Error('gis-missing');

    g.accounts.id.initialize({
      client_id: CONFIG.clientId,
      hd: CONFIG.domain,
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: handleCredential
    });

    if (els.host) {
      els.host.innerHTML = '';
      g.accounts.id.renderButton(els.host, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        locale: 'hu',
        width: 320
      });
    }
    if (els.fallback) els.fallback.hidden = true;
  }

  function handleCredential(response) {
    const result = validateToken(response && response.credential);
    if (!result.ok) { setMsg(result.error, true); return; }
    grant({ email: result.email, name: result.name, mode: 'google' });
  }

  /* ---------- belépés / kilépés ---------- */
  function grant(identity) {
    const session = {
      email: String(identity.email || '').toLowerCase(),
      name: identity.name || '',
      mode: identity.mode,
      exp: Date.now() + CONFIG.sessionDays * 86400e3
    };
    writeSession(session);
    setMsg('');
    if (typeof onAuth === 'function') onAuth(session);
  }

  function signOut() {
    clearSession();
    try {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        window.google.accounts.id.disableAutoSelect();
      }
    } catch (e) {}
    setMsg('');
    if (typeof onAuth === 'function') onAuth(null);
  }

  function startGoogle() {
    if (!CONFIG.clientId) {
      setMsg('A Google belépés még nincs bekapcsolva: hiányzik az OAuth kliens-azonosító (assets/js/auth-config.js → clientId).', true);
      return;
    }
    loadGis().then(function () {
      setupGis();
      setMsg('');
    }).catch(function () {
      setMsg('A Google belépés nem tölthető be. Ellenőrizd a hálózatot.', true);
    });
  }

  function bind() {
    if (els.demo) {
      els.demo.addEventListener('change', function (e) {
        if (els.demoBtn) els.demoBtn.disabled = !e.target.checked;
      });
    }
    if (els.demoBtn) {
      els.demoBtn.addEventListener('click', function () {
        if (!els.demo || !els.demo.checked) return;
        grant({ email: 'diak@keri.mako.hu', name: 'Demó diák', mode: 'demo' });
      });
    }
    if (els.fallback) els.fallback.addEventListener('click', startGoogle);
  }

  function init(options) {
    onAuth = options && options.onAuth;

    els = {
      host: byId('pfGsiHost'),
      fallback: byId('pfGoogleFallback'),
      msg: byId('pfAuthMsg'),
      demo: byId('pfDemo'),
      demoBtn: byId('pfDemoBtn'),
      demoBox: byId('pfDemoBox')
    };

    bind();
    if (els.demoBox) els.demoBox.hidden = !CONFIG.demoAllowed;
    if (els.demoBtn) els.demoBtn.disabled = true;

    const session = readSession();
    if (session && typeof onAuth === 'function') onAuth(session);

    if (CONFIG.clientId) {
      loadGis().then(setupGis).catch(function () {
        setMsg('A Google belépés nem tölthető be (hálózat vagy blokkolt script).', true);
      });
    }
  }

  return {
    init: init,
    signOut: signOut,
    session: readSession,
    validateToken: validateToken,
    nameFor: nameFor,
    setName: setName,
    config: CONFIG
  };
})();
