-- Migrering 019: "Loggade gåvor" blir riktiga händelser (gift_events)
-- Förut var en egen händelse bara tre fält på varje gåva (namn, datum, mottagare), och gåvor med samma
-- värden visades ihop. Nu är händelsen en egen rad som gåvorna pekar på (gifts.event_id):
--   - namn, datum och EN mottagare: en person (recipient_id), ett namn i fritext (recipient_text),
--     eller "Okänd mottagare" (recipient_unknown – personens konto är raderat)
--   - alla som delar på en gåva i händelsen ser den och kan ändra den
--   - den skapas tillsammans med sin första gåva och raderas när den sista gåvan tas bort (trigger)
-- Triggerna från 018 skapar nu en händelse (en per köpare) när en lista, önskning eller Secret Santa raderas.
-- Kör EN gång, efter 018_gifts_survive.sql.

CREATE TABLE gift_events (
    id                SERIAL PRIMARY KEY,
    name              TEXT NOT NULL CHECK (length(trim(name)) > 0),
    event_date        DATE NOT NULL,
    recipient_id      INT REFERENCES users(id) ON DELETE SET NULL,
    recipient_text    TEXT CHECK (recipient_text IS NULL OR length(trim(recipient_text)) > 0),
    recipient_unknown BOOLEAN NOT NULL DEFAULT false,
    created_by        INT REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT gift_events_one_recipient CHECK (recipient_id IS NULL OR recipient_text IS NULL)
);
CREATE INDEX gift_events_recipient_idx ON gift_events (recipient_id);

ALTER TABLE gifts ADD COLUMN event_id INT REFERENCES gift_events(id);
CREATE INDEX gifts_event_idx ON gifts (event_id);


-- 1. Flytta befintliga egna händelser: en händelse per köpare och unik kombination av namn, datum och mottagare
INSERT INTO gift_events (name, event_date, recipient_id, recipient_text, recipient_unknown, created_by)
SELECT DISTINCT recipient, gift_date, recipient_id, recipient_text, recipient_unknown, created_by
FROM gifts
WHERE wish_id IS NULL AND list_id IS NULL AND santa_id IS NULL;

UPDATE gifts g SET event_id = e.id
FROM gift_events e
WHERE g.wish_id IS NULL AND g.list_id IS NULL AND g.santa_id IS NULL
  AND e.name = g.recipient AND e.event_date = g.gift_date AND e.created_by = g.created_by
  AND e.recipient_id IS NOT DISTINCT FROM g.recipient_id
  AND e.recipient_text IS NOT DISTINCT FROM g.recipient_text
  AND e.recipient_unknown = g.recipient_unknown;


-- 2. Gåvan har inte längre egna händelsefält. gift_date finns kvar bara för gåvor från en önskeprofil.
ALTER TABLE gifts DROP CONSTRAINT gifts_wish_or_free;
ALTER TABLE gifts DROP CONSTRAINT gifts_recipient_only_free;
UPDATE gifts SET gift_date = NULL WHERE event_id IS NOT NULL;
ALTER TABLE gifts DROP COLUMN recipient, DROP COLUMN recipient_id, DROP COLUMN recipient_text, DROP COLUMN recipient_unknown;

-- Varje gåva hör till precis en sak: en önskning, en lista, en Secret Santa eller en händelse
ALTER TABLE gifts ADD CONSTRAINT gifts_one_link CHECK (
    (wish_id IS NOT NULL AND list_id IS NULL AND santa_id IS NULL AND event_id IS NULL
        AND description IS NULL AND url IS NULL AND image_url IS NULL)
    OR (wish_id IS NULL AND gift_date IS NULL AND num_nonnulls(list_id, santa_id, event_id) = 1)
);


-- 3. Triggers. Hjälpfunktionerna för listans mottagare från 018 används fortfarande:
--    en mottagare → recipient_id, flera → deras namn i fritext.

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
        SET wish_id = NULL, event_id = ev, gift_date = NULL,
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

-- En önskning raderas: en händelse per köpare (listans namn och datum, eller "Önskeprofil" och gåvans datum)
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
    IF NOT EXISTS (SELECT 1 FROM gifts WHERE wish_id = OLD.id) THEN
        RETURN OLD;
    END IF;

    IF OLD.list_id IS NOT NULL THEN
        SELECT title, end_date INTO list_title, list_date FROM lists WHERE id = OLD.list_id;
        rid := wrappd_list_recipient_id(OLD.list_id);
        rtext := wrappd_list_recipient_text(OLD.list_id);
    ELSIF EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN
        rid := OLD.user_id; -- önskeprofilens ägare
    ELSE
        unknown := true;
    END IF;

    FOR buyer IN SELECT DISTINCT created_by FROM gifts WHERE wish_id = OLD.id LOOP
        INSERT INTO gift_events (name, event_date, recipient_id, recipient_text, recipient_unknown, created_by)
        VALUES (
            COALESCE(list_title, 'Önskeprofil'),
            COALESCE(list_date,
                     (SELECT max(gift_date) FROM gifts WHERE wish_id = OLD.id AND created_by = buyer),
                     CURRENT_DATE),
            rid, rtext, unknown, buyer
        ) RETURNING id INTO ev;

        UPDATE gifts
        SET wish_id = NULL, event_id = ev, gift_date = NULL,
            description = OLD.description, url = OLD.url, image_url = OLD.image_url, updated_at = now()
        WHERE wish_id = OLD.id AND created_by = buyer;
    END LOOP;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- En Secret Santa raderas: varje givares gåvor blir en händelse till den hen lottades till
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

-- En användare raderas: reservationer på hens önskeprofil blir händelser med "Okänd mottagare",
-- och händelser till hen får "Okänd mottagare" (recipient_id blir NULL via ON DELETE SET NULL)
CREATE OR REPLACE FUNCTION wrappd_mark_unknown_recipient() RETURNS trigger AS $$
DECLARE
    buyer INT;
    ev INT;
BEGIN
    FOR buyer IN
        SELECT DISTINCT g.created_by FROM gifts g JOIN wishes w ON w.id = g.wish_id WHERE w.user_id = OLD.id
    LOOP
        INSERT INTO gift_events (name, event_date, recipient_unknown, created_by)
        VALUES ('Önskeprofil',
                COALESCE((SELECT max(g.gift_date) FROM gifts g JOIN wishes w ON w.id = g.wish_id
                          WHERE w.user_id = OLD.id AND g.created_by = buyer), CURRENT_DATE),
                true, buyer)
        RETURNING id INTO ev;

        UPDATE gifts g
        SET wish_id = NULL, event_id = ev, gift_date = NULL,
            description = w.description, url = w.url, image_url = w.image_url, updated_at = now()
        FROM wishes w
        WHERE g.wish_id = w.id AND w.user_id = OLD.id AND g.created_by = buyer;
    END LOOP;

    UPDATE gift_events SET recipient_unknown = true, recipient_text = NULL, updated_at = now()
    WHERE recipient_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- En händelse utan gåvor finns inte: när den sista gåvan tas bort eller flyttas, raderas händelsen
CREATE OR REPLACE FUNCTION wrappd_delete_empty_event() RETURNS trigger AS $$
BEGIN
    IF OLD.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gifts WHERE event_id = OLD.event_id) THEN
        DELETE FROM gift_events WHERE id = OLD.event_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gifts_delete_empty_event AFTER DELETE OR UPDATE OF event_id ON gifts
    FOR EACH ROW EXECUTE FUNCTION wrappd_delete_empty_event();
