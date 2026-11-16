-- Migrering 022: dela en publicerad lista med en hemlig länk (wrappd.se/s/<token>)
-- En listadmin kan skapa en länk som visar listans önskningar och om de är lediga eller reserverade –
-- för alla som har länken, även utan att vara inloggad. Reservera kan man bara inloggad, i listans grupper.
-- share_token är NULL när listan inte delas. En ny länk ersätter den gamla (den gamla slutar fungera).
-- Kör EN gång, efter 021_profile_gifts_on_events.sql.

ALTER TABLE lists ADD COLUMN share_token TEXT UNIQUE;
