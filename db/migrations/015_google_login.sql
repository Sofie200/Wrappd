-- Migrering 015: logga in med Google
-- google_sub är Googles fasta id för kontot ("sub" i Googles token). Det ändras aldrig, till skillnad från e-posten.
-- Ett Google-konto kan bara höra till en användare. Barn kan inte logga in och har därför inget.
-- Kör EN gång, efter 014_user_email.sql.

ALTER TABLE users ADD COLUMN google_sub TEXT UNIQUE;

ALTER TABLE users ADD CONSTRAINT users_child_has_no_google CHECK (NOT is_child OR google_sub IS NULL);
