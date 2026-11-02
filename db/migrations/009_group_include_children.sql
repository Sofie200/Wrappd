-- Migrering 009: barn i grupper styrs av gruppen
-- En grupp har "Inkludera barn" (include_children):
--   - På: ALLA medlemmars barn är automatiskt med i gruppen.
--   - Av: inga barn kan vara med.
-- Ett barn är aldrig med i en grupp där ingen av dess föräldrar är med.
-- Appen håller detta i synk (api/_lib/childGroups.js). Kör EN gång, efter 008_random_profile_icon.sql.

ALTER TABLE groups ADD COLUMN include_children BOOLEAN NOT NULL DEFAULT false;

-- Grupper som redan har barn behåller dem: de får flaggan påslagen
UPDATE groups g SET include_children = true
WHERE EXISTS (SELECT 1 FROM group_members gm JOIN users u ON u.id = gm.user_id
              WHERE gm.group_id = g.id AND u.is_child);

-- Barn som är med i en grupp utan någon förälder tas bort
DELETE FROM group_members gm
USING users u
WHERE gm.user_id = u.id AND u.is_child
  AND NOT EXISTS (SELECT 1 FROM child_parents cp
                  JOIN group_members pm ON pm.user_id = cp.parent_id AND pm.group_id = gm.group_id
                  WHERE cp.child_id = u.id);

-- Alla medlemmars barn läggs till i grupper med flaggan påslagen
INSERT INTO group_members (group_id, user_id)
SELECT DISTINCT gm.group_id, cp.child_id
FROM group_members gm
JOIN groups g ON g.id = gm.group_id AND g.include_children
JOIN child_parents cp ON cp.parent_id = gm.user_id
ON CONFLICT DO NOTHING;
