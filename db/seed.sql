-- Testdata för Wrappd
-- Kör EFTER schema.sql, i en tom databas. Alla användare har lösenordet: test1234
--
-- Användare        Användarnamn   Grupper
-- Anna Andersson   anna           Familjen (admin), Vännerna
-- Erik Berg        erik           Familjen (admin), Jobbet
-- Maja Berg        (barn)         Familjen – föräldrar: Anna och Erik. Kan inte logga in.
-- Oskar Berg       oskar          Familjen
-- Elsa Andersson   elsa           Familjen
-- Sara Ek          sara           Vännerna (admin), Jobbet
-- Johan Holm       johan          Jobbet (admin), Vännerna
-- Lukas Nilsson    lukas          Vännerna
--
-- Listor
-- Majas 7-årskalas    Till Maja    Familjen   Publik    Om 14 dagar   Admins: Anna, Erik
-- Annas 40-årsdag     Till Anna    Vännerna   Publik    Om 30 dagar   Admins: Sara, Johan   (Anna ser den bara i översikten)
-- Oskars julklappar   Till Oskar   Familjen   Privat    Om 50 dagar   Admin: Elsa           (bara Elsa ser den)
-- Lukas önskelista    Till Lukas   Vännerna   Publik    Om 60 dagar   Admin: Lukas          (Lukas ser inte gåvorna)
-- Eriks födelsedag    Till Erik    Jobbet     Publik    För 20 dagar sedan – arkiverad, med gåvor i Saras och Johans historik

-- bcrypt-hashar direkt i databasen – samma format som bcryptjs i backend läser
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hjälpfunktioner för att slå upp id:n på namn. Tas bort längst ned.
-- Användarnamn, eller namn för barn (som saknar användarnamn)
CREATE FUNCTION seed_user(text) RETURNS int AS $$ SELECT id FROM users WHERE username = $1 OR (is_child AND name = $1) $$ LANGUAGE sql;
CREATE FUNCTION seed_group(text) RETURNS int AS $$ SELECT id FROM groups WHERE name = $1 $$ LANGUAGE sql;
CREATE FUNCTION seed_list(text) RETURNS int AS $$ SELECT id FROM lists WHERE title = $1 $$ LANGUAGE sql;
CREATE FUNCTION seed_wish(text, text) RETURNS int AS $$
    SELECT w.id FROM wishes w JOIN lists l ON l.id = w.list_id WHERE l.title = $1 AND w.title = $2
$$ LANGUAGE sql;

-- ---------- Användare ----------
INSERT INTO users (name, username, password_hash)
SELECT name, username, crypt('test1234', gen_salt('bf', 10))
FROM (VALUES
    ('Anna Andersson', 'anna'),
    ('Erik Berg', 'erik'),
    ('Oskar Berg', 'oskar'),
    ('Elsa Andersson', 'elsa'),
    ('Sara Ek', 'sara'),
    ('Johan Holm', 'johan'),
    ('Lukas Nilsson', 'lukas')
) AS u(name, username);

-- Maja är ett barn: inget användarnamn, inget lösenord, två föräldrar
INSERT INTO users (name, is_child, created_by) VALUES ('Maja Berg', true, seed_user('anna'));
INSERT INTO child_parents (child_id, parent_id) VALUES
    (seed_user('Maja Berg'), seed_user('anna')),
    (seed_user('Maja Berg'), seed_user('erik'));

-- ---------- Grupper ----------
INSERT INTO groups (name, created_by) VALUES
    ('Familjen', seed_user('anna')),
    ('Vännerna', seed_user('sara')),
    ('Jobbet', seed_user('johan'));

