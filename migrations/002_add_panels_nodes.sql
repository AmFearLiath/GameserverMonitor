CREATE TABLE IF NOT EXISTS panels (
  id CHAR(36) NOT NULL,
  name VARCHAR(191) NOT NULL,
  base_url VARCHAR(255) NOT NULL,
  api_key_enc TEXT NOT NULL,
  api_key_kid VARCHAR(64) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  import_mode ENUM('ALL', 'WHITELIST') NOT NULL DEFAULT 'ALL',
  import_filter JSON NULL,
  last_sync_at DATETIME NULL,
  sync_status ENUM('OK', 'DEGRADED', 'ERROR') NOT NULL DEFAULT 'OK',
  sync_error_code VARCHAR(191) NULL,
  sync_error_detail TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_panels_name (name),
  KEY idx_panels_is_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nodes (
  id CHAR(36) NOT NULL,
  panel_id CHAR(36) NOT NULL,
  ptero_node_id VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  fqdn_or_ip VARCHAR(255) NULL,
  location VARCHAR(191) NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_nodes_panel_ptero_node_id (panel_id, ptero_node_id),
  KEY idx_nodes_panel_id (panel_id),
  CONSTRAINT fk_nodes_panel FOREIGN KEY (panel_id) REFERENCES panels (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE servers
  ADD INDEX idx_servers_panel_id (panel_id),
  ADD INDEX idx_servers_node_id (node_id);

ALTER TABLE servers
  ADD CONSTRAINT fk_servers_panel FOREIGN KEY (panel_id) REFERENCES panels (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_servers_node FOREIGN KEY (node_id) REFERENCES nodes (id) ON DELETE SET NULL;