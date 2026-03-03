CREATE TABLE IF NOT EXISTS check_adapters (
  id CHAR(36) NOT NULL,
  `key` VARCHAR(128) NOT NULL,
  name VARCHAR(191) NOT NULL,
  description TEXT NULL,
  category ENUM('PORT', 'HTTP', 'GAMEQUERY', 'CUSTOM') NOT NULL,
  capabilities JSON NOT NULL,
  endpoint_requirements JSON NOT NULL,
  config_schema JSON NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_check_adapters_key (`key`),
  KEY idx_check_adapters_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS check_profiles (
  id CHAR(36) NOT NULL,
  name VARCHAR(191) NOT NULL,
  description TEXT NULL,
  rules JSON NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_check_profiles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS server_checks_1m (
  id CHAR(36) NOT NULL,
  server_id CHAR(36) NOT NULL,
  bucket_start DATETIME NOT NULL,
  total_checks INT NOT NULL,
  ok_checks INT NOT NULL,
  fail_checks INT NOT NULL,
  uptime_ratio DECIMAL(5,4) NOT NULL,
  rtt_avg_ms INT NULL,
  rtt_max_ms INT NULL,
  players_avg DECIMAL(8,2) NULL,
  players_max INT NULL,
  max_players_last INT NULL,
  version_last VARCHAR(191) NULL,
  server_name_last VARCHAR(191) NULL,
  meta_last JSON NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_server_checks_1m_server_bucket (server_id, bucket_start),
  KEY idx_server_checks_1m_bucket_start (bucket_start),
  CONSTRAINT fk_server_checks_1m_server FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incidents (
  id CHAR(36) NOT NULL,
  server_id CHAR(36) NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  duration_seconds INT NULL,
  start_status ENUM('ONLINE', 'OFFLINE', 'TRANSITION', 'MAINTENANCE') NOT NULL,
  end_status ENUM('ONLINE', 'OFFLINE', 'TRANSITION', 'MAINTENANCE') NULL,
  reason_code VARCHAR(191) NOT NULL,
  reason_source ENUM('PTERO', 'QUERY', 'ADAPTER', 'SYSTEM') NULL,
  reason_meta JSON NULL,
  open_incident_guard TINYINT GENERATED ALWAYS AS (CASE WHEN ended_at IS NULL THEN 1 ELSE NULL END) VIRTUAL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_incidents_server_started_at (server_id, started_at),
  KEY idx_incidents_ended_at (ended_at),
  KEY idx_incidents_reason_code (reason_code),
  UNIQUE KEY uq_incidents_server_open (server_id, open_incident_guard),
  CONSTRAINT fk_incidents_server FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alert_channels (
  id CHAR(36) NOT NULL,
  type ENUM('DISCORD_WEBHOOK', 'EMAIL_SMTP') NOT NULL,
  name VARCHAR(191) NOT NULL,
  config_enc TEXT NOT NULL,
  config_kid VARCHAR(64) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_alert_channels_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alert_policies (
  id CHAR(36) NOT NULL,
  name VARCHAR(191) NOT NULL,
  cooldown_seconds INT NOT NULL DEFAULT 300,
  notify_on JSON NOT NULL,
  roles_to_notify JSON NULL,
  channel_ids JSON NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alert_policies_name (name),
  KEY idx_alert_policies_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alert_events (
  id CHAR(36) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  server_id CHAR(36) NOT NULL,
  incident_id CHAR(36) NULL,
  policy_id CHAR(36) NOT NULL,
  channel_id CHAR(36) NOT NULL,
  event_type ENUM('STATE_CHANGE_OFFLINE', 'STATE_CHANGE_ONLINE') NOT NULL,
  status_from ENUM('ONLINE', 'OFFLINE', 'TRANSITION', 'MAINTENANCE') NULL,
  status_to ENUM('ONLINE', 'OFFLINE', 'TRANSITION', 'MAINTENANCE') NULL,
  reason_code VARCHAR(191) NULL,
  reason_source ENUM('PTERO', 'QUERY', 'ADAPTER', 'SYSTEM') NULL,
  suppressed_reason ENUM(
    'ALERT_SUPPRESSION_SERVER_DISABLED',
    'ALERT_SUPPRESSION_POLICY_DISABLED',
    'ALERT_SUPPRESSION_CHANNEL_DISABLED',
    'ALERT_SUPPRESSION_MAINTENANCE_MODE',
    'ALERT_SUPPRESSION_POLICY_FILTERED',
    'ALERT_SUPPRESSION_COOLDOWN',
    'ALERT_SUPPRESSION_DUPLICATE',
    'ALERT_SUPPRESSION_DISPATCH_ERROR',
    'ALERT_SUPPRESSION_RATE_LIMITED'
  ) NULL,
  payload_summary JSON NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  last_error_code VARCHAR(191) NULL,
  last_error_detail TEXT NULL,
  was_sent TINYINT(1) NOT NULL DEFAULT 0,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alert_events_idempotency_key (idempotency_key),
  KEY idx_alert_events_server_created (server_id, created_at),
  KEY idx_alert_events_policy_type_sent (policy_id, event_type, sent_at),
  KEY idx_alert_events_suppressed_reason (suppressed_reason),
  CONSTRAINT fk_alert_events_server FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
  CONSTRAINT fk_alert_events_incident FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE SET NULL,
  CONSTRAINT fk_alert_events_policy FOREIGN KEY (policy_id) REFERENCES alert_policies (id) ON DELETE CASCADE,
  CONSTRAINT fk_alert_events_channel FOREIGN KEY (channel_id) REFERENCES alert_channels (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE servers
  ADD INDEX idx_servers_check_profile_id (check_profile_id),
  ADD CONSTRAINT fk_servers_check_profile FOREIGN KEY (check_profile_id) REFERENCES check_profiles (id) ON DELETE SET NULL;
