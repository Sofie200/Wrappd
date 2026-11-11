-- Migrering 017: gåvor från en önskeprofil får ett datum
-- En önskning på någons önskeprofil hör inte till någon lista och har därför inget datum. Gåvan får nu
-- ett eget datum (gift_date) – när den ska ges – som appen kräver när man reserverar. Regeln nedan tillåter
-- därför gift_date på gåvor som reserverats från en önskning (förut: alltid NULL där).
-- Befintliga gåvor från önskeprofiler har inget datum; det fylls i när gåvan sparas nästa gång.
-- Kör EN gång, efter 016_email_verified.sql.

ALTER TABLE gifts DROP CONSTRAINT gifts_wish_or_free;
ALTER TABLE gifts ADD CONSTRAINT gifts_wish_or_free CHECK (
    (wish_id IS NOT NULL AND list_id IS NULL AND santa_id IS NULL AND recipient IS NULL
        AND description IS NULL AND url IS NULL AND image_url IS NULL)
    OR (wish_id IS NULL AND list_id IS NOT NULL AND santa_id IS NULL AND recipient IS NULL AND gift_date IS NULL)
    OR (wish_id IS NULL AND list_id IS NULL AND santa_id IS NOT NULL AND recipient IS NULL AND gift_date IS NULL)
    OR (wish_id IS NULL AND list_id IS NULL AND santa_id IS NULL AND recipient IS NOT NULL AND gift_date IS NOT NULL)
);
