CREATE TABLE IF NOT EXISTS game_labels (
  id CHAR(36) NOT NULL,
  name VARCHAR(191) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  settings JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_labels_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  id CHAR(36) NOT NULL,
  scope VARCHAR(64) NOT NULL,
  setting_key VARCHAR(191) NOT NULL,
  setting_value_json JSON NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_settings_scope_key (scope, setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;