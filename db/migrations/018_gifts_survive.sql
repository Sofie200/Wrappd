-- Migrering 018: gåvor överlever att det de hör till raderas
-- En gåva ägs av de som köpt den. Raderas listan, önskningen eller Secret Santa-lottningen den hör till,
-- görs gåvan om till en gåva för en egen händelse ("Egen lista") i stället för att raderas:
--   - händelsens namn (gifts.recipient) = listans/lottningens namn, eller "Önskeprofil"
--   - datum (gift_date)                  = listans/lottningens datum (eller gåvans eget, för önskeprofiler)
--   - mottagare                          = listans mottagare / lottningens mottagare / önskeprofilens ägare
--   - beskrivning, länk och bild         = önskningens (bilden raderas inte så länge en gåva använder den)
-- Raderas en mottagare (en användare) blir gåvans mottagare "Okänd mottagare" (recipient_unknown).
-- Användaren kan då skriva in ett eget namn (recipient_text) – ett namn i fritext, utan koppling.
-- Logiken ligger i triggers, så den gäller oavsett varifrån raderingen kommer (appen, kontoradering, skript).
-- Kör EN gång, efter 017_profile_gift_date.sql.

-- Mottagaren i fritext (eget namn, eller flera mottagare från en raderad lista), och "mottagaren är raderad"
ALTER TABLE gifts ADD COLUMN recipient_text TEXT CHECK (recipient_text IS NULL OR length(trim(recipient_text)) > 0);
ALTER TABLE gifts ADD COLUMN recipient_unknown BOOLEAN NOT NULL DEFAULT false;

-- Fritext och okänd mottagare finns bara på gåvor för en egen händelse (som recipient_id)
ALTER TABLE gifts DROP CONSTRAINT gifts_recipient_only_free;
ALTER TABLE gifts ADD CONSTRAINT gifts_recipient_only_free CHECK (
    (recipient_id IS NULL AND recipient_text IS NULL AND NOT recipient_unknown)
    OR (wish_id IS NULL AND list_id IS NULL AND santa_id IS NULL)
);


-- Hjälpfunktion: mottagarna för en gåva som görs om, utifrån en lista.
-- En mottagare → recipient_id. Flera → deras namn i fritext. Inga → ingenting.
CREATE OR REPLACE FUNCTION wrappd_list_recipient_id(p_list_id INT) RETURNS INT AS $$
    SELECT CASE WHEN count(*) = 1 THEN min(user_id) END FROM list_recipients WHERE list_id = p_list_id;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION wrappd_list_recipient_text(p_list_id INT) RETURNS TEXT AS $$
    SELECT CASE WHEN count(*) > 1 THEN string_agg(u.name, ', ' ORDER BY u.name) END
    FROM list_recipients lr JOIN users u ON u.id = lr.user_id
    WHERE lr.list_id = p_list_id;
$$ LANGUAGE sql STABLE;


-- 1. En lista raderas: dess gåvor – reservationer på listans önskningar och överraskningsgåvor – blir egna händelser
CREATE OR REPLACE FUNCTION wrappd_keep_gifts_of_list() RETURNS trigger AS $$
DECLARE
    rid INT := wrappd_list_recipient_id(OLD.id);
    rtext TEXT := wrappd_list_recipient_text(OLD.id);
BEGIN
    -- Reservationer: önskningens beskrivning, länk och bild följer med
    UPDATE gifts g
    SET wish_id = NULL, recipient = OLD.title, gift_date = OLD.end_date,
        description = w.description, url = w.url, image_url = w.image_url,
        recipient_id = rid, recipient_text = rtext, updated_at = now()
    FROM wishes w
    WHERE g.wish_id = w.id AND w.list_id = OLD.id;

    -- Överraskningsgåvor: har redan egen titel, beskrivning, länk och bild
    UPDATE gifts
    SET list_id = NULL, recipient = OLD.title, gift_date = OLD.end_date,
        recipient_id = rid, recipient_text = rtext, updated_at = now()
    WHERE list_id = OLD.id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lists_keep_gifts BEFORE DELETE ON lists
    FOR EACH ROW EXECUTE FUNCTION wrappd_keep_gifts_of_list();


-- 2. En önskning raderas (ensam, eller med en önskeprofil när en användare raderas):
--    reservationerna på den blir egna händelser. (Önskningar på en lista som raderas är redan klara – se 1.)
CREATE OR REPLACE FUNCTION wrappd_keep_gifts_of_wish() RETURNS trigger AS $$
DECLARE
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
        unknown := true;    -- ägaren raderas just nu (önskeprofilen följer med användaren)
    END IF;

    UPDATE gifts
    SET wish_id = NULL,
        recipient = COALESCE(list_title, 'Önskeprofil'),
        gift_date = COALESCE(list_date, gift_date, CURRENT_DATE),
        description = OLD.description, url = OLD.url, image_url = OLD.image_url,
        recipient_id = rid, recipient_text = rtext, recipient_unknown = unknown, updated_at = now()
    WHERE wish_id = OLD.id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wishes_keep_gifts BEFORE DELETE ON wishes
    FOR EACH ROW EXECUTE FUNCTION wrappd_keep_gifts_of_wish();


-- 3. En Secret Santa raderas: givarnas gåvor blir egna händelser, till den de lottades till
CREATE OR REPLACE FUNCTION wrappd_keep_gifts_of_santa() RETURNS trigger AS $$
BEGIN
    UPDATE gifts g
    SET santa_id = NULL, recipient = OLD.title, gift_date = OLD.event_date,
        recipient_id = (SELECT p.receiver_id FROM secret_santa_pairs p
                        WHERE p.santa_id = OLD.id AND p.giver_id = g.created_by),
        updated_at = now()
    WHERE g.santa_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER secret_santas_keep_gifts BEFORE DELETE ON secret_santas
    FOR EACH ROW EXECUTE FUNCTION wrappd_keep_gifts_of_santa();


-- 4. En användare raderas: gåvor till hen får "Okänd mottagare" (recipient_id blir NULL via ON DELETE SET NULL).
--    Reservationer på hens önskeprofil görs om här först – önskeprofilen raderas strax med användaren,
--    och då ska mottagaren redan vara "okänd", inte pekas ut på nytt.
CREATE OR REPLACE FUNCTION wrappd_mark_unknown_recipient() RETURNS trigger AS $$
BEGIN
    UPDATE gifts g
    SET wish_id = NULL, recipient = 'Önskeprofil', gift_date = COALESCE(g.gift_date, CURRENT_DATE),
        description = w.description, url = w.url, image_url = w.image_url,
        recipient_id = NULL, recipient_text = NULL, recipient_unknown = true, updated_at = now()
    FROM wishes w
    WHERE g.wish_id = w.id AND w.user_id = OLD.id;

    UPDATE gifts SET recipient_unknown = true, recipient_text = NULL, updated_at = now() WHERE recipient_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_mark_unknown_recipient BEFORE DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION wrappd_mark_unknown_recipient();
