-- Wrappd – databasschema
-- Kör hela filen i Neons SQL-editor (eller med psql) i en tom databas.

-- password_hash is NULL for accounts a group admin created, until the person has chosen a password via the link.
-- Children (is_child) can never log in: no username, no password. They can only be recipients of lists.
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
    username      TEXT UNIQUE CHECK (username = lower(username)),
    email         TEXT UNIQUE CHECK (email = lower(email)), -- optional, always lowercase
    email_verified BOOLEAN NOT NULL DEFAULT false, -- true only when the email came from Google (typed-in emails are unchecked)
    google_sub    TEXT UNIQUE, -- Google's fixed account id, set when the user logs in with Google
    password_hash TEXT,
    is_child      BOOLEAN NOT NULL DEFAULT false,
    -- Profile icon in the top menu (same values in api/_lib/userSchema.js and frontend/src/profileOptions.js)
    -- A random icon and colour for every new user
    avatar_icon   TEXT NOT NULL
                  DEFAULT (ARRAY['user', 'cat', 'snail', 'bug', 'bird', 'ghost', 'banana',
                                 'hand-metal', 'citrus', 'lollipop', 'coffee', 'squirrel', 'sun', 'germ'])[floor(random() * 14)::int + 1]
                  CHECK (avatar_icon IN ('user', 'cat', 'snail', 'bug', 'bird', 'ghost', 'banana',
                                         'hand-metal', 'citrus', 'lollipop', 'coffee', 'squirrel', 'sun', 'germ')),
    avatar_color  TEXT NOT NULL
                  DEFAULT (ARRAY['pink', 'orange', 'green', 'purple', 'blue'])[floor(random() * 5)::int + 1]
                  CHECK (avatar_color IN ('pink', 'orange', 'green', 'purple', 'blue')),
    -- Wish profile: free text, and categories liked / not liked (keys in api/_lib/profileSchema.js)
    wish_about    TEXT,
    likes         TEXT[] NOT NULL DEFAULT '{}',
    dislikes      TEXT[] NOT NULL DEFAULT '{}',
    created_by    INT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_adult_has_username CHECK (is_child OR username IS NOT NULL),
    CONSTRAINT users_child_cannot_log_in CHECK (NOT is_child OR (username IS NULL AND password_hash IS NULL)),
    CONSTRAINT users_child_has_no_email CHECK (NOT is_child OR email IS NULL),
    CONSTRAINT users_child_has_no_google CHECK (NOT is_child OR google_sub IS NULL)
);

-- 1–2 parents per child (the maximum of two is checked in children-routes.js)
CREATE TABLE child_parents (
    child_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (child_id, parent_id),
    CHECK (child_id <> parent_id)
);
CREATE INDEX child_parents_parent_idx ON child_parents (parent_id);

