/* =========================================================
   KERIGAMES — Google belépés beállítása (egy helyen)
   Az admin és a diák belépés is ezt használja.
   ========================================================= */
'use strict';

window.KERI_AUTH = {
  /* Ide kerül a Google OAuth kliens-azonosító, amikor elkészül:
     '1234567890-abcdefg.apps.googleusercontent.com'
     Üresen a Google-gomb jelzi, hogy nincs beállítva, és a demó mód marad. */
  clientId: '',
  domain: 'keri.mako.hu',
  demoAllowed: true,
  sessionDays: 7
};
