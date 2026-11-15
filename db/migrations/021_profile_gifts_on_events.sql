-- Migrering 021: reservationer från en önskeprofil hamnar under "Loggade gåvor"
-- Förut fick en reservation på någons önskeprofil ett eget datum (gifts.gift_date) och visades som
-- "Önskeprofil" för sig. Nu hör den till en egen händelse (gift_events, via gifts.event_id) – en som
-- redan finns till samma person, eller en ny med namn och datum – precis som loggade gåvor.
-- Den är fortfarande en reservation (wish_id): önskningen visas som reserverad på önskeprofilen.
--   - befintliga reservationer flyttas: en händelse "Önskeprofil" per köpare, person och datum
--   - gifts.gift_date tas bort – datumet är händelsens
--   - triggerna: raderas önskningen blir reservationen en loggad gåva på samma händelse; raderas
--     en Secret Santa blir reservationer därifrån kvar som reservationer, på en ny händelse
-- Kör EN gång, efter 020_santa_wish_gifts.sql. Allt i en transaktion: blir något fel ändras ingenting.

BEGIN;

ALTER TABLE gifts DROP CONSTRAINT gifts_one_link;


-- 1. Flytta befintliga reservationer från önskeprofiler (inte de till en Secret Santa) till nya händelser:
--    en per köpare, person och datum (utan datum: dagen reservationen gjordes)
CREATE TEMP TABLE profile_events AS
SELECT DISTINCT g.created_by AS buyer, w.user_id AS owner, COALESCE(g.gift_date, g.created_at::date) AS event_date
FROM gifts g JOIN wishes w ON w.id = g.wish_id
WHERE w.user_id IS NOT NULL AND g.santa_id IS NULL AND g.event_id IS NULL;

ALTER TABLE profile_events ADD COLUMN event_id INT;
UPDATE profile_events SET event_id = nextval(pg_get_serial_sequence('gift_events', 'id'));

INSERT INTO gift_events (id, name, event_date, recipient_id, created_by)
SELECT event_id, 'Önskeprofil', event_date, owner, buyer FROM profile_events;

UPDATE gifts g SET event_id = pe.event_id, updated_at = now()
FROM wishes w, profile_events pe
WHERE w.id = g.wish_id AND w.user_id IS NOT NULL AND g.santa_id IS NULL AND g.event_id IS NULL
  AND pe.buyer = g.created_by AND pe.owner = w.user_id
  AND pe.event_date = COALESCE(g.gift_date, g.created_at::date);

DROP TABLE profile_events;


-- 2. Triggerna utan gift_date
-- En lista raderas: en händelse per köpare, med listans namn, datum och mottagare
CREATE OR REPLACE FUNCTION wrappd_keep_gifts_of_list() RETURNS trigger AS $$
DECLARE
    buyer INT;
    ev INT;
    rid INT := wrappd_list_recipient_id(OLD.id);
    rtext TEXT := wrappd_list_recipient_text(OLD.id);
BEGIN
    FOR buyer IN
        SELECT DISTINCT g.created_by FROM gifts g LEFT JOIN wishes w ON w.id = g.wish_id
        WHERE g.list_id = OLD.id OR w.list_id = OLD.id
    LOOP
        INSERT INTO gift_events (name, event_date, recipient_id, recipient_text, created_by)
        VALUES (OLD.title, OLD.end_date, rid, rtext, buyer) RETURNING id INTO ev;

        -- Reservationer: önskningens beskrivning, länk och bild följer med
        UPDATE gifts g
        SET wish_id = NULL, event_id = ev,
            description = w.description, url = w.url, image_url = w.image_url, updated_at = now()
        FROM wishes w
        WHERE g.wish_id = w.id AND w.list_id = OLD.id AND g.created_by = buyer;

        -- Överraskningsgåvor
        UPDATE gifts SET list_id = NULL, event_id = ev, updated_at = now()
        WHERE list_id = OLD.id AND created_by = buyer;
    END LOOP;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- En önskning raderas:
--   - reservation till en Secret Santa  → överraskningsgåva till lottningen
--   - reservation på en egen händelse (från en önskeprofil) → loggad gåva på samma händelse
--   - reservation på en lista            → en händelse per köpare, med listans namn, datum och mottagare
-- (Önskningens beskrivning, länk och bild följer med i alla fallen.)
CREATE OR REPLACE FUNCTION wrappd_keep_gifts_of_wish() RETURNS trigger AS $$
DECLARE
    buyer INT;
    ev INT;
    list_title TEXT;
    list_date DATE;
    rid INT;
    rtext TEXT;
    unknown BOOLEAN := false;
