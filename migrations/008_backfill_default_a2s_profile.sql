UPDATE servers s
INNER JOIN check_profiles cp_old
  ON cp_old.id = s.check_profile_id
 AND cp_old.name = 'default-tcp'
INNER JOIN check_profiles cp_new
  ON cp_new.name = 'default-a2s'
SET s.check_profile_id = cp_new.id,
    s.updated_at = CURRENT_TIMESTAMP
WHERE s.deleted_at IS NULL
  AND s.panel_id IS NOT NULL;
