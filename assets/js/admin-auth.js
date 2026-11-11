/* =========================================================
   KERIGAMES — szervezői bejelentkezés
   Google Identity Services + @keri.mako.hu domain-korlát,
   valamint kapcsolható demó belépés (csak helyi kipróbálásra).

   FONTOS: a böngészőoldali ellenőrzés kényelmet szolgál, NEM
   biztonsági határ. A valódi védelmet az adja majd, hogy az
   Apps Script minden írás előtt ellenőrzi a Google ID tokent.
   ========================================================= */
'use strict';

/* az OAuth kliens-azonosító egy helyen: assets/js/auth-config.js */
const ADMIN_AUTH_CONFIG = {
  clientId: (window.KERI_AUTH && window.KERI_AUTH.clientId) || '',
  domain: (window.KERI_AUTH && window.KERI_AUTH.domain) || 'keri.mako.hu',
  demoAllowed: true,
  sessionHours: 8,
  sessionKey: 'keri_admin_session',
  demoKey: 'keri_admin_demo'
};

const AdminAuth = (function () {
  let onAuth = null;
  let els = {};
  let gisReady = false;

  function byId(id){ return document.getElementById(id); }

  /* ---------- munkamenet ---------- */
  function readSession(){
    try {
      const raw = sessionStorage.getItem(ADMIN_AUTH_CONFIG.sessionKey);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.email || !s.exp || s.exp < Date.now()) return null;
      if (!String(s.email).toLowerCase().endsWith('@' + ADMIN_AUTH_CONFIG.domain)) return null;
      return s;
    } catch (e) { return null; }
  }
  function writeSession(s){
    try { sessionStorage.setItem(ADMIN_AUTH_CONFIG.sessionKey, JSON.stringify(s)); } catch (e) {}
  }
  function clearSession(){
    try { sessionStorage.removeItem(ADMIN_AUTH_CONFIG.sessionKey); } catch (e) {}
  }

  /* ---------- üzenet a belépő kártyán ---------- */
  function setMsg(text, isError){
    const el = els.msg;
    if (!el) return;
    if (!text){ el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
  }

  /* ---------- Google ID token ---------- */
  function decodeJwt(token){
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

  function loadGis(){
    return new Promise(function (resolve, reject) {
      if (window.google && window.google.accounts && window.google.accounts.id) return resolve();
      if (!ADMIN_AUTH_CONFIG.clientId) return reject(new Error('no-client-id'));
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('gis-load')); };
      document.head.appendChild(s);
    });
  }

  function setupGis(){
    const g = window.google;
    if (!g || !g.accounts || !g.accounts.id) throw new Error('gis-missing');

    g.accounts.id.initialize({
      client_id: ADMIN_AUTH_CONFIG.clientId,
      hd: ADMIN_AUTH_CONFIG.domain,
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: handleCredential
    });

    if (els.gsiHost){
      els.gsiHost.innerHTML = '';
      g.accounts.id.renderButton(els.gsiHost, {
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
    gisReady = true;
  }

  /* Egy Google ID token ellenőrzése. Nem az egész belépést végzi (a sessiont
     az grant() adja), csak a szabályokat: érvényes-e, megerősített-e a cím,
     és @keri.mako.hu-s-e a fiók. Külön exportálva, hogy tesztelhető legyen. */
  function validateToken(token){
    if (!token) return { ok: false, error: 'A Google nem adott vissza azonosítót. Próbáld újra.' };

    let payload;
    try { payload = decodeJwt(token); }
    catch (e) { return { ok: false, error: 'Érvénytelen Google-válasz.' }; }

    const domain = ADMIN_AUTH_CONFIG.domain;
    const email = String(payload.email || '').toLowerCase();

    if (!email) return { ok: false, error: 'A Google-fiók nem adott e-mail címet.' };
    if (payload.email_verified === false) return { ok: false, error: 'A Google-fiók e-mail címe nincs megerősítve.' };
    if (payload.exp && payload.exp * 1000 < Date.now()) return { ok: false, error: 'A Google-válasz lejárt. Próbáld újra.' };
    if (!email.endsWith('@' + domain)){
      return { ok: false, error: 'Csak @' + domain + ' címmel lehet belépni. Ez a fiók: ' + email };
    }
    if (payload.hd && String(payload.hd).toLowerCase() !== domain){
      return { ok: false, error: 'Ez a fiók nem a ' + domain + ' Workspace-hez tartozik.' };
    }
    return { ok: true, email: email, name: payload.name || '' };
  }

  function handleCredential(response){
    const result = validateToken(response && response.credential);
    if (!result.ok){ setMsg(result.error, true); return; }
    grant({ email: result.email, name: result.name, mode: 'google' });
  }

  /* ---------- belépés / kilépés ---------- */
  function grant(identity){
    const session = {
      email: identity.email,
      name: identity.name || '',
      mode: identity.mode,
      exp: Date.now() + ADMIN_AUTH_CONFIG.sessionHours * 3600e3
    };
    writeSession(session);
    setMsg('');
    unlock(session);
  }

  function applyIdentity(session){
    const label = session.name || session.email.split('@')[0];
    if (els.whoEmail) els.whoEmail.textContent = session.email;
    if (els.whoMode) els.whoMode.textContent = session.mode === 'demo'
      ? 'Demó belépés — nem hitelesített'
      : 'Google-fiók hitelesítve';
    if (els.idEmail) els.idEmail.textContent = session.email;
    if (els.idMode) els.idMode.textContent = session.mode === 'demo' ? 'Demó tanár' : 'Tanár';
    if (els.avatar) els.avatar.textContent = (label.charAt(0) || 'T').toUpperCase();
    if (els.modeNote){
      els.modeNote.innerHTML = session.mode === 'demo'
        ? '<i></i> Demó mód — helyi adatok'
        : '<i class="ok"></i> Google-fiók · helyi adatok';
    }
  }

  function unlock(session){
    applyIdentity(session);
    if (els.gate) els.gate.hidden = true;
    if (els.shell){
      els.shell.classList.remove('is-locked');
      els.shell.inert = false;
      els.shell.removeAttribute('aria-hidden');
    }
    if (typeof onAuth === 'function') onAuth(session);
  }

  function lock(){
    if (els.shell){
      els.shell.classList.add('is-locked');
      els.shell.inert = true;
      els.shell.setAttribute('aria-hidden', 'true');
    }
    if (els.gate) els.gate.hidden = false;
    const focusTarget = els.demoToggle || els.fallback;
    if (focusTarget) setTimeout(function () { focusTarget.focus(); }, 60);
  }

  function signOut(){
    clearSession();
    try {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        window.google.accounts.id.disableAutoSelect();
      }
    } catch (e) {}
    lock();
  }

  /* ---------- demó mód ---------- */
  function setDemo(on){
    if (els.demoToggle) els.demoToggle.checked = !!on;
    if (els.demoBtn) els.demoBtn.disabled = !on;
    try { localStorage.setItem(ADMIN_AUTH_CONFIG.demoKey, on ? '1' : '0'); } catch (e) {}
  }

  function demoPreferred(){
    try { return localStorage.getItem(ADMIN_AUTH_CONFIG.demoKey) === '1'; } catch (e) { return false; }
  }

  function bind(){
    if (els.demoToggle){
      els.demoToggle.addEventListener('change', function (e) {
        setDemo(e.target.checked);
        if (!e.target.checked) setMsg('');
      });
    }
    if (els.demoBtn){
      els.demoBtn.addEventListener('click', function () {
        if (!ADMIN_AUTH_CONFIG.demoAllowed || !els.demoToggle.checked) return;
        grant({ email: 'demo.tanar@keri.mako.hu', name: 'Demó tanár', mode: 'demo' });
      });
    }
    if (els.fallback){
      els.fallback.addEventListener('click', function () {
        if (!ADMIN_AUTH_CONFIG.clientId){
          setMsg('A Google belépés még nincs beállítva: hiányzik az OAuth kliens-azonosító (assets/js/admin-auth.js → clientId).', true);
          return;
        }
        loadGis().then(function () { setupGis(); setMsg(''); })
          .catch(function () { setMsg('A Google belépés nem tölthető be. Ellenőrizd a hálózatot.', true); });
      });
    }
    if (els.signOut) els.signOut.addEventListener('click', signOut);
  }

  function init(options){
    onAuth = options && options.onAuth;

    els = {
      gate: byId('authGate'),
      shell: byId('admShell'),
      msg: byId('authMsg'),
      gsiHost: byId('gsiHost'),
      fallback: byId('googleFallback'),
      demoToggle: byId('demoToggle'),
      demoBtn: byId('demoLogin'),
      signOut: byId('admSignOut'),
      whoEmail: byId('admWhoEmail'),
      whoMode: byId('admWhoMode'),
      idEmail: byId('admIdEmail'),
      idMode: byId('admIdMode'),
      avatar: byId('admIdAvatar'),
      modeNote: byId('admModeNote')
    };

    bind();
    setDemo(ADMIN_AUTH_CONFIG.demoAllowed && demoPreferred());

    if (!ADMIN_AUTH_CONFIG.demoAllowed && els.demoToggle){
      els.demoToggle.disabled = true;
    }

    const session = readSession();
    if (session) unlock(session);
    else lock();

    if (ADMIN_AUTH_CONFIG.clientId){
      loadGis().then(setupGis).catch(function () {
        setMsg('A Google belépés nem tölthető be (hálózat vagy blokkolt script). A demó mód használható.', true);
      });
    } else if (els.gsiHost){
      els.gsiHost.innerHTML =
        '<p class="ag-hint">A Google belépés nincs beállítva — az OAuth kliens-azonosító hiányzik.</p>';
    }
  }

  return {
    init: init,
    signOut: signOut,
    session: readSession,
    validateToken: validateToken,
    isDemoAllowed: function () { return !!ADMIN_AUTH_CONFIG.demoAllowed; }
  };
})();
