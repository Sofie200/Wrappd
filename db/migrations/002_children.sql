-- Migrering 002: barn
-- Barn finns i users-tabellen så att de kan vara mottagare av listor, men de kan aldrig logga in:
-- de har varken användarnamn eller lösenord. Varje barn har 1–2 föräldrar.
-- Kör EN gång, efter 001_user_links.sql. (Nya databaser behöver inte detta – schema.sql innehåller allt.)

ALTER TABLE users ADD COLUMN is_child BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ALTER COLUMN username DROP NOT NULL;

-- Vuxna måste ha användarnamn. Barn har aldrig användarnamn eller lösenord.
ALTER TABLE users ADD CONSTRAINT users_adult_has_username CHECK (is_child OR username IS NOT NULL);
ALTER TABLE users ADD CONSTRAINT users_child_cannot_log_in CHECK (NOT is_child OR (username IS NULL AND password_hash IS NULL));

-- Högst två föräldrar per barn kontrolleras i backend (children-routes.js)
CREATE TABLE child_parents (
    child_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (child_id, parent_id),
    CHECK (child_id <> parent_id)
);
CREATE INDEX child_parents_parent_idx ON child_parents (parent_id);