INSERT INTO group_members (group_id, user_id, is_admin)
SELECT seed_group(g), seed_user(u), a
FROM (VALUES
    ('Familjen', 'anna', true),
    ('Familjen', 'erik', true),
    ('Familjen', 'Maja Berg', false),
    ('Familjen', 'oskar', false),
    ('Familjen', 'elsa', false),
    ('Vännerna', 'sara', true),
    ('Vännerna', 'anna', false),
    ('Vännerna', 'johan', false),
    ('Vännerna', 'lukas', false),
    ('Jobbet', 'johan', true),
    ('Jobbet', 'erik', false),
    ('Jobbet', 'sara', false)
) AS m(g, u, a);

-- ---------- Listor ----------
INSERT INTO lists (title, description, end_date, is_public, published_at, created_by) VALUES
    ('Majas 7-årskalas', 'Kalas hemma hos oss klockan 14. Maja älskar allt som har med djur och pyssel att göra!',
        current_date + 14, true, now(), seed_user('anna')),
    ('Annas 40-årsdag', 'Vi firar Anna med middag på lördagen. Hon vet inte vad som är reserverat – håll det hemligt!',
        current_date + 30, true, now(), seed_user('sara')),
    ('Oskars julklappar', 'Under uppbyggnad – publiceras när listan är klar.',
        current_date + 50, false, null, seed_user('elsa')),
    ('Lukas önskelista', 'Min egen lista. Jag ser inte vad ni reserverar, så det blir en överraskning ändå.',
        current_date + 60, true, now(), seed_user('lukas')),
    ('Eriks födelsedag', 'Fika på kontoret.',
        current_date - 20, true, now(), seed_user('johan'));

INSERT INTO list_groups (list_id, group_id)
SELECT seed_list(l), seed_group(g)
FROM (VALUES
    ('Majas 7-årskalas', 'Familjen'),
    ('Annas 40-årsdag', 'Vännerna'),
    ('Oskars julklappar', 'Familjen'),
    ('Lukas önskelista', 'Vännerna'),
    ('Eriks födelsedag', 'Jobbet')
) AS x(l, g);

INSERT INTO list_admins (list_id, user_id)
SELECT seed_list(l), seed_user(u)
FROM (VALUES
    ('Majas 7-årskalas', 'anna'),
    ('Majas 7-årskalas', 'erik'),
    ('Annas 40-årsdag', 'sara'),
    ('Annas 40-årsdag', 'johan'),
    ('Oskars julklappar', 'elsa'),
    ('Lukas önskelista', 'lukas'),
    ('Eriks födelsedag', 'johan')
) AS x(l, u);

INSERT INTO list_recipients (list_id, user_id)
SELECT seed_list(l), seed_user(u)
FROM (VALUES
    ('Majas 7-årskalas', 'Maja Berg'),
    ('Annas 40-årsdag', 'anna'),
    ('Oskars julklappar', 'oskar'),
    ('Lukas önskelista', 'lukas'),
    ('Eriks födelsedag', 'erik')
) AS x(l, u);

-- ---------- Önskningar ----------
INSERT INTO wishes (list_id, title, description, price, url, quantity)
SELECT seed_list(l), t, d, p, u, q
FROM (VALUES
    ('Majas 7-årskalas', 'Lego Friends djurklinik', 'Gärna den med hästar.', 499.00, null, 1),
    ('Majas 7-årskalas', 'Rullskridskor', 'Storlek 31–34, justerbara.', 699.00, null, 1),
    ('Majas 7-årskalas', 'Pysselpaket', 'Pärlor, glitterlim, papper – allt går hem.', 249.00, null, 2),
    ('Majas 7-årskalas', 'Kapitelböcker', 'Hon gillar djurböcker. Valfri titel!', 129.00, null, 3),

    ('Annas 40-årsdag', 'Presentkort på spa', null, 800.00, null, 1),
    ('Annas 40-årsdag', 'Sällskapsspel', 'Något för 2–4 spelare.', 399.00, null, 1),
    ('Annas 40-årsdag', 'Tekanna i gjutjärn', null, 450.00, null, 1),
    ('Annas 40-årsdag', 'Fina vinglas', 'Sex stycken totalt.', 89.50, null, 6),

    ('Oskars julklappar', 'Fotboll', 'Storlek 4.', 299.00, null, 1),
    ('Oskars julklappar', 'Hörlurar', 'Trådlösa.', 599.00, null, 1),

    ('Lukas önskelista', 'Kaffekvarn', null, 549.00, null, 1),
    ('Lukas önskelista', 'Vinylskiva', 'Något med jazz.', 279.00, null, 2),
    ('Lukas önskelista', 'Löparstrumpor', 'Storlek 43–46.', 149.00, null, 3),

    ('Eriks födelsedag', 'Kaffebönor', 'Mörkrost.', 159.00, null, 2),
    ('Eriks födelsedag', 'Bok om fågelskådning', null, 349.00, null, 1)
) AS x(l, t, d, p, u, q);

