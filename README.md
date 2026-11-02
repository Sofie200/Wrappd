# Wrappd

En webbapp för att hålla koll på önskelistor och gåvor i familjen, bland vänner eller på jobbet. Man skapar grupper, gör listor till någon i gruppen inför ett kalas eller event, och de andra kan reservera önskningar – utan att mottagaren ser vad som är reserverat.

**Teknik:** React (Vite) · Node.js/Express · PostgreSQL (Neon) · JWT · Vercel Blob · Vercel

## Funktioner

**Konto**
- Registrering med namn, unikt användarnamn och lösenord. Inloggning med användarnamn och lösenord.
- Inloggningen sparas i webbläsaren (localStorage) i ett år.

**Användare skapade av en admin**
- En gruppadmin kan skapa ett konto (namn och användarnamn) åt någon. Personen läggs till i gruppen direkt.
- Admin får en länk att skicka till personen, som där väljer sitt lösenord och loggas in.
- Innan lösenordet är valt visas personen som "Ej aktiverad", men kan ändå läggas till i grupper och väljas som mottagare eller admin på listor.
- Länken fungerar en gång och gäller i 7 dagar. En gruppadmin kan ta fram en ny länk ("Ny länk"); då slutar den gamla att fungera.
- **Glömt lösenord:** en gruppadmin kan ta fram en länk där en medlem väljer ett nytt lösenord ("Återställ lösenord"). Det gamla lösenordet fungerar tills länken används.
- Bara en hash av länkens kod sparas i databasen.

**Barn** (sidan *Mina barn*)
- Alla kan lägga till ett barn till sig själv, med en medförälder (vilken användare som helst, via användarnamn – behöver inte vara aktiverad eller med i någon grupp). Ett barn har 1–2 föräldrar.
- Barn har inget användarnamn eller lösenord och kan aldrig logga in. De kan bara vara mottagare av listor.
- Ett barn är alltid med i minst en grupp. Föräldrarna lägger till barnet i grupper de själva är med i – gruppadmins kan inte lägga till eller ta bort barn.
- Bara föräldrar kan göra listor till sina barn, och bara föräldrar kan vara admins för dem.
- Bara föräldrar kan ändra barnet (namn, grupper, föräldrar). En förälder kan byta eller ta bort medföräldern, eller sig själv, så länge en förälder finns kvar.
- När ett barn raderas raderas också listor där barnet är enda mottagare – även med reserverade gåvor, som då försvinner från inköpen. På listor med fler mottagare tas barnet bara bort som mottagare.

**Grupper**
- Den som skapar en grupp blir admin. En grupp kan ha flera admins.
- Admins lägger till medlemmar genom att söka på namn eller användarnamn – ingen inbjudan behöver accepteras.
- Admins kan göra andra till admins, ta bort admins och ta bort medlemmar.
- Medlemmar kan lämna gruppen, utom den sista admin. Grupper kan inte raderas.

**Listor**
- Den som skapar en lista blir admin och väljer grupp(er), mottagare och fler admins bland gruppernas medlemmar.
- Slutdatum (eventets dag) är obligatoriskt. Dagen efter arkiveras listan: den syns fortfarande men är låst.
- Listan är privat tills en admin publicerar den. Då ser medlemmarna i listans grupper den. En publik lista kan få fler grupper men aldrig bli privat igen.
- Mottagarna kan inte öppna listan. Är en mottagare själv admin ser hen listan men aldrig vad som är reserverat.
- En lista kan bara raderas om ingenting på den är reserverat.

**Önskningar och gåvor**
- En önskning har titel (obligatorisk), beskrivning, pris, länk, bild och önskat antal.
- När någon reserverar en önskning skapas en **gåva** (`gift` i kod och databas). Den får en kopia av titeln och priset (önskningens pris × antal). Priset är gåvans totalpris och kan sedan ändras, och man kan skriva en kommentar.
- En gåva kan delas med andra vuxna i listans grupper – aldrig med mottagarna. Kostnaden delas lika eller med egna belopp i kronor som måste bli exakt priset.
- Alla som delar på en gåva har samma rättigheter: de ser den bland sina inköp och kan ändra den. En person kan bara vara med i en gåva per önskning.
- Andra ser bara "Reserverad av Anna och Erik", inte pris, fördelning eller vem som reserverade först.
- Antal kan ändras och gåvan ångras tills listan arkiveras. Pris, kommentar och fördelning (även vilka som delar) går att ändra även efteråt.
- En önskning kan inte ändras eller raderas när den har reserverats.