BEGIN
    UPDATE gifts
    SET wish_id = NULL,
        description = OLD.description, url = OLD.url, image_url = OLD.image_url, updated_at = now()
    WHERE wish_id = OLD.id AND (santa_id IS NOT NULL OR event_id IS NOT NULL);

    IF NOT EXISTS (SELECT 1 FROM gifts WHERE wish_id = OLD.id) THEN
        RETURN OLD;
    END IF;

    IF OLD.list_id IS NOT NULL THEN
        SELECT title, end_date INTO list_title, list_date FROM lists WHERE id = OLD.list_id;
        rid := wrappd_list_recipient_id(OLD.list_id);
        rtext := wrappd_list_recipient_text(OLD.list_id);
    ELSIF EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN
        rid := OLD.user_id;
    ELSE
        unknown := true;
    END IF;

    FOR buyer IN SELECT DISTINCT created_by FROM gifts WHERE wish_id = OLD.id LOOP
        INSERT INTO gift_events (name, event_date, recipient_id, recipient_text, recipient_unknown, created_by)
        VALUES (COALESCE(list_title, 'Önskeprofil'), COALESCE(list_date, CURRENT_DATE), rid, rtext, unknown, buyer)
        RETURNING id INTO ev;

        UPDATE gifts
        SET wish_id = NULL, event_id = ev,
            description = OLD.description, url = OLD.url, image_url = OLD.image_url, updated_at = now()
        WHERE wish_id = OLD.id AND created_by = buyer;
    END LOOP;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- En Secret Santa raderas: varje givares gåvor blir en händelse till den hen lottades till.
-- Reservationer från mottagarens önskeprofil blir kvar som reservationer – på den händelsen.
CREATE OR REPLACE FUNCTION wrappd_keep_gifts_of_santa() RETURNS trigger AS $$
DECLARE
    buyer INT;
    ev INT;
BEGIN
    FOR buyer IN SELECT DISTINCT created_by FROM gifts WHERE santa_id = OLD.id LOOP
        INSERT INTO gift_events (name, event_date, recipient_id, created_by)
        VALUES (OLD.title, OLD.event_date,
                (SELECT receiver_id FROM secret_santa_pairs WHERE santa_id = OLD.id AND giver_id = buyer),
                buyer)
        RETURNING id INTO ev;

        UPDATE gifts SET santa_id = NULL, event_id = ev, updated_at = now()
        WHERE santa_id = OLD.id AND created_by = buyer;
    END LOOP;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- En användare raderas: reservationer på hens önskeprofil blir gåvor utan önskning –
-- till en Secret Santa: överraskningsgåvor till lottningen; på en egen händelse: loggade gåvor på den.
-- Händelser till hen får "Okänd mottagare" (recipient_id blir NULL via ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION wrappd_mark_unknown_recipient() RETURNS trigger AS $$
DECLARE
    buyer INT;
    ev INT;
BEGIN
    UPDATE gifts g
    SET wish_id = NULL,
        description = w.description, url = w.url, image_url = w.image_url, updated_at = now()
    FROM wishes w
    WHERE g.wish_id = w.id AND w.user_id = OLD.id AND (g.santa_id IS NOT NULL OR g.event_id IS NOT NULL);

    -- (Reservationer på önskeprofilen utan händelse ska inte finnas – men blir i så fall en egen händelse)
    FOR buyer IN
        SELECT DISTINCT g.created_by FROM gifts g JOIN wishes w ON w.id = g.wish_id WHERE w.user_id = OLD.id
    LOOP
        INSERT INTO gift_events (name, event_date, recipient_unknown, created_by)
        VALUES ('Önskeprofil', CURRENT_DATE, true, buyer)
        RETURNING id INTO ev;

        UPDATE gifts g
        SET wish_id = NULL, event_id = ev,
            description = w.description, url = w.url, image_url = w.image_url, updated_at = now()
        FROM wishes w
        WHERE g.wish_id = w.id AND w.user_id = OLD.id AND g.created_by = buyer;
    END LOOP;

    UPDATE gift_events SET recipient_unknown = true, recipient_text = NULL, updated_at = now()
    WHERE recipient_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;


-- 3. Datumet är händelsens – gåvan har inget eget
ALTER TABLE gifts DROP COLUMN gift_date;

ALTER TABLE gifts ADD CONSTRAINT gifts_one_link CHECK (
    -- en reservation: på en önskning – ev. kopplad till en Secret Santa ELLER en egen händelse
    (wish_id IS NOT NULL AND list_id IS NULL
        AND description IS NULL AND url IS NULL AND image_url IS NULL
        AND num_nonnulls(santa_id, event_id) <= 1)
    -- en gåva utanför önskelistan: precis en av lista, Secret Santa och egen händelse
    OR (wish_id IS NULL AND num_nonnulls(list_id, santa_id, event_id) = 1)
);

COMMIT;
