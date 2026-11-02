-- Migrering 005: profilikon
-- Varje användare väljer en ikon och en färg som visas i stället för namnet i toppmenyn.
-- Tillåtna värden finns också i api/_lib/userSchema.js och frontend/src/profileOptions.js.
-- Kör EN gång, efter 004_free_gifts.sql.

ALTER TABLE users ADD COLUMN avatar_icon TEXT NOT NULL DEFAULT 'user'
    CHECK (avatar_icon IN ('user', 'cat', 'dog', 'rabbit', 'flower'));
ALTER TABLE users ADD COLUMN avatar_color TEXT NOT NULL DEFAULT 'pink'
    CHECK (avatar_color IN ('pink', 'orange', 'green', 'purple', 'blue'));
