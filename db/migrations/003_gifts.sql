-- Migrering 003: reservationer blir gåvor (gifts)
-- En gåva skapas när någon reserverar en önskning. Den har en egen kopia av titeln och ett eget pris
-- (det man faktiskt betalade, totalt), en kommentar, och kan delas mellan flera personer –
-- lika eller med egna belopp. Alla som delar på en gåva har samma rättigheter till den.
-- Kör EN gång, efter 002_children.sql. Befintliga reservationer blir gåvor med en person.

-- 1. reservations → gifts. user_id blir created_by (vem som skapade den – visas inte för någon).
ALTER TABLE reservations RENAME TO gifts;
ALTER SEQUENCE reservations_id_seq RENAME TO gifts_id_seq;
ALTER TABLE gifts RENAME CONSTRAINT reservations_pkey TO gifts_pkey;
ALTER TABLE gifts RENAME CONSTRAINT reservations_quantity_check TO gifts_quantity_check;
ALTER TABLE gifts RENAME CONSTRAINT reservations_wish_id_fkey TO gifts_wish_id_fkey;
ALTER TABLE gifts RENAME CONSTRAINT reservations_user_id_fkey TO gifts_created_by_fkey;
ALTER TABLE gifts RENAME COLUMN user_id TO created_by;
ALTER INDEX reservations_user_idx RENAME TO gifts_created_by_idx;
-- "En person per önskning" kontrolleras nu i backend, via gift_members
ALTER TABLE gifts DROP CONSTRAINT reservations_wish_id_user_id_key;
CREATE INDEX gifts_wish_idx ON gifts (wish_id);

-- 2. Gåvans egna uppgifter. Priset är TOTALT (alla exemplar), från början önskningens pris × antal.
ALTER TABLE gifts ADD COLUMN title TEXT;
ALTER TABLE gifts ADD COLUMN price NUMERIC(10, 2) CHECK (price >= 0);
ALTER TABLE gifts ADD COLUMN comment TEXT;
ALTER TABLE gifts ADD COLUMN split TEXT NOT NULL DEFAULT 'equal' CHECK (split IN ('equal', 'custom'));

UPDATE gifts g SET title = w.title, price = w.price * g.quantity
FROM wishes w WHERE w.id = g.wish_id;

ALTER TABLE gifts ALTER COLUMN title SET NOT NULL;

-- 3. Vilka som delar på gåvan. amount används bara när split = 'custom'.
CREATE TABLE gift_members (
    gift_id INT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount  NUMERIC(10, 2) CHECK (amount >= 0),
    PRIMARY KEY (gift_id, user_id)
);
CREATE INDEX gift_members_user_idx ON gift_members (user_id);

INSERT INTO gift_members (gift_id, user_id) SELECT id, created_by FROM gifts;
