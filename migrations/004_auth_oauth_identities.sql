CREATE TABLE IF NOT EXISTS user_oauth_identities (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  provider ENUM('DISCORD') NOT NULL,
  provider_user_id VARCHAR(191) NOT NULL,
  username_snapshot VARCHAR(191) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_oauth_provider_user (provider, provider_user_id),
  KEY idx_user_oauth_user_id (user_id),
  CONSTRAINT fk_user_oauth_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;