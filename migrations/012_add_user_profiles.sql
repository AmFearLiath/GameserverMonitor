CREATE TABLE IF NOT EXISTS user_profiles (
  user_id CHAR(36) NOT NULL,
  display_name VARCHAR(191) NULL,
  avatar_url VARCHAR(512) NULL,
  timezone VARCHAR(64) NULL,
  locale VARCHAR(16) NULL,
  ptero_client_api_key TEXT NULL,
  settings_json JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
