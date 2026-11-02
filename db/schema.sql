-- Wrappd – databasschema
-- Kör hela filen i Neons SQL-editor (eller med psql) i en tom databas.

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
    username      TEXT NOT NULL UNIQUE CHECK (username = lower(username)),
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- En grupp kan inte raderas, så inga ON DELETE-regler behövs för grupper
CREATE TABLE groups (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
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

CREATE TABLE wishes (
    id          SERIAL PRIMARY KEY,
    list_id     INT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    title       TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT,
    price       NUMERIC(10, 2) CHECK (price >= 0),
    url         TEXT,
    image_url   TEXT,
    quantity    INT NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wishes_list_idx ON wishes (list_id);

-- En reservation per person och önskning. Personen väljer hur många exemplar hen tar.
CREATE TABLE reservations (
    id         SERIAL PRIMARY KEY,
    wish_id    INT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quantity   INT NOT NULL CHECK (quantity BETWEEN 1 AND 99),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (wish_id, user_id)
);
CREATE INDEX reservations_user_idx ON reservations (user_id);
