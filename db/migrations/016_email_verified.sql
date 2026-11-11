-- Migrering 016: är e-posten bekräftad?
-- En e-post som någon skriver in själv vid registrering är inte kontrollerad – vem som helst kan skriva vilken adress som helst.
-- Bara en bekräftad e-post (från Google) får användas för att koppla ihop ett Google-konto med ett befintligt konto.
-- Kör EN gång, efter 015_google_login.sql.

ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;

-- Användare som redan loggat in med Google har fått sin e-post därifrån
UPDATE users SET email_verified = true WHERE google_sub IS NOT NULL AND email IS NOT NULL;
