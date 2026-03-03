UPDATE servers s
INNER JOIN check_profiles cp_old
  ON cp_old.id = s.check_profile_id
 AND cp_old.name = 'default-a2s'
INNER JOIN check_profiles cp_new
  ON cp_new.name = 'default-tcp'
SET s.check_profile_id = cp_new.id,
    s.updated_at = NOW()
WHERE s.deleted_at IS NULL
  AND (s.game_label IS NULL OR TRIM(s.game_label) = '');