-- ---------- Gåvor (reservationer) ----------
-- Titel och pris kopieras från önskningen när någon reserverar. Priset är totalt: önskningens pris × antal.
INSERT INTO gifts (wish_id, created_by, quantity, title, price)
SELECT w.id, seed_user(u), q, w.title, w.price * q
FROM (VALUES
    ('Majas 7-årskalas', 'Lego Friends djurklinik', 'oskar', 1),
    ('Majas 7-årskalas', 'Pysselpaket', 'elsa', 1),
    ('Majas 7-årskalas', 'Kapitelböcker', 'erik', 2),

    ('Annas 40-årsdag', 'Presentkort på spa', 'sara', 1),
    ('Annas 40-årsdag', 'Sällskapsspel', 'lukas', 1),
    ('Annas 40-årsdag', 'Fina vinglas', 'johan', 2),
    ('Annas 40-årsdag', 'Fina vinglas', 'sara', 2),

    ('Lukas önskelista', 'Kaffekvarn', 'sara', 1),
    ('Lukas önskelista', 'Löparstrumpor', 'anna', 2),

    ('Eriks födelsedag', 'Kaffebönor', 'sara', 2),
    ('Eriks födelsedag', 'Bok om fågelskådning', 'johan', 1)
) AS x(l, t, u, q)
JOIN wishes w ON w.id = seed_wish(l, t);

-- Den som reserverade är alltid med
INSERT INTO gift_members (gift_id, user_id) SELECT id, created_by FROM gifts;

-- Delade gåvor:
--  Spa-presentkortet: Sara, Johan och Lukas delar lika (800 kr → 266,67 kr var)
INSERT INTO gift_members (gift_id, user_id)
SELECT g.id, seed_user(u)
FROM gifts g, (VALUES ('johan'), ('lukas')) AS x(u)
WHERE g.wish_id = seed_wish('Annas 40-årsdag', 'Presentkort på spa');

--  Fågelboken (arkiverad): Johan och Sara med egna belopp, 249 + 100 = 349 kr, och en kommentar
UPDATE gifts SET split = 'custom', comment = 'Köpt på bokrean, Sara la till ett fint bokmärke.'
WHERE wish_id = seed_wish('Eriks födelsedag', 'Bok om fågelskådning');
INSERT INTO gift_members (gift_id, user_id)
SELECT id, seed_user('sara') FROM gifts WHERE wish_id = seed_wish('Eriks födelsedag', 'Bok om fågelskådning');
UPDATE gift_members gm SET amount = x.amount
FROM gifts g, (VALUES ('johan', 249.00), ('sara', 100.00)) AS x(u, amount)
WHERE gm.gift_id = g.id AND g.wish_id = seed_wish('Eriks födelsedag', 'Bok om fågelskådning')
  AND gm.user_id = seed_user(x.u);

-- ---------- Städa bort hjälpfunktionerna ----------
DROP FUNCTION seed_user(text);
DROP FUNCTION seed_group(text);
DROP FUNCTION seed_list(text);
DROP FUNCTION seed_wish(text, text);
