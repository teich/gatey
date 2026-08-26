-- Gatey system administrators administer households globally. They are only
-- residents of the initial household unless explicitly added later.
DELETE FROM member
WHERE organizationId != 'oren-home'
  AND userId IN (
    SELECT id
    FROM user
    WHERE ',' || coalesce(role, '') || ',' LIKE '%,admin,%'
  );
