CREATE TABLE IF NOT EXISTS server_hoster_presets (
  id CHAR(36) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  hoster ENUM('GENERIC', 'GPORTAL', 'NITRADO', 'SHOCKBYTE', 'APEX', 'BISECT', 'HOSTHAVOC', 'SURVIVAL_SERVERS') NOT NULL DEFAULT 'GENERIC',
  protocol ENUM('TCP', 'UDP') NOT NULL DEFAULT 'UDP',
  query_port_mode ENUM('SAME_AS_GAME', 'MANUAL_OPTIONAL', 'DISABLED') NOT NULL DEFAULT 'SAME_AS_GAME',
  prefer_a2s TINYINT(1) NOT NULL DEFAULT 0,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_server_hoster_presets_key (`key`),
  KEY idx_server_hoster_presets_hoster (hoster),
  KEY idx_server_hoster_presets_is_system (is_system)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
