-- Migrering 007: byter ut några profilikoner
-- Borttagna: flower, dog, rabbit (de som hade dem får "user"). Nya: squirrel, sun, germ.
-- Tillåtna värden finns också i api/_lib/userSchema.js och frontend/src/profileOptions.js.
-- Kör EN gång, efter 006_more_profile_icons.sql.

ALTER TABLE users DROP CONSTRAINT users_avatar_icon_check;
UPDATE users SET avatar_icon = 'user' WHERE avatar_icon IN ('flower', 'dog', 'rabbit');
ALTER TABLE users ADD CONSTRAINT users_avatar_icon_check
    CHECK (avatar_icon IN ('user', 'cat', 'snail', 'bug', 'bird', 'ghost', 'banana', 'hand-metal', 'citrus', 'lollipop', 'coffee', 'squirrel', 'sun', 'germ'));
