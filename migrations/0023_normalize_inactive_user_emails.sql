UPDATE users
SET email = 'inactive' || (
      SELECT COUNT(*)
      FROM users AS inactive_users
      WHERE inactive_users.status = 'INACTIVE'
        AND inactive_users.id <= users.id
    ) || '@polarcanvas.com',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'INACTIVE';
