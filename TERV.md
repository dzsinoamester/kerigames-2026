# KERIGAMES — fejlesztési terv

Állapot: **döntések rögzítve** (2026. november). Ez a dokumentum a fejlesztés alapja; a kód ez után készül.

## 0. Rögzített döntések

| Kérdés | Döntés |
|---|---|
| Hány játék | **Az összes játék fel van sorolva** a katalógusban, státusszal (élő / hamarosan / szavazás alatt). Nem kell előre kitalálni, melyik lesz verseny — a lista bővíthető sor hozzáadásával. |
| Belépés | **Google Workspace SSO**, csak `@keri.mako.hu` címek. |
| Ki viszi fel az eredményt | **Tanár**, külön **admin oldalon** (`admin.html`). |
| Backend | **Google Sheets**, 0 Ft. A Sheet az adatbázis, az oldal onnan olvas. |

Ebből következik a két legfontosabb elv:

1. **Egy adatmodell, minden játékra** — a komponensek nem játék-specifikusak, a különbség konfiguráció (csapatméret, forma, pontozás, pályák).
2. **Senki nem nyúl a HTML-hez tartalomért** — a tanár a Sheetben ír, az oldal automatikusan követi.

---

## 1. Játék-katalógus (teljes kezdőlista)

A `teamSize` a csapat létszáma, a `format` az alapértelmezett meccsforma. A `state` adja, mit mutat a kártya.

| slug | Játék | fő | forma | állapot |
|---|---|---|---|---|
| `cs2` | Counter-Strike 2 | 5 | BO1 (MR12) | **élő** |
| `fc26` | EA SPORTS FC | 1 | 2×6 perc | **élő** |
| `rl` | Rocket League | 3 | BO3 | hamarosan |
| `valorant` | VALORANT | 5 | BO1 | hamarosan |
| `lol` | League of Legends | 5 | BO1 | hamarosan |
| `minecraft` | Minecraft (Bedwars / PvP) | 4 | BO3 | hamarosan |
| `fortnite` | Fortnite (Duo) | 2 | pontverseny | hamarosan |
| `brawlstars` | Brawl Stars | 3 | BO3 | hamarosan |
| `clashroyale` | Clash Royale | 1 | BO3 | hamarosan |
| `roblox` | Roblox | 1–4 | játékonként | hamarosan |
| `osu` | osu! | 1 | BO3 | hamarosan |
| `trackmania` | Trackmania | 1 | időfutam | hamarosan |
| `tekken` | Tekken / Street Fighter | 1 | BO3 | hamarosan |
| `chess` | Sakk (chess.com) | 1 | BO1 | hamarosan |
| `fallguys` | Fall Guys | 1 | pontverseny | szavazás |
| `amongus` | Among Us | 4–10 | pontverseny | szavazás |

