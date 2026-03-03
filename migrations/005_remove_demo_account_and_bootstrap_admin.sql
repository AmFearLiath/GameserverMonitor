DELETE u
FROM users u
WHERE u.username = 'admin'
  AND u.email = 'admin@gamemonitoring.local';

INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.`key` = 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1
  FROM user_roles ur
  JOIN roles rr ON rr.id = ur.role_id
  WHERE rr.`key` = 'ADMIN'
)
ORDER BY u.created_at ASC
LIMIT 1;