**Översikt**
- Kommande event i mina grupper, även listor till mig.
- Mina inköp (gåvor), aktuella och historiska, med totalpris och min del – och summan av mina delar.
- Listor jag administrerar.

## Struktur

```
wrappd/
├── api/                    Backend (Express) – körs som en Vercel-funktion
│   ├── index.js            Appen: routes, CORS, felhantering
│   ├── _db/pool.js         Anslutning till PostgreSQL, transaktioner
│   ├── _lib/access.js      Alla behörighetsregler för listor
│   ├── _lib/http.js        Fel, validering, dagens datum
│   ├── _lib/wishSchema.js  Validering av önskningar
│   ├── _middleware/        Inloggning (JWT) och bilduppladdning
│   ├── _integrations/      Vercel Blob (bilder)
│   └── _routes/            auth, users, groups, lists, wishes, profile
├── db/schema.sql           Skapar alla tabeller
├── frontend/               React (Vite)
│   └── src/
│       ├── config.js       Appens namn och API-adress
│       ├── api.js          Alla anrop till backend
│       ├── pages/          Sidor
│       └── components/     Komponenter
├── .env.example
└── vercel.json
```

Filer och mappar i `api/` som börjar med `_` blir inte egna Vercel-funktioner – bara `api/index.js` gör det.

## Kom igång lokalt

Kräver Node.js 20 eller senare.

