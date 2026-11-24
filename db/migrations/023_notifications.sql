-- Migrering 023: notiser (klockan uppe till höger)
-- En rad per mottagare och händelse. Vad notisen gäller pekar på sin rad (grupp, lista, Secret Santa,
-- gåva, person) och försvinner med den (ON DELETE CASCADE). Det som inte finns kvar att peka på
-- (t.ex. titeln på en borttagen önskning) sparas i data.
--   type: group_added, group_admin, list_new, list_admin, list_wishes, list_reserved, santa_new,
--         santa_wish, wish_changed, wish_deleted, gift_shared, invite_accepted
--   data: t.ex. { "admin": true } (sammanslagen med ny grupp/lista), { "count": 3 }, { "wishTitle": "…" }
-- Kör EN gång, efter 022_list_share_token.sql.

CREATE TABLE notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    actor_id   INT REFERENCES users(id) ON DELETE SET NULL,  -- vem som gjorde det (visas med namn)
    group_id   INT REFERENCES groups(id) ON DELETE CASCADE,
    list_id    INT REFERENCES lists(id) ON DELETE CASCADE,
    santa_id   INT REFERENCES secret_santas(id) ON DELETE CASCADE,
    gift_id    INT REFERENCES gifts(id) ON DELETE CASCADE,
    person_id  INT REFERENCES users(id) ON DELETE CASCADE,   -- vems önskeprofil / vem som accepterade
    data       JSONB NOT NULL DEFAULT '{}',
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
-- Olästa per mottagare - räknaren på klockan, och sammanslagningen av liknande notiser
CREATE INDEX notifications_unread_idx ON notifications (user_id, type) WHERE read_at IS NULL;
