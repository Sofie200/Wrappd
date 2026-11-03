-- Migrering 011: önskeprofiler
-- Varje användare (och varje barn, via föräldrarna) har en önskeprofil:
--   - fritext om vad man gillar/inte gillar (wish_about)
--   - kategorier man gillar (likes) och inte gillar (dislikes) – nycklarna finns i
--     api/_lib/profileSchema.js och frontend/src/wishCategories.js
--   - personliga önskningar: vanliga önskningar som hör till en person i stället för en lista.
--     De kan reserveras (blir gåvor) – personen själv ser aldrig vad som är reserverat.
-- Kör EN gång, efter 010_secret_santa.sql.

ALTER TABLE users ADD COLUMN wish_about TEXT;
ALTER TABLE users ADD COLUMN likes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN dislikes TEXT[] NOT NULL DEFAULT '{}';

-- En önskning hör till EN lista eller EN person
ALTER TABLE wishes ALTER COLUMN list_id DROP NOT NULL;
ALTER TABLE wishes ADD COLUMN user_id INT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE wishes ADD CONSTRAINT wishes_list_or_person CHECK ((list_id IS NULL) <> (user_id IS NULL));
CREATE INDEX wishes_user_idx ON wishes (user_id);