### 1. Databasen (Neon)
1. Skapa ett projekt på [neon.com](https://neon.com).
2. Öppna **SQL Editor** och kör hela `db/schema.sql`.
3. Vill du ha testdata: kör `db/seed.sql` direkt efteråt (7 användare med lösenordet `test1234` och ett barn).
4. Kopiera anslutningssträngen under **Connect**.

**Uppdatera en befintlig databas:** filerna i `db/migrations/` körs en gång var, i nummerordning, i en databas som skapades med ett äldre `schema.sql`.

### 2. Bildlagring (Vercel Blob)
1. I Vercel: **Storage → Create → Blob**.
2. Kopiera `BLOB_READ_WRITE_TOKEN` från storens **.env.local**-flik.

### 3. Backend
```bash
cp .env.example .env     # fyll i DATABASE_URL, JWT_SECRET och BLOB_READ_WRITE_TOKEN
npm install
npm run dev              # http://localhost:3000/api
```

Kör inte `vercel dev` – den sätter `VERCEL=1` och startar inte servern lokalt. Använd `npm run dev`.

### 4. Frontend
```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
```

`frontend/.env.development` pekar redan på den lokala backenden.

## Deploy på Vercel

Projektet deployas som **två Vercel-projekt** från samma repo.

**Backend**
- Root Directory: `.` (roten)
- Environment Variables: `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL` (frontendens adress, t.ex. `https://wrappd.vercel.app`)
- Koppla Blob-storen till projektet (**Storage → Connect**), så sätts `BLOB_READ_WRITE_TOKEN` automatiskt.

**Frontend**
- Root Directory: `frontend`
- Framework: Vite
- Environment Variables: `VITE_API_URL` (backendens adress + `/api`), `VITE_APP_NAME`

Deploya om efter att du ändrat miljövariabler – Vite bakar in `VITE_`-variablerna när projektet byggs.

## Byta namn på appen

Namnet står på ett enda ställe: miljövariabeln `VITE_APP_NAME`. Ändra den i `frontend/.env.development` (lokalt) och i frontendprojektets miljövariabler i Vercel. Standardnamnet finns i `frontend/src/config.js`, och `<title>` i `frontend/index.html` är bara en reserv innan appen har laddat.

## API

Alla routes utom `/api/auth/register`, `/api/auth/login`, `/api/auth/link/:token` och `/api/health` kräver `Authorization: Bearer <token>`.

| Metod | Adress | Beskrivning |
|---|---|---|
| POST | `/api/auth/register` | Skapa konto → `{ token, user }` |
| POST | `/api/auth/login` | Logga in → `{ token, user }` |
| GET | `/api/auth/me` | Inloggad användare |
| GET | `/api/auth/link/:token` | Vem en länk gäller → `{ purpose, name, username }` |
| POST | `/api/auth/link/:token` | Välj lösenord via länk och logga in → `{ token, user }` |
| GET | `/api/users/search?q=&excludeGroupId=` | Sök användare på namn eller användarnamn |
| GET | `/api/groups` | Mina grupper |
| POST | `/api/groups` | Skapa grupp |
| GET | `/api/groups/members?ids=1,2` | Medlemmar i flera grupper (för att välja mottagare/admins) |
| GET | `/api/groups/:id` | Grupp, medlemmar och listor |
| POST | `/api/groups/:id/users` | Skapa användare i gruppen → `{ user, link }` (admin) |
| POST | `/api/groups/:id/members/:userId/link` | Ny aktiverings- eller återställningslänk (admin) |
| PATCH | `/api/groups/:id` | Byt namn (admin) |
| POST | `/api/groups/:id/members` | Lägg till medlem (admin) |
| PATCH | `/api/groups/:id/members/:userId` | Gör till / ta bort som admin (admin) |
| DELETE | `/api/groups/:id/members/:userId` | Ta bort medlem (admin) eller lämna gruppen (själv) |
| GET | `/api/children` | Mina barn, med vad som raderas om barnet raderas |
| POST | `/api/children` | Lägg till barn `{ name, groupIds, coParentUsername? }` |
| PUT | `/api/children/:id` | Ändra barn `{ name, groupIds, parentUsernames }` (förälder) |
| DELETE | `/api/children/:id` | Radera barn och listor där det är enda mottagare (förälder) |
| POST | `/api/lists` | Skapa lista |
| GET | `/api/lists/:id` | Lista med önskningar (gåvorna döljs för mottagare) |
| PUT | `/api/lists/:id` | Ändra lista (admin) |
| POST | `/api/lists/:id/publish` | Publicera (admin) |
| DELETE | `/api/lists/:id` | Radera, om inget är reserverat (admin) |
| POST | `/api/lists/:id/wishes` | Lägg till önskning, multipart med bild (admin) |
| PATCH | `/api/wishes/:id` | Ändra önskning, multipart, om den inte är reserverad (admin) |
| DELETE | `/api/wishes/:id` | Radera önskning, om den inte är reserverad (admin) |
| POST | `/api/wishes/:id/gifts` | Reservera: skapa en gåva `{ quantity }` → `{ id }` |
| GET | `/api/gifts/:id` | Gåvan, önskningen, de som delar och vilka som kan läggas till (de som delar) |
| PUT | `/api/gifts/:id` | Ändra `{ quantity, price, comment, split, members: [{ userId, amount }] }` (de som delar) |
| DELETE | `/api/gifts/:id` | Ångra reservationen, före datumet (de som delar) |
| GET | `/api/profile` | Kommande event, mina gåvor, listor jag administrerar |

## Säkerhet och felhantering

- Lösenord hashas med bcrypt. Inloggningsfelet är detsamma oavsett om användarnamnet finns eller inte.
- All indata valideras med Zod på servern. Felmeddelanden är på svenska.
- Listor och grupper som man inte har åtkomst till ger 404, så att man inte kan gissa sig till vilka som finns.
- Behörighetsreglerna för listor finns samlade i `api/_lib/access.js`.
- Reservationer (nya gåvor) görs i en transaktion med radlås, så två personer kan inte reservera det sista exemplaret samtidigt.
- Bilder kontrolleras både på filtyp och på filens innehåll (JPG/PNG), max 4 MB.
- Databasanrop har timeout (10 s), bilduppladdning 15 s, och frontendens anrop 15–30 s.

## Att känna till

- **Mottagare som är admins** kan i vissa lägen ana att något är reserverat: en reserverad önskning kan varken ändras eller raderas. Felmeddelandet för mottagare är därför medvetet vagt.
- **Tas någon bort ur en grupp** ligger hen kvar som mottagare eller admin på listor där hen redan var det.
- **En gruppadmin kan återställa lösenordet** för alla medlemmar i sin grupp – och därmed i praktiken ta över deras konton. Ge bara admin till personer du litar på.
- **Inloggningar på andra enheter** loggas inte ut när lösenordet återställs; de fortsätter gälla tills token går ut.
