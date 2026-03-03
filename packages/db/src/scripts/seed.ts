import { randomUUID } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../client.js';
import { createLogger } from '@gm/logger';

const logger = createLogger('db-seed');

const run = async (): Promise<void> => {
  const requestId = randomUUID();
  const pool = getPool();
  const now = new Date();

  const roleAdminId = uuidv4();
  const roleUserId = uuidv4();
  const adapterTcpConnectId = uuidv4();
  const adapterA2sQueryId = uuidv4();
  const checkProfileDefaultId = uuidv4();
  const checkProfileA2sId = uuidv4();

  await pool.query(
    `INSERT INTO roles (id, \`key\`, name, created_at, updated_at)
     VALUES (?, 'ADMIN', 'Administrator', ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = VALUES(updated_at)`,
    [roleAdminId, now, now]
  );

  await pool.query(
    `INSERT INTO roles (id, \`key\`, name, created_at, updated_at)
     VALUES (?, 'USER', 'User', ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = VALUES(updated_at)`,
    [roleUserId, now, now]
  );

  await pool.query(
    `INSERT INTO check_adapters (
      id, \`key\`, name, description, category, capabilities, endpoint_requirements, config_schema, is_enabled, created_at, updated_at
    ) VALUES (?, 'tcp_connect', 'TCP Connect', 'Simple TCP availability check', 'PORT', JSON_OBJECT('supports_rtt_ms', true), JSON_OBJECT('allowed_protocols', JSON_ARRAY('TCP'), 'required_purpose', 'GAME', 'required_meta_keys', JSON_ARRAY()), NULL, 1, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      description = VALUES(description),
      category = VALUES(category),
      capabilities = VALUES(capabilities),
      endpoint_requirements = VALUES(endpoint_requirements),
      is_enabled = VALUES(is_enabled),
      updated_at = VALUES(updated_at)`,
    [adapterTcpConnectId, now, now]
  );

  await pool.query(
    `INSERT INTO check_adapters (
      id, \`key\`, name, description, category, capabilities, endpoint_requirements, config_schema, is_enabled, created_at, updated_at
    ) VALUES (?, 'a2s_query', 'A2S Query', 'Source A2S info query over UDP', 'GAMEQUERY', JSON_OBJECT('supports_rtt_ms', true, 'supports_players', true, 'supports_version', true), JSON_OBJECT('allowed_protocols', JSON_ARRAY('UDP'), 'required_purpose', 'QUERY', 'required_meta_keys', JSON_ARRAY()), NULL, 1, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      description = VALUES(description),
      category = VALUES(category),
      capabilities = VALUES(capabilities),
      endpoint_requirements = VALUES(endpoint_requirements),
      is_enabled = VALUES(is_enabled),
      updated_at = VALUES(updated_at)`,
    [adapterA2sQueryId, now, now]
  );

  const defaultCheckProfileRules = JSON.stringify({
    version: 1,
    name: 'Default TCP',
    checks: [
      {
        adapter_key: 'tcp_connect',
        enabled: true,
        timeout_ms: 1000,
        endpoint_selector: {
          purpose: 'GAME',
          protocol: 'TCP',
          primary_only: true
        }
      }
    ],
    confirm_fail: {
      enabled: false,
      apply_to_primary_only: true
    },
    status_policy: {
      no_endpoint_behavior: 'OFFLINE',
      adapter_config_error_behavior: 'OFFLINE'
    },
    debug: {
      store_raw_payload: false,
      log_reason_codes: true
    }
  });

  await pool.query(
    `INSERT INTO check_profiles (id, name, description, rules, created_at, updated_at)
     VALUES (?, 'default-tcp', 'Default check profile for TCP game endpoints', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       description = VALUES(description),
       rules = VALUES(rules),
       updated_at = VALUES(updated_at)`,
    [checkProfileDefaultId, defaultCheckProfileRules, now, now]
  );

  const defaultA2sProfileRules = JSON.stringify({
    version: 1,
    name: 'Default A2S',
    checks: [
      {
        adapter_key: 'a2s_query',
        enabled: true,
        timeout_ms: 1500,
        endpoint_selector: {
          purpose: 'QUERY',
          protocol: 'UDP',
          primary_only: true
        }
      }
    ],
    confirm_fail: {
      enabled: true,
      delay_ms: 1200,
      recheck_timeout_ms: 1500,
      apply_to_primary_only: true
    },
    status_policy: {
      no_endpoint_behavior: 'OFFLINE',
      adapter_config_error_behavior: 'OFFLINE'
    },
    debug: {
      store_raw_payload: false,
      log_reason_codes: true
    }
  });

  await pool.query(
    `INSERT INTO check_profiles (id, name, description, rules, created_at, updated_at)
     VALUES (?, 'default-a2s', 'Default profile for A2S QUERY endpoints', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       description = VALUES(description),
       rules = VALUES(rules),
       updated_at = VALUES(updated_at)`,
    [checkProfileA2sId, defaultA2sProfileRules, now, now]
  );

  const hosterPresets: Array<{
    key: string;
    name: string;
    hoster: 'GENERIC' | 'GPORTAL' | 'NITRADO' | 'SHOCKBYTE' | 'APEX' | 'BISECT' | 'HOSTHAVOC' | 'SURVIVAL_SERVERS';
    protocol: 'TCP' | 'UDP';
    queryPortMode: 'SAME_AS_GAME' | 'MANUAL_OPTIONAL' | 'DISABLED';
    preferA2s: boolean;
    notes: string;
  }> = [
    {
      key: 'GENERIC_DEFAULT',
      name: 'Generic Default',
      hoster: 'GENERIC',
      protocol: 'UDP',
      queryPortMode: 'SAME_AS_GAME',
      preferA2s: false,
      notes: 'Default fallback for unknown hosters.'
    },
    {
      key: 'GPORTAL_DEFAULT',
      name: 'GPortal Default',
      hoster: 'GPORTAL',
      protocol: 'UDP',
      queryPortMode: 'SAME_AS_GAME',
      preferA2s: true,
      notes: 'Optimized for common GPortal setups with shared game/query port.'
    },
    {
      key: 'NITRADO_DEFAULT',
      name: 'Nitrado Default',
      hoster: 'NITRADO',
      protocol: 'UDP',
      queryPortMode: 'SAME_AS_GAME',
      preferA2s: true,
      notes: 'Optimized for Nitrado UDP and A2S-first monitoring.'
    },
    {
      key: 'SHOCKBYTE_DEFAULT',
      name: 'Shockbyte Default',
      hoster: 'SHOCKBYTE',
      protocol: 'UDP',
      queryPortMode: 'MANUAL_OPTIONAL',
      preferA2s: false,
      notes: 'Common Shockbyte baseline where query port may differ.'
    },
    {
      key: 'APEX_DEFAULT',
      name: 'Apex Hosting Default',
      hoster: 'APEX',
      protocol: 'TCP',
      queryPortMode: 'MANUAL_OPTIONAL',
      preferA2s: false,
      notes: 'Baseline for Apex hosting environments.'
    },
    {
      key: 'BISECT_DEFAULT',
      name: 'BisectHosting Default',
      hoster: 'BISECT',
      protocol: 'UDP',
      queryPortMode: 'MANUAL_OPTIONAL',
      preferA2s: true,
      notes: 'Baseline for BisectHosting managed game servers.'
    },
    {
      key: 'HOSTHAVOC_DEFAULT',
      name: 'HostHavoc Default',
      hoster: 'HOSTHAVOC',
      protocol: 'UDP',
      queryPortMode: 'MANUAL_OPTIONAL',
      preferA2s: true,
      notes: 'Baseline for HostHavoc external game server onboarding.'
    },
    {
      key: 'SURVIVAL_SERVERS_DEFAULT',
      name: 'Survival Servers Default',
      hoster: 'SURVIVAL_SERVERS',
      protocol: 'UDP',
      queryPortMode: 'MANUAL_OPTIONAL',
      preferA2s: true,
      notes: 'Baseline for Survival Servers game hosting.'
    }
  ];

  for (const preset of hosterPresets) {
    await pool.query(
      `INSERT INTO server_hoster_presets (
        id, \`key\`, name, hoster, protocol, query_port_mode, prefer_a2s, is_system, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        hoster = VALUES(hoster),
        protocol = VALUES(protocol),
        query_port_mode = VALUES(query_port_mode),
        prefer_a2s = VALUES(prefer_a2s),
        is_system = VALUES(is_system),
        notes = VALUES(notes),
        updated_at = VALUES(updated_at)`,
      [
        uuidv4(),
        preset.key,
        preset.name,
        preset.hoster,
        preset.protocol,
        preset.queryPortMode,
        preset.preferA2s ? 1 : 0,
        preset.notes,
        now,
        now
      ]
    );
  }

  logger.info('seed completed', { request_id: requestId }, { baseline_entities: ['roles', 'check_adapters', 'check_profiles', 'server_hoster_presets'] });
  await pool.end();
};

run().catch((error: unknown) => {
  const requestId = randomUUID();
  logger.error('seed failed', { request_id: requestId }, { error: String(error) });
  process.exitCode = 1;
});
