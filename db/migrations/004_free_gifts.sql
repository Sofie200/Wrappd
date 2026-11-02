-- Migrering 004: gåvor utanför önskelistan
-- Man kan spara gåvor man köpt som inte står på någon önskelista. De har egen titel, beskrivning,
-- länk och bild, och är antingen kopplade till en lista (list_id) eller har en mottagare i fritext
-- och ett datum. De visas aldrig på listan – bara för dem som delar på gåvan.
-- Kör EN gång, efter 003_gifts.sql.

ALTER TABLE gifts ALTER COLUMN wish_id DROP NOT NULL;
ALTER TABLE gifts ADD COLUMN list_id INT REFERENCES lists(id) ON DELETE CASCADE;
ALTER TABLE gifts ADD COLUMN recipient TEXT;
ALTER TABLE gifts ADD COLUMN gift_date DATE;
ALTER TABLE gifts ADD COLUMN description TEXT;
ALTER TABLE gifts ADD COLUMN url TEXT;
ALTER TABLE gifts ADD COLUMN image_url TEXT;
CREATE INDEX gifts_list_idx ON gifts (list_id);

-- En gåva är ANTINGEN reserverad på en önskning (allt annat hämtas från önskningen),
-- ELLER köpt utanför listan: kopplad till en lista, eller med mottagare och datum.
ALTER TABLE gifts ADD CONSTRAINT gifts_wish_or_free CHECK (
    (wish_id IS NOT NULL AND list_id IS NULL AND recipient IS NULL AND gift_date IS NULL
        AND description IS NULL AND url IS NULL AND image_url IS NULL)
    OR (wish_id IS NULL AND list_id IS NOT NULL AND recipient IS NULL AND gift_date IS NULL)
    OR (wish_id IS NULL AND list_id IS NULL AND recipient IS NOT NULL AND gift_date IS NOT NULL)
);
