-- Migrering 006: fler profilikoner
-- Nio nya ikoner att välja mellan. Tillåtna värden finns också i api/_lib/userSchema.js
-- och frontend/src/profileOptions.js. Kör EN gång, efter 005_profile_icon.sql.

ALTER TABLE users DROP CONSTRAINT users_avatar_icon_check;
ALTER TABLE users ADD CONSTRAINT users_avatar_icon_check
    CHECK (avatar_icon IN ('user', 'cat', 'dog', 'rabbit', 'flower', 'snail', 'bug', 'bird', 'ghost', 'banana', 'hand-metal', 'citrus', 'lollipop', 'coffee'));
