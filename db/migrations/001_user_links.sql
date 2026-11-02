-- Migrering 001: användare skapade av gruppadmins + engångslänkar (aktivera konto / återställ lösenord)
-- Kör EN gång i Neons SQL-editor, i en databas som skapades med det gamla schema.sql.
-- (Nya databaser behöver inte detta – schema.sql innehåller redan allt.)

-- NULL = kontot är skapat av en admin men personen har inte valt lösenord än
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN created_by INT REFERENCES users(id) ON DELETE SET NULL;

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