A `state` három értéke: `live` (nevezés/verseny megy), `soon` (kártya „Hamarosan" jelvénnyel, kattintásra infó), `vote` (szavazás alatt — diákok szavazhatnak, melyik induljon). A szavazás a Google Sheet egyik munkalapja, nem kell hozzá új rendszer.

**Miért fontos:** a teljes lista egyszerre látszik, tehát a diák látja, mi lesz később, és nem kell újraírnunk az oldalt, amikor egy játék indul — csak a státuszát váltjuk át.

---

## 2. Adatmodell (a Sheet munkalapjai)

Egy Google Sheet, munkalaponként egy tábla. A fejlécsor neve fix, a tanár alá ír.

**`Games`** — `slug, name, short, teamSize, format, state, accentColor, icon, winPoints, lossPoints, noShowPenalty, mapPool, sortOrder`

**`Competitions`** — `id, gameSlug, season, label, state` (pl. `cs2-2026-27`)
Egy játékhoz több verseny is tartozhat (iskolai, iskolák közötti), ezért nem a játékban van a szezon.

**`Teams`** — `id, competitionId, name, captainEmail, players, substitutes, teacher, class, status, createdAt`
- `status`: `pending` (tanári jóváhagyásra vár) / `approved` / `rejected`
- `players`: pontosvesszővel elválasztott nevek (vessző a becenévben gyakori, ezért nem vessző)

**`Matches`** — `id, competitionId, round, stage, teamA, teamB, scheduledAt, room, bestOf, scoreA, scoreB, maps, status, reportedBy, confirmedAt`
- `stage`: `group` / `playoff` / `final`
- `status`: `scheduled` / `live` / `done` / `no-show` / `disputed`

**`Events`** — `id, competitionId, date, time, title, type, note` (`type`: deadline / match / final / custom)
A tanév szünetlistája továbbra is kódból jön (`SCHOOL_YEARS`), mert az ritkán változik; az ütemező ezt használja.

**`News`** — `id, season, gameSlug, date, tag, title, link`

**`Votes`** — `id, email, gameSlug, date` (játék-szavazás, e-mailre egy szavazat)

**`Log`** — `timestamp, email, action, target, detail` — minden admin művelet naplózva (ki írt be eredményt, mikor). Ez iskolai vitánál aranyat ér.

### Származtatott adat
A **tabella nem kézzel írt**: a `Matches`-ből számoljuk (GY, V, pont, egymás elleni eredmény, pontkülönbség). Így nem lehet elrontani, és a tanárnak egy dolga van: eredményt beírni.

---

## 3. URL séma és navigáció

Most: `#tabella`. Több játéknál a link nem mondja meg, melyik játékról szól.

- Új séma: `/cs2/tabella`, `/fc26/mérkőzések` → inkább ASCII: `/cs2/tabella`, `/fc26/merkozesek`
- History API, a régi `#...` hivatkozások automatikus átirányítása (kifüggesztett linkek ne törjenek).
- Globális menü marad: Kezdőlap · Játékok · Naptár · Csapatok · GYIK.
- Játék kiválasztása után **vékony sticky al-navigáció**: Áttekintés · Szabályok · Tabella · Mérkőzések · Csapatok.
- A fejléc kap egy **játékváltót** (pill + legördülő, csak az `live`/`soon` játékokkal).
- Játékonkénti akcentszín: egy `--accent` token cseréje, a design nyelv nem változik.

---

## 4. Account — Google SSO, csak @keri.mako.hu

- **Google Identity Services** (client-side), a bejelentkezés gomb a fejlécben és a nevezésnél.
- Domain-korlát: a GIS `hd: 'keri.mako.hu'` beállítása + **a szerveroldali ellenőrzés** (lásd 5. pont). A kliensoldali korlát önmagában nem biztonsági intézkedés, csak kényelmi.
- A tanár ugyanazzal a Google-fiókjával lép be; a **tanári jogosultság nem a bejelentkezésből, hanem egy listából** jön (`Admins` munkalap vagy Script Property: engedélyezett e-mail címek). Így nem kell szerepkör-kezelő rendszert építeni.
- Szerepek: **vendég** (minden nyilvános látszik), **diák** (profil, csatlakozás csapathoz, szavazás, check-in), **kapitány** (nevezés, csere, eredmény megerősítés), **tanár/admin** (admin oldal).
- Kijelentkezés, session a böngészőben (Google ID token, rövid élettartam), semmi érzékeny adat a localStorage-ban.

**Adatvédelem:** a kapitány e-mail címe **ne jelenjen meg nyilvánosan** (most megjelenik a Csapatok oldalon). Helyette „kapcsolat a szervezővel" link, a cím csak bejelentkezve, tanárnak látszik. A játékosoknál csak név/becenév + osztály szerepel, semmi más személyes adat.

---

## 5. Google Sheets mint backend

Két külön csatorna, mert más-más a követelmény:

**Olvasás (nyilvános adat) — Google Sheets `gviz` JSON**
`https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:json&sheet=Matches`
- Nincs Apps Script kvóta, CORS-barát, néhány másodperces késleltetés.
- A site induláskor letölti a szükséges munkalapokat, `sessionStorage`-ba cache-eli 2–3 percre, és **fallback láncot** használ: gviz → legutóbbi jó válasz → a repóban lévő `data.js` pillanatkép. Ha a Sheet elérhetetlen, az oldal nem hal meg, csak régebbi adatot mutat.
- Élő meccs pontszámhoz (ha kell) 30–60 mp-es frissítés, csak a `Matches` lapra.

**Írás (eredmény, jóváhagyás) — Apps Script Web App**
- `doPost` végpont, `Execute as: me`, `Who has access: anyone`.
- **A védelem nem egy URL-ben lévő titok** (az a kliensben látszana), hanem a **Google ID token ellenőrzése** a scriptben (`tokeninfo` endpoint): érvényes-e, lejárt-e, és az `email` benne van-e az engedélyezett tanárok listájában. Csak ez után ír a Sheetbe.
- Műveletek: `reportResult`, `approveTeam`, `rejectTeam`, `setGameState`, `addNews`, `addEvent`, `substitution`.
- Minden művelet a `Log` lapra is bekerül.
- Korlátok, amikkel tervezni kell: Apps Script napi kvóta (bőven elég egy iskolának), 6 perces futáslimit (nem gond), és hogy a Sheet „osztott" szerkesztése emberi hibákra ad lehetőséget → ezért a `Log` és a `Matches` soronkénti `reportedBy` mező.

**Miért nem közvetlenül a Sheetbe írunk a böngészőből:** ahhoz a Sheetnek publikusan írhatónak kellene lennie, és bárki átírhatná az eredményeket. Az Apps Script + token-ellenőrzés az, ami ezt megakadályozza.

---

## 6. Admin oldal (`admin.html`)

Külön oldal, ugyanaz a design, de sűrű, munkára optimalizált felület. Csak bejelentkezett, engedélyezett tanárnak.

1. **Eredmény beírása** — a mai/aktuális meccsek listája, pontszám + pálya + „mentés". Egy kattintás, mobilon is működik a teremben.
2. **Nevezések jóváhagyása** — `pending` csapatok, játékoslista ellenőrzése (5 fő, duplikált név, tiltólista), jóváhagyás/elutasítás, indoklással.
3. **Meccsek ütemezése** — időpont, terem; figyelmeztetés, ha szünetre/ünnepnapra esik (a `SCHOOL_YEARS`-ből).
4. **Játékok állapota** — `live` / `soon` / `vote` váltás, új játék felvétele.
5. **Hírek, események** — a kezdőlap karusszel és a naptár tartalma.
6. **Napló** — ki mit írt be, mikor (visszakereshető).
7. **Export** — tabella/meccslista nyomtatható nézetben és CSV-ben.

A tanárnak **nem kell a Sheetet nyitnia** a napi munkához; a Sheet az adat, az admin a felület. Ez a lényeg: a Sheet „adatbázis", nem „kezelőfelület".

---

## 7. UI modernizálás (rangsorolva)

1. **Játékváltó + játék-kártyák** a kezdőlapon (státuszjelvénnyel) — ez adja az egész többjátékos élményt.
2. **Bracket nézet** (SVG csoportkör + kiesés, mobilon kártyásan) — most teljesen hiányzik.
3. **Számolt tabella** rendezhető oszlopokkal, forma-pöttyökkel, saját csapat kiemelésével, sticky fejléccel.
4. **Meccs-részletek drawer** jobbról: pályák, pontszám, játékos-statok, VOD link.
5. **Élő ticker**: a mostani felső sáv három állapota — nincs meccs / következő / **ÉLŐ** pulzálással.
6. **Skeleton loading** a „Betöltés…" szövegek helyett.
7. **Profil oldal**: stat-kártyák, radar, jelvények, megosztható kártya.
8. **Nevezés stepperben** (csapat → játékosok → ellenőrzés), most egy hosszú űrlap.
9. **Parancspaletta** (Ctrl/⌘+K): oldalak, játékok, csapatok.
10. **Kiosk / OBS nézet**: a 304-es terem falára és streamekhez, külön URL-en, ugyanabból az adatból.
11. **PWA + ICS naptár-export**, később push értesítés.
12. **A11y**: fókuszcsapda menüben/drawerben, `aria-live` a pontszámokra, teljes `prefers-reduced-motion`.

---

## 8. Hasznos funkciók (a tanár munkáját csökkentik)

- **Ütemező a tanév naptárából**: a fordulók ne essenek szünetre/ünnepnapra, és a 304-es terem kapacitásához (egyszerre 1 meccs) illeszkedjenek.
- **Körformátum generátor** (round robin, csoport + kiesés) létszámból, tie-breakekkel.
- **Kétfaktoros eredmény**: a kapitány megerősíti a tanár által beírt pontszámot; eltérésnél `disputed` státusz.
- **Check-in QR** a terem ajtaján: a diák telefonjáról jelez, a tanár listát kap — kiváltja a papíros jelenlét-ívet.
- **Csapatkereső**: „hiányzik 1 játékos" hirdetések.
- **Örökranglista / Hall of Fame** a régi szezonokból (az adat már megvan).
- **MVP / All-star szavazás** a döntő után.
- **Discord webhook**: meccsbeosztás és eredmény a diákszerverre.
- **Tiltólista adminból** (most fix lista a kódban) + becenév-normalizálás.

---

## 9. Fázisok

| Fázis | Tartalom | Becslés |
|---|---|---|
| **F0** | játék-katalógus (teljes lista), URL séma, játékváltó, per-játék színek, játék-kártyák — adat még `data.js`-ből | 1–2 nap |
| **F1** | számolt tabella, bracket, meccs-drawer, skeleton, üres állapotok; adatolvasás Sheet `gviz`-ből fallback lánccal | 2–4 nap |
| **F2** | Google SSO (@keri.mako.hu), Apps Script írási végpont, nevezés/jóváhagyás, eredménybeírás, `admin.html` | 1–2 hét |
| **F3** | profilok, statok, check-in QR, értesítés/Discord, PWA, kiosk/OBS, örökranglista | 1 hét |
| **F4** | további játékok élesítése, összesített „iskolai bajnokság" pontverseny | 3–5 nap |

Az F0–F1 backend nélkül is teljesen működik (a `data.js` a tartalék), a F2-nél egyszeri adatmigráció lesz: a meglévő `SEASON_DATA` csapatok és a `localStorage`-os nevezések átemelése a Sheetbe.

---

## 10. Kockázatok

- **A Sheet kézi szerkesztése** elrontja a fejlécet vagy egy oszlopot → az oldal védett parsolással dolgozik, hibás sor kimarad, és az admin oldal figyelmeztet.
- **Apps Script kvóta** nagy terhelésnél → az olvasás nem Apps Scripten megy, így ez csak az írásra vonatkozik (napi néhány tucat művelet).
- **Google Workspace**: ha a diákok címe mégsem `@keri.mako.hu`, a `hd` szűrő kizárja őket → ezt az első élesítésnél tesztelni kell egy diákfiókkal.
- **Régi linkek**: a hash-útvonalak átirányítása nélkül a kifüggesztett QR-ek/linkek elhalnak → kötelező lépés az F0-ban.
