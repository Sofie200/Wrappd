-- Migrering 010: Secret Santa
-- Någon i en grupp väljer datum och deltagare. Varje deltagare lottas till en annan deltagare.
-- Bara deltagaren själv får veta vem hen ska ge till (API:t skickar aldrig andras par).
-- Kör EN gång, efter 009_group_include_children.sql.

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

-- Vem ger till vem. Varje deltagare ger exakt en gåva och får exakt en, aldrig till sig själv.
CREATE TABLE secret_santa_pairs (
    santa_id    INT NOT NULL REFERENCES secret_santas(id) ON DELETE CASCADE,
    giver_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (santa_id, giver_id),
    UNIQUE (santa_id, receiver_id),
    CHECK (giver_id <> receiver_id)
);
CREATE INDEX secret_santa_pairs_giver_idx ON secret_santa_pairs (giver_id);
