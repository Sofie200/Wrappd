-- Migrering 012: gåvor kopplade till en Secret Santa
-- En gåva utanför önskelistan kan nu också kopplas till en Secret Santa (santa_id) i stället för
-- en lista eller en mottagare i fritext. Mottagaren och datumet hämtas då från lottningen
-- (den jag ska ge till, och dagen). Bara givaren själv kan koppla – och gåvan kan inte delas.
-- Tas lottningen bort tas gåvorna bort också.
-- Kör EN gång, efter 011_wish_profiles.sql.

ALTER TABLE gifts ADD COLUMN santa_id INT REFERENCES secret_santas(id) ON DELETE CASCADE;
CREATE INDEX gifts_santa_idx ON gifts (santa_id);

ALTER TABLE gifts DROP CONSTRAINT gifts_wish_or_free;
ALTER TABLE gifts ADD CONSTRAINT gifts_wish_or_free CHECK (
    (wish_id IS NOT NULL AND list_id IS NULL AND santa_id IS NULL AND recipient IS NULL AND gift_date IS NULL
        AND description IS NULL AND url IS NULL AND image_url IS NULL)
    OR (wish_id IS NULL AND list_id IS NOT NULL AND santa_id IS NULL AND recipient IS NULL AND gift_date IS NULL)
    OR (wish_id IS NULL AND list_id IS NULL AND santa_id IS NOT NULL AND recipient IS NULL AND gift_date IS NULL)
    OR (wish_id IS NULL AND list_id IS NULL AND santa_id IS NULL AND recipient IS NOT NULL AND gift_date IS NOT NULL)
);
