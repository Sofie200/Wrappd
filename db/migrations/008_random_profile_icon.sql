-- Migrering 008: nya användare får en slumpad profilikon och färg
-- Gäller alla sätt att skapa användare (registrering, admin-skapade, barn), eftersom det är
-- kolumnernas standardvärde. Kör EN gång, efter 007_profile_icons_update.sql.

ALTER TABLE users ALTER COLUMN avatar_icon SET DEFAULT
    (ARRAY['user', 'cat', 'snail', 'bug', 'bird', 'ghost', 'banana',
           'hand-metal', 'citrus', 'lollipop', 'coffee', 'squirrel', 'sun', 'germ'])[floor(random() * 14)::int + 1];

ALTER TABLE users ALTER COLUMN avatar_color SET DEFAULT
    (ARRAY['pink', 'orange', 'green', 'purple', 'blue'])[floor(random() * 5)::int + 1];
