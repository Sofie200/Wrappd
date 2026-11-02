# Wrappd

En webbapp för att hålla koll på önskelistor och gåvor i familjen, bland vänner eller på jobbet. Man skapar grupper, gör listor till någon i gruppen inför ett kalas eller event, och de andra kan reservera önskningar – utan att mottagaren ser vad som är reserverat.

**Teknik:** React (Vite) · Node.js/Express · PostgreSQL (Neon) · JWT · Vercel Blob · Vercel

## Funktioner

**Konto**
- Registrering med namn, unikt användarnamn och lösenord. Inloggning med användarnamn och lösenord.
- Inloggningen sparas i webbläsaren (localStorage) i ett år.

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

**Önskningar och reservationer**
- En önskning har titel (obligatorisk), beskrivning, pris, länk, bild och önskat antal.
- Alla som ser listan – utom mottagarna – kan reservera och väljer hur många exemplar de tar. Man ser vem som reserverat vad.
- En reservation kan ändras eller ångras tills listan arkiveras. En önskning kan bara raderas om den inte är reserverad.

**Översikt**
- Kommande event i mina grupper, även listor till mig.
- Mina reservationer, aktuella och historiska, med pris.
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
3. Kopiera anslutningssträngen under **Connect**.

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

Alla routes utom `/api/auth/register`, `/api/auth/login` och `/api/health` kräver `Authorization: Bearer <token>`.

| Metod | Adress | Beskrivning |
|---|---|---|
| POST | `/api/auth/register` | Skapa konto → `{ token, user }` |
| POST | `/api/auth/login` | Logga in → `{ token, user }` |
| GET | `/api/auth/me` | Inloggad användare |
| GET | `/api/users/search?q=&excludeGroupId=` | Sök användare på namn eller användarnamn |
| GET | `/api/groups` | Mina grupper |
| POST | `/api/groups` | Skapa grupp |
| GET | `/api/groups/members?ids=1,2` | Medlemmar i flera grupper (för att välja mottagare/admins) |
| GET | `/api/groups/:id` | Grupp, medlemmar och listor |
| PATCH | `/api/groups/:id` | Byt namn (admin) |
| POST | `/api/groups/:id/members` | Lägg till medlem (admin) |
| PATCH | `/api/groups/:id/members/:userId` | Gör till / ta bort som admin (admin) |
| DELETE | `/api/groups/:id/members/:userId` | Ta bort medlem (admin) eller lämna gruppen (själv) |
| POST | `/api/lists` | Skapa lista |
| GET | `/api/lists/:id` | Lista med önskningar (reservationer döljs för mottagare) |
| PUT | `/api/lists/:id` | Ändra lista (admin) |
| POST | `/api/lists/:id/publish` | Publicera (admin) |
| DELETE | `/api/lists/:id` | Radera, om inget är reserverat (admin) |
| POST | `/api/lists/:id/wishes` | Lägg till önskning, multipart med bild (admin) |
| PATCH | `/api/wishes/:id` | Ändra önskning, multipart (admin) |
| DELETE | `/api/wishes/:id` | Radera önskning, om den inte är reserverad (admin) |
| PUT | `/api/wishes/:id/reservation` | Reservera / ändra antal `{ quantity }` |
| DELETE | `/api/wishes/:id/reservation` | Ångra min reservation |
| GET | `/api/profile` | Kommande event, mina reservationer, listor jag administrerar |

## Säkerhet och felhantering

- Lösenord hashas med bcrypt. Inloggningsfelet är detsamma oavsett om användarnamnet finns eller inte.
- All indata valideras med Zod på servern. Felmeddelanden är på svenska.
- Listor och grupper som man inte har åtkomst till ger 404, så att man inte kan gissa sig till vilka som finns.
- Behörighetsreglerna för listor finns samlade i `api/_lib/access.js`.
- Reservationer görs i en transaktion med radlås, så två personer kan inte reservera det sista exemplaret samtidigt.
- Bilder kontrolleras både på filtyp och på filens innehåll (JPG/PNG), max 4 MB.
- Databasanrop har timeout (10 s), bilduppladdning 15 s, och frontendens anrop 15–30 s.

## Att känna till

- **Mottagare som är admins** kan i vissa lägen ana att något är reserverat: en reserverad önskning kan inte raderas, och antalet kan inte sänkas under det som är reserverat. Felmeddelandet för mottagare är därför medvetet vagt.
- **Tas någon bort ur en grupp** ligger hen kvar som mottagare eller admin på listor där hen redan var det.
- **Glömt lösenord** finns inte i den här versionen.