-- One-time links: activate an account a group admin created, or reset a forgotten password.
-- Only a hash of the link's token is stored, so a leaked database gives no working links.
CREATE TABLE user_links (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    purpose    TEXT NOT NULL CHECK (purpose IN ('activate', 'reset')),
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_links_user_idx ON user_links (user_id);

-- En grupp kan inte raderas, så inga ON DELETE-regler behövs för grupper
CREATE TABLE groups (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
    -- On: all members' children are members automatically. Off: no children.
    -- A child is never in a group without one of its parents (kept in sync by api/_lib/childGroups.js)
    include_children BOOLEAN NOT NULL DEFAULT false,
    created_by INT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
    group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user_idx ON group_members (user_id);

-- En lista är privat (bara admins) tills den publiceras. Den arkiveras dagen efter end_date.
CREATE TABLE lists (
    id           SERIAL PRIMARY KEY,
    title        TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description  TEXT,
    end_date     DATE NOT NULL,
    is_public    BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    created_by   INT NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grupperna vars medlemmar ser listan när den är publik
CREATE TABLE list_groups (
    list_id  INT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    group_id INT NOT NULL REFERENCES groups(id),
    PRIMARY KEY (list_id, group_id)
);
CREATE INDEX list_groups_group_idx ON list_groups (group_id);

CREATE TABLE list_admins (
    list_id INT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (list_id, user_id)
);
CREATE INDEX list_admins_user_idx ON list_admins (user_id);

-- Mottagarna – de som listan är till. De ser aldrig reservationerna.
CREATE TABLE list_recipients (
    list_id INT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (list_id, user_id)
);
CREATE INDEX list_recipients_user_idx ON list_recipients (user_id);

-- A wish is on a list, OR on a person's wish profile (user_id) – never both
CREATE TABLE wishes (
    id          SERIAL PRIMARY KEY,
    list_id     INT REFERENCES lists(id) ON DELETE CASCADE,
    user_id     INT REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT,
    price       NUMERIC(10, 2) CHECK (price >= 0),
    url         TEXT,
    image_url   TEXT,
    quantity    INT NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT wishes_list_or_person CHECK ((list_id IS NULL) <> (user_id IS NULL))
);
CREATE INDEX wishes_list_idx ON wishes (list_id);
CREATE INDEX wishes_user_idx ON wishes (user_id);

-- "Loggade gåvor": an event of my own that gifts are logged on (gifts.event_id) – a name, a date and ONE recipient:
-- a person (recipient_id), a name in free text (recipient_text), or "Okänd mottagare" (recipient_unknown: the
-- person's account was deleted). Everyone who shares a gift in it sees it and can change it. It's created with its
-- first gift and deleted when its last gift goes (trigger below). Lists, wishes and Secret Santas that are deleted
-- leave their gifts in a new event (one per buyer – triggers below).
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

-- A gift ("gåva" in the UI) is either:
--  - reserved on a wish (wish_id): its own copy of the title, its own price (total, for all copies)
--    and a comment – everything else is read from the wish, or
--  - bought outside the wish list (wish_id NULL): its own title, description, link and image, and
--    linked to a list (list_id), to a Secret Santa (santa_id – recipient and date come from the draw),
--    or logged on an event of my own (event_id – "Loggade gåvor", see gift_events above).
--    These are never shown on the list – only to the people who share the gift.
-- One person can be in at most one gift per wish – checked in gift-routes.js.
CREATE TABLE gifts (
    id          SERIAL PRIMARY KEY,
    wish_id     INT REFERENCES wishes(id) ON DELETE CASCADE,
    list_id     INT REFERENCES lists(id) ON DELETE CASCADE,
    santa_id    INT, -- REFERENCES secret_santas – the foreign key is added after that table, below
    created_by  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quantity    INT NOT NULL CHECK (quantity BETWEEN 1 AND 99),
    title       TEXT NOT NULL,
    price       NUMERIC(10, 2) CHECK (price >= 0),
    comment     TEXT,
    split       TEXT NOT NULL DEFAULT 'equal' CHECK (split IN ('equal', 'custom')),
    event_id    INT REFERENCES gift_events(id), -- a logged gift: the event of my own it belongs to
    gift_date   DATE, -- only a gift from a wish profile: when it's to be given (the profile has no date)
    description TEXT,
    url         TEXT,
    image_url   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Exactly one link: a wish, a list, a Secret Santa or an event of my own
    -- A reservation may also belong to a Secret Santa (a wish on the receiver's wish profile) – then no own date
    CONSTRAINT gifts_one_link CHECK (
        (wish_id IS NOT NULL AND list_id IS NULL AND event_id IS NULL
            AND description IS NULL AND url IS NULL AND image_url IS NULL
            AND (santa_id IS NULL OR gift_date IS NULL))
        OR (wish_id IS NULL AND gift_date IS NULL AND num_nonnulls(list_id, santa_id, event_id) = 1)
    )
);
CREATE INDEX gifts_wish_idx ON gifts (wish_id);
CREATE INDEX gifts_created_by_idx ON gifts (created_by);
CREATE INDEX gifts_list_idx ON gifts (list_id);
CREATE INDEX gifts_event_idx ON gifts (event_id);

-- Everyone who shares a gift – all with the same rights to it. amount is only used when split = 'custom'.
CREATE TABLE gift_members (
    gift_id INT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount  NUMERIC(10, 2) CHECK (amount >= 0),
    PRIMARY KEY (gift_id, user_id)
);
CREATE INDEX gift_members_user_idx ON gift_members (user_id);

-- Secret Santa: deltagare i en grupp lottas till varandra. Bara givaren får veta sin mottagare.
CREATE TABLE secret_santas (
    id         SERIAL PRIMARY KEY,
    group_id   INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    title      TEXT NOT NULL CHECK (length(trim(title)) > 0),
    event_date DATE NOT NULL,
    budget     NUMERIC(10, 2) CHECK (budget IS NULL OR budget >= 0),
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX secret_santas_group_idx ON secret_santas (group_id);

CREATE TABLE secret_santa_pairs (
    santa_id    INT NOT NULL REFERENCES secret_santas(id) ON DELETE CASCADE,
    giver_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (santa_id, giver_id),
    UNIQUE (santa_id, receiver_id),
    CHECK (giver_id <> receiver_id)
);
CREATE INDEX secret_santa_pairs_giver_idx ON secret_santa_pairs (giver_id);

-- A gift can belong to a Secret Santa (see gifts above). Deleted together with the draw.
ALTER TABLE gifts ADD CONSTRAINT gifts_santa_fk FOREIGN KEY (santa_id) REFERENCES secret_santas(id) ON DELETE CASCADE;
CREATE INDEX gifts_santa_idx ON gifts (santa_id);


-- ---------- Gåvor överlever att det de hör till raderas (migrationerna 018 och 019) ----------
-- Innan en lista, önskning eller Secret Santa raderas flyttas dess gåvor till en ny händelse (gift_events) –
-- en per köpare, med namn, datum och mottagare; önskningens beskrivning, länk och bild följer med.
-- Raderas en mottagare: "Okänd mottagare". En händelse utan gåvor raderas.

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

-- En Secret Santa raderas: varje givares gåvor blir en händelse till den hen lottades till
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

-- En användare raderas: reservationer på hens önskeprofil blir händelser med "Okänd mottagare",
-- och händelser till hen får "Okänd mottagare" (recipient_id blir NULL via ON DELETE SET NULL)
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

CREATE TRIGGER lists_keep_gifts BEFORE DELETE ON lists
    FOR EACH ROW EXECUTE FUNCTION wrappd_keep_gifts_of_list();
CREATE TRIGGER wishes_keep_gifts BEFORE DELETE ON wishes
    FOR EACH ROW EXECUTE FUNCTION wrappd_keep_gifts_of_wish();
CREATE TRIGGER secret_santas_keep_gifts BEFORE DELETE ON secret_santas
    FOR EACH ROW EXECUTE FUNCTION wrappd_keep_gifts_of_santa();
CREATE TRIGGER users_mark_unknown_recipient BEFORE DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION wrappd_mark_unknown_recipient();
