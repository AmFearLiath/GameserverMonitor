import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '@gm/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

let connection: mysql.Connection;

beforeAll(async () => {
  execSync('pnpm migrate', { cwd: packageRoot, stdio: 'pipe' });
  execSync('pnpm seed', { cwd: packageRoot, stdio: 'pipe' });

  connection = await mysql.createConnection({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    timezone: 'Z'
  });
});

afterAll(async () => {
  await connection.end();
});

describe('db migration + seed integration', () => {
  it('creates monitoring and alerting tables from migration 003', async () => {
    const [rows] = await connection.query<
      Array<{ table_name: string }>
    >(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = ?
          AND table_name IN (
            'check_adapters',
            'check_profiles',
            'server_checks_1m',
            'incidents',
            'alert_channels',
            'alert_policies',
            'alert_events'
          )
      `,
      [config.DB_NAME]
    );

    expect(rows).toHaveLength(7);
  });

  it('seeds default adapter and check profile', async () => {
    const [adapters] = await connection.query<Array<{ count: number }>>(
      `SELECT COUNT(*) AS count FROM check_adapters WHERE \`key\` = 'tcp_connect'`
    );
    const [profiles] = await connection.query<Array<{ count: number }>>(
      `SELECT COUNT(*) AS count FROM check_profiles WHERE name = 'default-tcp'`
    );

    expect(adapters[0]?.count ?? 0).toBeGreaterThan(0);
    expect(profiles[0]?.count ?? 0).toBeGreaterThan(0);
  });

  it('seeds alert channel and policy linkage', async () => {
    const [channel] = await connection.query<Array<{ count: number }>>(
      `SELECT COUNT(*) AS count FROM alert_channels WHERE name = 'Discord Ops'`
    );

    const [policyLink] = await connection.query<Array<{ count: number }>>(
      `
        SELECT COUNT(*) AS count
        FROM alert_policies p
        JOIN alert_channels c
          ON JSON_CONTAINS(p.channel_ids, JSON_QUOTE(c.id))
        WHERE p.name = 'default-status-policy'
          AND c.name = 'Discord Ops'
      `
    );

    expect(channel[0]?.count ?? 0).toBeGreaterThan(0);
    expect(policyLink[0]?.count ?? 0).toBeGreaterThan(0);
  });

  it('assigns default check profile to seeded servers', async () => {
    const [rows] = await connection.query<Array<{ count: number }>>(
      `SELECT COUNT(*) AS count FROM servers WHERE check_profile_id IS NOT NULL`
    );

    expect(rows[0]?.count ?? 0).toBeGreaterThan(0);
  });
});
