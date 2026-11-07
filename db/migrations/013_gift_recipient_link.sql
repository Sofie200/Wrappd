-- Migrering 013: överraskningsgåvor kan kopplas till en användare
-- En gåva utan lista och utan Secret Santa har sedan tidigare en fritext (recipient) och ett datum.
-- Fritexten används nu som händelsens namn ("Farmors 80-årsdag"). Vem gåvan är till kan dessutom
-- kopplas till en riktig användare i mina grupper (recipient_id) – en koppling, inte fritext.
-- Personen ser aldrig gåvan; bara de som delar på den gör det.
-- Kör EN gång, efter 012_santa_gifts.sql.

ALTER TABLE gifts ADD COLUMN recipient_id INT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX gifts_recipient_idx ON gifts (recipient_id);

-- Bara för gåvor utan lista och Secret Santa (de har redan en mottagare)
ALTER TABLE gifts ADD CONSTRAINT gifts_recipient_only_free CHECK (
    recipient_id IS NULL OR (wish_id IS NULL AND list_id IS NULL AND santa_id IS NULL)
);
