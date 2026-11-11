-- Migrering 020: reservera från Secret Santa-mottagarens önskeprofil
-- En reservation på en önskning på någons önskeprofil kan nu höra till en Secret Santa (santa_id) – när
-- givaren reserverar något från den hen lottats till. Den har då lottningens datum (inget eget gift_date).
-- Triggerna:
--   - lottningen raderas    → reservationen blir en vanlig reservation på önskeprofilen, med lottningens datum
--   - önskningen raderas    → gåvan blir en överraskningsgåva till lottningen (önskningens beskrivning, länk, bild)
--   - mottagaren raderas    → samma sak (önskeprofilen raderas med hen)
-- Kör EN gång, efter 019_gift_events.sql.

ALTER TABLE gifts DROP CONSTRAINT gifts_one_link;
ALTER TABLE gifts ADD CONSTRAINT gifts_one_link CHECK (
    -- en reservation: på en önskning – ev. kopplad till en Secret Santa, och då utan eget datum
    (wish_id IS NOT NULL AND list_id IS NULL AND event_id IS NULL
        AND description IS NULL AND url IS NULL AND image_url IS NULL
        AND (santa_id IS NULL OR gift_date IS NULL))
    -- en gåva utanför önskelistan: precis en av lista, Secret Santa och egen händelse
    OR (wish_id IS NULL AND gift_date IS NULL AND num_nonnulls(list_id, santa_id, event_id) = 1)
);


-- Önskningen raderas: reservationer kopplade till en Secret Santa blir överraskningsgåvor till lottningen;
-- övriga blir händelser, som förut (019)
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
    SET wish_id = NULL, gift_date = NULL,
        description = OLD.description, url = OLD.url, image_url = OLD.image_url, updated_at = now()
    WHERE wish_id = OLD.id AND santa_id IS NOT NULL;

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


-- Lottningen raderas: reservationer från önskeprofilen blir kvar som reservationer (med lottningens datum);
-- överraskningsgåvorna blir händelser, som förut (019)
CREATE OR REPLACE FUNCTION wrappd_keep_gifts_of_santa() RETURNS trigger AS $$
DECLARE
    buyer INT;
    ev INT;
BEGIN
    UPDATE gifts SET santa_id = NULL, gift_date = OLD.event_date, updated_at = now()
    WHERE santa_id = OLD.id AND wish_id IS NOT NULL;

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


-- En användare raderas: reservationer på hens önskeprofil som hör till en Secret Santa blir överraskningsgåvor
-- till lottningen; övriga blir händelser med "Okänd mottagare", som förut (019)
CREATE OR REPLACE FUNCTION wrappd_mark_unknown_recipient() RETURNS trigger AS $$
DECLARE
    buyer INT;
    ev INT;
BEGIN
    UPDATE gifts g
    SET wish_id = NULL, gift_date = NULL,
        description = w.description, url = w.url, image_url = w.image_url, updated_at = now()
    FROM wishes w
    WHERE g.wish_id = w.id AND w.user_id = OLD.id AND g.santa_id IS NOT NULL;

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
