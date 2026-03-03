CREATE TABLE IF NOT EXISTS servers (
  id CHAR(36) NOT NULL,
  panel_id CHAR(36) NULL,
  node_id CHAR(36) NULL,
  ptero_server_id VARCHAR(191) NOT NULL,
  identifier VARCHAR(191) NULL,
  name VARCHAR(191) NOT NULL,
  description TEXT NULL,
  game_label VARCHAR(191) NULL,
  check_profile_id CHAR(36) NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  maintenance_mode TINYINT(1) NOT NULL DEFAULT 0,
  maintenance_note TEXT NULL,
  ptero_raw_state VARCHAR(64) NOT NULL DEFAULT 'unknown',
  normalized_status ENUM('ONLINE', 'OFFLINE', 'TRANSITION', 'MAINTENANCE') NOT NULL DEFAULT 'TRANSITION',
  last_reason_code VARCHAR(191) NULL,
  last_reason_source ENUM('PTERO', 'QUERY', 'ADAPTER', 'SYSTEM') NULL,
  last_reason_meta JSON NULL,
  last_status_change_at DATETIME NULL,
  last_online_at DATETIME NULL,
  last_offline_at DATETIME NULL,
  last_check_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_servers_ptero (panel_id, ptero_server_id),
  KEY idx_servers_status (normalized_status),
  KEY idx_servers_reason (last_reason_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS endpoints (
  id CHAR(36) NOT NULL,
  server_id CHAR(36) NOT NULL,
  source ENUM('PTERO_ALLOCATION', 'MANUAL') NOT NULL,
  label VARCHAR(191) NOT NULL,
  host VARCHAR(191) NOT NULL,
  port INT NOT NULL,
  protocol ENUM('TCP', 'UDP', 'HTTP', 'HTTPS') NOT NULL,
  purpose ENUM('GAME', 'QUERY', 'HTTP', 'RCON', 'OTHER') NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  meta JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_endpoints_server_host_port_protocol (server_id, host, port, protocol),
  KEY idx_endpoints_server (server_id),
  KEY idx_endpoints_purpose (purpose),
  CONSTRAINT fk_endpoints_server FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
  CONSTRAINT chk_endpoints_port CHECK (port >= 1 AND port <= 65535)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  username VARCHAR(191) NOT NULL,
  email VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) NOT NULL,
  `key` VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tags (
  id CHAR(36) NOT NULL,
  `key` VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  color VARCHAR(32) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tags_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS server_tags (
  server_id CHAR(36) NOT NULL,
  tag_id CHAR(36) NOT NULL,
  PRIMARY KEY (server_id, tag_id),
  CONSTRAINT fk_server_tags_server FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
  CONSTRAINT fk_server_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;