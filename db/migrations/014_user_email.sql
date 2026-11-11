-- Migrering 014: e-postadress på användare
-- Valfri (NULL) eftersom befintliga användare saknar e-post. Sparas alltid i gemener och är unik.
-- Barn kan inte logga in och har därför ingen e-post.
-- Kör EN gång, efter 013_gift_recipient_link.sql.

ALTER TABLE users ADD COLUMN email TEXT UNIQUE CHECK (email = lower(email));

ALTER TABLE users ADD CONSTRAINT users_child_has_no_email CHECK (NOT is_child OR email IS NULL);
